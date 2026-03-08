"""Tests for platform helpers (sanitize, format, merge)."""

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from superdoc.helpers.platform import (
    format_tool_error,
    format_tool_result,
    merge_discovered_tools,
    sanitize_tool_schemas,
)


# ------------------------------------------------------------------
#  sanitize_tool_schemas
# ------------------------------------------------------------------


class TestSanitizeToolSchemas:
    def test_strips_const_for_vertex(self):
        tools = [
            {
                "name": "query_match",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "matchKind": {"const": "text"},
                        "query": {"type": "string"},
                    },
                },
            }
        ]

        result = sanitize_tool_schemas(tools, "vertex")

        assert result[0]["parameters"]["properties"]["matchKind"] == {}
        assert result[0]["parameters"]["properties"]["query"] == {"type": "string"}

    def test_strips_const_recursively(self):
        tools = [
            {
                "name": "test",
                "parameters": {
                    "oneOf": [
                        {"properties": {"kind": {"const": "a"}, "value": {"type": "string"}}},
                        {"properties": {"kind": {"const": "b"}, "value": {"type": "number"}}},
                    ]
                },
            }
        ]

        result = sanitize_tool_schemas(tools, "vertex")

        assert result[0]["parameters"]["oneOf"][0]["properties"]["kind"] == {}
        assert result[0]["parameters"]["oneOf"][1]["properties"]["kind"] == {}

    def test_does_not_mutate_original(self):
        tools = [{"name": "test", "parameters": {"properties": {"x": {"const": "a"}}}}]
        original = json.dumps(tools)

        sanitize_tool_schemas(tools, "vertex")

        assert json.dumps(tools) == original

    def test_noop_for_bedrock(self):
        tools = [{"name": "test", "parameters": {"properties": {"x": {"const": "a"}}}}]
        result = sanitize_tool_schemas(tools, "bedrock")
        assert result is tools

    def test_empty_array(self):
        assert sanitize_tool_schemas([], "vertex") == []


# ------------------------------------------------------------------
#  format_tool_result
# ------------------------------------------------------------------


class TestFormatToolResult:
    def test_bedrock_object_result(self):
        result = format_tool_result({"text": "hello"}, target="bedrock", tool_use_id="tu-1")
        assert result == {
            "toolResult": {"toolUseId": "tu-1", "content": [{"json": {"text": "hello"}}]}
        }

    def test_bedrock_array_result_wrapped(self):
        result = format_tool_result([1, 2, 3], target="bedrock", tool_use_id="tu-1")
        assert result == {
            "toolResult": {"toolUseId": "tu-1", "content": [{"json": {"result": [1, 2, 3]}}]}
        }

    def test_bedrock_string_result_wrapped(self):
        result = format_tool_result("hello", target="bedrock", tool_use_id="tu-1")
        assert result == {
            "toolResult": {"toolUseId": "tu-1", "content": [{"json": {"result": "hello"}}]}
        }

    def test_bedrock_none_result_wrapped(self):
        result = format_tool_result(None, target="bedrock", tool_use_id="tu-1")
        assert result == {
            "toolResult": {"toolUseId": "tu-1", "content": [{"json": {"result": None}}]}
        }

    def test_vertex_result(self):
        result = format_tool_result({"data": 1}, target="vertex", name="get_text")
        assert result == {"functionResponse": {"name": "get_text", "response": {"data": 1}}}

    def test_anthropic_result(self):
        result = format_tool_result({"ok": True}, target="anthropic", tool_use_id="tu-1")
        assert result == {
            "type": "tool_result",
            "tool_use_id": "tu-1",
            "content": '{"ok": true}',
        }

    def test_openai_result(self):
        result = format_tool_result({"ok": True}, target="openai", tool_use_id="call-1", name="fn")
        assert result == {
            "role": "tool",
            "tool_call_id": "call-1",
            "content": '{"ok": true}',
        }


# ------------------------------------------------------------------
#  format_tool_error
# ------------------------------------------------------------------


