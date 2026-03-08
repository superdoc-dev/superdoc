"""
Platform helper methods for the Python SDK.

These are hand-written convenience wrappers that handle platform-specific
quirks when integrating SuperDoc tools with cloud AI platforms (Bedrock,
Vertex AI) and direct APIs (OpenAI, Anthropic). They are NOT generated
from the contract and will not be overwritten by codegen.

Usage::

    from superdoc import choose_tools, dispatch_superdoc_tool
    from superdoc.helpers.platform import sanitize_tool_schemas, format_tool_result, merge_discovered_tools

    # Vertex AI: strip unsupported JSON Schema keywords
    result = choose_tools(provider="generic")
    sanitized = sanitize_tool_schemas(result["tools"], "vertex")

    # Bedrock: format tool results in platform-native shape
    result = dispatch_superdoc_tool(client, name, args)
    formatted = format_tool_result(result, target="bedrock", tool_use_id=tool_use_id)

    # Merge discover_tools output into platform-native config
    merge_discovered_tools(tool_config, discover_result, provider="anthropic", target="bedrock")
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Literal, Optional, Set, Union

PlatformTarget = Literal["bedrock", "vertex"]
ResultTarget = Literal["bedrock", "vertex", "anthropic", "openai"]
ToolProvider = Literal["openai", "anthropic", "vercel", "generic"]

# JSON Schema keywords unsupported by each platform.
_UNSUPPORTED_KEYWORDS: Dict[PlatformTarget, Set[str]] = {
    "vertex": {"const"},
    "bedrock": set(),
}


# ------------------------------------------------------------------
#  sanitize_tool_schemas
# ------------------------------------------------------------------


def sanitize_tool_schemas(tools: List[Any], target: PlatformTarget) -> List[Any]:
    """Recursively strip JSON Schema keywords that the target platform doesn't support.

    Returns a new list — the original tools are not mutated.
    """
    blocked = _UNSUPPORTED_KEYWORDS.get(target)
    if not blocked:
        return tools
    return [_deep_strip_keys(t, blocked) for t in tools]


def _deep_strip_keys(obj: Any, blocked: Set[str]) -> Any:
    if isinstance(obj, list):
        return [_deep_strip_keys(item, blocked) for item in obj]
    if isinstance(obj, dict):
        return {k: _deep_strip_keys(v, blocked) for k, v in obj.items() if k not in blocked}
    return obj


# ------------------------------------------------------------------
#  format_tool_result
# ------------------------------------------------------------------


def format_tool_result(
    result: Any,
    *,
    target: ResultTarget,
    tool_use_id: Optional[str] = None,
    name: Optional[str] = None,
) -> Any:
    """Wrap a raw ``dispatch_superdoc_tool`` result in the platform-native shape."""
    if target == "bedrock":
        # Bedrock requires json content to be a plain dict
        json_result = result if isinstance(result, dict) else {"result": result}
        return {"toolResult": {"toolUseId": tool_use_id, "content": [{"json": json_result}]}}

    if target == "vertex":
        return {"functionResponse": {"name": name, "response": result}}

    if target == "anthropic":
        return {
            "type": "tool_result",
            "tool_use_id": tool_use_id,
            "content": json.dumps(result),
        }

    if target == "openai":
        return {
            "role": "tool",
            "tool_call_id": tool_use_id,
            "content": json.dumps(result),
        }

    return result


def format_tool_error(
    error: Union[Exception, str],
    *,
    target: ResultTarget,
    tool_use_id: Optional[str] = None,
    name: Optional[str] = None,
) -> Any:
    """Format an error from a failed tool call in the platform-native error shape."""
    message = str(error)

    if target == "bedrock":
        return {
            "toolResult": {
                "toolUseId": tool_use_id,
                "content": [{"text": f"Error: {message}"}],
                "status": "error",
            }
        }

    if target == "vertex":
        return {"functionResponse": {"name": name, "response": {"error": message}}}

    if target == "anthropic":
        return {
            "type": "tool_result",
            "tool_use_id": tool_use_id,
            "content": f"Error: {message}",
            "is_error": True,
        }

    if target == "openai":
        return {
            "role": "tool",
            "tool_call_id": tool_use_id,
            "content": f"Error: {message}",
        }

    return {"error": message}


# ------------------------------------------------------------------
#  merge_discovered_tools
# ------------------------------------------------------------------


def merge_discovered_tools(
    tool_config: Any,
    discover_result: Any,
    *,
    provider: ToolProvider,
    target: Optional[PlatformTarget] = None,
) -> int:
    """Extract newly discovered tools, convert to platform format, and merge into config.

    Mutates ``tool_config`` in place. Returns the number of new tools added.
    """
    new_tools = _extract_discovered_tools(discover_result)
    if not new_tools:
        return 0

    existing_names = _collect_existing_names(tool_config, target)
    added = 0

    for tool in new_tools:
        tool_name = _extract_tool_name(tool, provider)
        if not tool_name or tool_name in existing_names:
            continue
        existing_names.add(tool_name)

        formatted = _format_tool_for_config(tool, provider, target)
        _push_to_config(tool_config, formatted, target)
        added += 1

    return added


def _extract_discovered_tools(result: Any) -> List[Any]:
    if isinstance(result, dict) and isinstance(result.get("tools"), list):
        return result["tools"]
    return []


def _extract_tool_name(tool: Any, provider: ToolProvider) -> Optional[str]:
    if not isinstance(tool, dict):
        return None
    # Anthropic / Generic: top-level name
    if isinstance(tool.get("name"), str):
        return tool["name"]
    # OpenAI / Vercel: nested under function.name
    fn = tool.get("function")
    if isinstance(fn, dict) and isinstance(fn.get("name"), str):
        return fn["name"]
    return None


def _collect_existing_names(tool_config: Any, target: Optional[PlatformTarget]) -> Set[str]:
    names: Set[str] = set()

    if target == "bedrock" and isinstance(tool_config, dict):
        for t in tool_config.get("tools", []):
            spec = t.get("toolSpec", {}) if isinstance(t, dict) else {}
            if isinstance(spec.get("name"), str):
                names.add(spec["name"])
    elif target == "vertex" and isinstance(tool_config, list) and tool_config:
        decls = tool_config[0].get("functionDeclarations", []) if isinstance(tool_config[0], dict) else []
        for d in decls:
            if isinstance(d, dict) and isinstance(d.get("name"), str):
                names.add(d["name"])
    elif isinstance(tool_config, list):
        for t in tool_config:
            if isinstance(t, dict):
                if isinstance(t.get("name"), str):
                    names.add(t["name"])
                fn = t.get("function")
                if isinstance(fn, dict) and isinstance(fn.get("name"), str):
                    names.add(fn["name"])

    return names


def _format_tool_for_config(
    tool: Any, provider: ToolProvider, target: Optional[PlatformTarget]
) -> Any:
    if not isinstance(tool, dict):
        return tool

    if target == "bedrock":
        return {
            "toolSpec": {
                "name": tool.get("name"),
                "description": tool.get("description"),
                "inputSchema": {"json": tool.get("input_schema") or tool.get("parameters")},
            }
        }

    if target == "vertex":
        params = tool.get("parameters") or tool.get("input_schema")
        if params:
            params = _deep_strip_keys(params, _UNSUPPORTED_KEYWORDS["vertex"])
        return {
            "name": tool.get("name"),
            "description": tool.get("description"),
            "parameters": params,
        }

    return tool


def _push_to_config(tool_config: Any, formatted: Any, target: Optional[PlatformTarget]) -> None:
    if target == "bedrock" and isinstance(tool_config, dict):
        tools = tool_config.get("tools")
        if isinstance(tools, list):
            tools.append(formatted)
    elif target == "vertex" and isinstance(tool_config, list) and tool_config:
        decls = tool_config[0].get("functionDeclarations") if isinstance(tool_config[0], dict) else None
        if isinstance(decls, list):
            decls.append(formatted)
    elif isinstance(tool_config, list):
        tool_config.append(formatted)
