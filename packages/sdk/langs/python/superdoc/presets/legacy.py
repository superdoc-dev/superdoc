"""Legacy preset — wraps the existing codegen-emitted intent tools verbatim.

Mirrors ``packages/sdk/langs/node/src/presets/legacy.ts``. The legacy preset is
a read-through over the packaged tool artifacts in ``superdoc/tools/`` (catalog,
per-provider tool JSON, system prompts) and delegates dispatch to the
codegen-emitted ``dispatch_intent_tool``. It is the default preset returned
by ``choose_tools()`` when callers omit ``preset``.

Nothing in this file relocates or rewrites the packaged artifacts. The whole
point of the read-through wrapper is that running ``generate:all`` continues
to refresh the package assets in place; the legacy preset picks up the new
files on the next call.
"""

from __future__ import annotations

import inspect
import json
import re
from dataclasses import dataclass
from importlib import resources
from typing import Any, Awaitable, Dict, List, Optional, cast

from ..errors import SuperDocError
from ..tools.intent_dispatch_generated import dispatch_intent_tool
from . import ToolProvider

_PROVIDER_FILE: Dict[ToolProvider, str] = {
    'openai': 'tools.openai.json',
    'anthropic': 'tools.anthropic.json',
    'vercel': 'tools.vercel.json',
    'generic': 'tools.generic.json',
}


def _read_json_asset(name: str) -> Dict[str, Any]:
    resource = resources.files('superdoc').joinpath('tools', name)
    try:
        raw = resource.read_text(encoding='utf-8')
    except FileNotFoundError as error:
        raise SuperDocError(
            'Unable to load packaged tool artifact.',
            code='TOOLS_ASSET_NOT_FOUND',
            details={'file': name},
        ) from error
    except Exception as error:
        raise SuperDocError(
            'Unable to read packaged tool artifact.',
            code='TOOLS_ASSET_NOT_FOUND',
            details={'file': name, 'message': str(error)},
        ) from error

    try:
        parsed = json.loads(raw)
    except Exception as error:
        raise SuperDocError(
            'Packaged tool artifact is invalid JSON.',
            code='TOOLS_ASSET_INVALID',
            details={'file': name, 'message': str(error)},
        ) from error

    if not isinstance(parsed, dict):
        raise SuperDocError(
            'Packaged tool artifact root must be an object.',
            code='TOOLS_ASSET_INVALID',
            details={'file': name},
        )

    return cast(Dict[str, Any], parsed)


_catalog_cache: Optional[Dict[str, Any]] = None


def _get_catalog_cached() -> Dict[str, Any]:
    global _catalog_cache
    if _catalog_cache is None:
        _catalog_cache = _read_json_asset('catalog.json')
    return _catalog_cache


def _apply_cache_markers(
    tools: List[Any],
    provider: ToolProvider,
    cache_requested: bool,
) -> Dict[str, Any]:
    if not cache_requested:
        return {'tools': tools, 'cacheStrategy': 'disabled'}

    if provider == 'anthropic':
        if not tools:
            return {'tools': tools, 'cacheStrategy': 'explicit'}
        # Mark the LAST tool with cache_control — caches the entire tools block.
        next_tools = list(tools[:-1])
        last = dict(tools[-1]) if isinstance(tools[-1], dict) else tools[-1]
        if isinstance(last, dict):
            last['cache_control'] = {'type': 'ephemeral'}
        next_tools.append(last)
        return {'tools': next_tools, 'cacheStrategy': 'explicit'}

    if provider == 'openai':
        return {'tools': tools, 'cacheStrategy': 'automatic'}

    return {'tools': tools, 'cacheStrategy': 'unsupported'}


def _snake_case(token: str) -> str:
    token = re.sub(r'([A-Z]+)([A-Z][a-z])', r'\1_\2', token)
    token = re.sub(r'([a-z0-9])([A-Z])', r'\1_\2', token)
    return token.replace('-', '_').lower()


def _resolve_doc_method(document_handle: Any, operation_id: str) -> Any:
    cursor = document_handle
    for token in operation_id.split('.')[1:]:
        candidates = [token]
        snake_token = _snake_case(token)
        if snake_token != token:
            candidates.append(snake_token)

        resolved = None
        for candidate in candidates:
            if hasattr(cursor, candidate):
                resolved = getattr(cursor, candidate)
                break

        if resolved is None:
            raise SuperDocError(
                'No SDK doc method found for operation.',
                code='TOOL_DISPATCH_NOT_FOUND',
                details={'operationId': operation_id, 'token': token},
            )
        cursor = resolved

    if not callable(cursor):
        raise SuperDocError(
            'Resolved SDK doc member is not callable.',
            code='TOOL_DISPATCH_NOT_FOUND',
            details={'operationId': operation_id},
        )

    return cursor