class TestFormatToolError:
    def test_bedrock_error(self):
        result = format_tool_error(Exception("boom"), target="bedrock", tool_use_id="tu-1")
        assert result == {
            "toolResult": {
                "toolUseId": "tu-1",
                "content": [{"text": "Error: boom"}],
                "status": "error",
            }
        }

    def test_vertex_error(self):
        result = format_tool_error("fail", target="vertex", name="fn")
        assert result == {"functionResponse": {"name": "fn", "response": {"error": "fail"}}}

    def test_anthropic_error(self):
        result = format_tool_error(Exception("nope"), target="anthropic", tool_use_id="tu-1")
        assert result == {
            "type": "tool_result",
            "tool_use_id": "tu-1",
            "content": "Error: nope",
            "is_error": True,
        }

    def test_openai_error(self):
        result = format_tool_error(Exception("bad"), target="openai", tool_use_id="call-1")
        assert result == {"role": "tool", "tool_call_id": "call-1", "content": "Error: bad"}


# ------------------------------------------------------------------
#  merge_discovered_tools
# ------------------------------------------------------------------


class TestMergeDiscoveredTools:
    anthropic_tools = [
        {"name": "add_comment", "description": "Add a comment", "input_schema": {"type": "object"}},
        {"name": "format_bold", "description": "Bold text", "input_schema": {"type": "object"}},
    ]

    generic_tools = [
        {
            "name": "add_comment",
            "description": "Add a comment",
            "parameters": {"type": "object", "properties": {"kind": {"const": "inline"}}},
        },
        {"name": "format_bold", "description": "Bold text", "parameters": {"type": "object"}},
    ]

    def test_bedrock_merge(self):
        tool_config = {
            "tools": [{"toolSpec": {"name": "existing", "description": "x", "inputSchema": {"json": {}}}}]
        }
        result = {"tools": self.anthropic_tools}

        count = merge_discovered_tools(tool_config, result, provider="anthropic", target="bedrock")

        assert count == 2
        assert len(tool_config["tools"]) == 3
        assert tool_config["tools"][1] == {
            "toolSpec": {
                "name": "add_comment",
                "description": "Add a comment",
                "inputSchema": {"json": {"type": "object"}},
            }
        }

    def test_bedrock_skips_duplicates(self):
        tool_config = {
            "tools": [{"toolSpec": {"name": "add_comment", "description": "x", "inputSchema": {"json": {}}}}]
        }
        result = {"tools": self.anthropic_tools}

        count = merge_discovered_tools(tool_config, result, provider="anthropic", target="bedrock")

        assert count == 1
        assert len(tool_config["tools"]) == 2

    def test_vertex_merge_sanitizes_schemas(self):
        tool_config = [{"functionDeclarations": [{"name": "existing", "description": "x", "parameters": {}}]}]
        result = {"tools": self.generic_tools}

        count = merge_discovered_tools(tool_config, result, provider="generic", target="vertex")

        assert count == 2
        assert len(tool_config[0]["functionDeclarations"]) == 3
        add_comment = tool_config[0]["functionDeclarations"][1]
        assert '"const"' not in json.dumps(add_comment)

    def test_plain_array_merge(self):
        tool_config = [{"name": "existing", "description": "x", "input_schema": {}}]
        result = {"tools": self.anthropic_tools}

        count = merge_discovered_tools(tool_config, result, provider="anthropic")

        assert count == 2
        assert len(tool_config) == 3

    def test_empty_discover_result(self):
        tool_config = {"tools": []}
        count = merge_discovered_tools(tool_config, {}, provider="anthropic", target="bedrock")
        assert count == 0

    def test_non_object_discover_result(self):
        tool_config = {"tools": []}
        count = merge_discovered_tools(tool_config, "not an object", provider="anthropic", target="bedrock")
        assert count == 0

    def test_none_discover_result(self):
        tool_config = {"tools": []}
        count = merge_discovered_tools(tool_config, None, provider="anthropic", target="bedrock")
        assert count == 0