def _legacy_get_tools(provider: ToolProvider, *, cache: bool = False) -> Dict[str, Any]:
    if provider not in ('openai', 'anthropic', 'vercel', 'generic'):
        raise SuperDocError('provider is required.', code='INVALID_ARGUMENT', details={'provider': provider})
    provider_file = _read_json_asset(_PROVIDER_FILE[provider])
    tools = provider_file.get('tools')
    # Fail fast on malformed provider artifacts so agents don't silently boot
    # with zero tools. Matches the Node legacy preset's behavior and the
    # pre-presets contract of the public list_tools path.
    if not isinstance(tools, list):
        raise SuperDocError(
            'Tool provider bundle is missing tools array.',
            code='TOOLS_ASSET_INVALID',
            details={'provider': provider},
        )
    return _apply_cache_markers(cast(List[Any], tools), provider, cache)


def _legacy_get_catalog() -> Dict[str, Any]:
    return _get_catalog_cached()


def _legacy_get_system_prompt() -> str:
    resource = resources.files('superdoc').joinpath('tools', 'system-prompt.md')
    try:
        return resource.read_text(encoding='utf-8')
    except FileNotFoundError as error:
        raise SuperDocError(
            'System prompt not found.',
            code='TOOLS_ASSET_NOT_FOUND',
            details={'file': 'system-prompt.md'},
        ) from error


def _legacy_get_mcp_prompt() -> str:
    resource = resources.files('superdoc').joinpath('tools', 'system-prompt-mcp.md')
    try:
        return resource.read_text(encoding='utf-8')
    except FileNotFoundError as error:
        raise SuperDocError(
            'MCP system prompt not found.',
            code='TOOLS_ASSET_NOT_FOUND',
            details={'file': 'system-prompt-mcp.md'},
        ) from error


def _legacy_dispatch(
    document_handle: Any,
    tool_name: str,
    args: Optional[Dict[str, Any]] = None,
    invoke_options: Optional[Dict[str, Any]] = None,
) -> Any:
    payload = args or {}
    if not isinstance(payload, dict):
        raise SuperDocError(
            'Tool arguments must be an object.',
            code='INVALID_ARGUMENT',
            details={'toolName': tool_name},
        )

    payload = {k: v for k, v in payload.items() if k not in ('doc', 'sessionId')}

    def execute(operation_id: str, input_args: Dict[str, Any]) -> Any:
        method = _resolve_doc_method(document_handle, operation_id)
        if inspect.iscoroutinefunction(method):
            raise SuperDocError(
                'legacy.dispatch cannot call async methods. Use dispatch_async.',
                code='INVALID_ARGUMENT',
                details={'toolName': tool_name, 'operationId': operation_id},
            )
        kwargs = dict(invoke_options or {})
        return method(input_args, **kwargs)

    return dispatch_intent_tool(tool_name, payload, execute)


async def _legacy_dispatch_async(
    document_handle: Any,
    tool_name: str,
    args: Optional[Dict[str, Any]] = None,
    invoke_options: Optional[Dict[str, Any]] = None,
) -> Any:
    payload = args or {}
    if not isinstance(payload, dict):
        raise SuperDocError(
            'Tool arguments must be an object.',
            code='INVALID_ARGUMENT',
            details={'toolName': tool_name},
        )

    payload = {k: v for k, v in payload.items() if k not in ('doc', 'sessionId')}

    def execute(operation_id: str, input_args: Dict[str, Any]) -> Any:
        method = _resolve_doc_method(document_handle, operation_id)
        kwargs = dict(invoke_options or {})
        return method(input_args, **kwargs)

    result = dispatch_intent_tool(tool_name, payload, execute)
    if inspect.isawaitable(result):
        return await result
    return result


@dataclass(frozen=True)
class _LegacyPreset:
    id: str = 'legacy'
    description: str = (
        'Codegen-emitted intent tools (default). Wraps superdoc/tools/ artifacts verbatim.'
    )
    supports_cache_control: bool = True

    def get_tools(self, provider: ToolProvider, *, cache: bool = False, **_ignored: Any) -> Dict[str, Any]:
        # `exclude_actions` is a core-preset option; legacy has no action
        # surface and ignores it (mirrors the Node legacy preset).
        return _legacy_get_tools(provider, cache=cache)

    def get_catalog(self) -> Dict[str, Any]:
        return _legacy_get_catalog()

    def get_system_prompt(self, **_ignored: Any) -> str:
        # Exclusion options are core-preset features; legacy's prompt has no
        # per-action lines to filter (mirrors the Node legacy preset).
        return _legacy_get_system_prompt()

    def get_mcp_prompt(self) -> str:
        return _legacy_get_mcp_prompt()

    def dispatch(
        self,
        document_handle: Any,
        tool_name: str,
        args: Optional[Dict[str, Any]] = None,
        invoke_options: Optional[Dict[str, Any]] = None,
        **_ignored: Any,
    ) -> Any:
        # `exclude_actions` is a core-preset option; legacy ignores it
        # (mirrors the Node legacy preset).
        return _legacy_dispatch(document_handle, tool_name, args, invoke_options)

    def dispatch_async(
        self,
        document_handle: Any,
        tool_name: str,
        args: Optional[Dict[str, Any]] = None,
        invoke_options: Optional[Dict[str, Any]] = None,
        **_ignored: Any,
    ) -> Awaitable[Any]:
        return _legacy_dispatch_async(document_handle, tool_name, args, invoke_options)


legacy_preset: _LegacyPreset = _LegacyPreset()
