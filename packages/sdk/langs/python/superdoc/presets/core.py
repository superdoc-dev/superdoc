"""Core preset (Python) — thin proxy over the Node SDK preset registry.

Unlike :mod:`superdoc.presets.legacy`, which reads packaged tool artifacts and
dispatches by traversing the local Python doc handle, the ``core`` preset has
NO bundled assets and NO action ports. Every call is forwarded to the running
SuperDoc CLI host (the same subprocess the rest of the Python SDK already
talks to) via six dedicated CLI-only operations:

    doc.preset.list           → {presets, defaultPreset}
    doc.preset.getCatalog     → preset.getCatalog()
    doc.preset.getTools       → preset.getTools(provider, {cache})
    doc.preset.getSystemPrompt → preset.getSystemPrompt()
    doc.preset.getMcpPrompt   → preset.getMcpPrompt()
    doc.preset.dispatch       → preset.dispatch(boundDoc, toolName, args)

For ``dispatch``, the document handle's session-bound runtime is reused so the
CLI op resolves to the same open editor; for the other five (session-less)
ops, a fresh sync runtime is spun up per call.

Cross-runtime contract: the CLI host runs the Node SDK preset, so behavior —
catalog shape, prompt content, action receipts — is byte-for-byte identical
between Python ``preset='core'`` and Node ``preset: 'core'``.
"""

from __future__ import annotations

import inspect
from dataclasses import dataclass
from typing import Any, Awaitable, Dict, Optional, cast

from ..errors import SuperDocError
from ..runtime import SuperDocAsyncRuntime, SuperDocSyncRuntime
from . import ToolProvider


# ---------------------------------------------------------------------------
# Runtime resolution
# ---------------------------------------------------------------------------


def _stateless_runtime() -> SuperDocSyncRuntime:
    """Spawn a one-shot sync runtime for session-less preset reads."""
    return SuperDocSyncRuntime()


def _runtime_from_handle(document_handle: Any) -> Any:
    """Pull the session-bound runtime off a SuperDocDocument-shaped handle.

    The Python client wraps the raw transport runtime with a
    ``_BoundSyncRuntime`` / ``_BoundAsyncRuntime`` that injects ``sessionId``
    into every invoke. We need exactly that wrapper so ``doc.preset.dispatch``
    lands on the right session in the CLI host.
    """
    bound = getattr(document_handle, '_bound_runtime', None)
    if bound is None or not hasattr(bound, 'invoke'):
        raise SuperDocError(
            'core preset: document_handle must be a session-bound SuperDocDocument '
            '(missing _bound_runtime.invoke). Did you pass the raw client by mistake?',
            code='TOOL_DISPATCH_NOT_FOUND',
            details={'preset': 'core'},
        )
    return bound


# ---------------------------------------------------------------------------
# Response unwrapping — extract envelope.data from CLI responses
# ---------------------------------------------------------------------------


def _unwrap(response: Any) -> Dict[str, Any]:
    """Normalize a CLI response into a plain ``dict`` payload.

    The Python transport already strips the JSON-RPC envelope so most reads
    return the operation's ``data`` directly. We still defensively unwrap a
    ``{ data: ... }`` shape and verify the result is dict-like — every
    ``doc.preset.*`` op declares a JSON object output.
    """
    if isinstance(response, dict) and 'data' in response and len(response) == 1:
        response = response['data']
    if not isinstance(response, dict):
        raise SuperDocError(
            'core preset: CLI returned a non-object response.',
            code='TOOLS_ASSET_INVALID',
            details={'response_type': type(response).__name__},
        )
    return cast(Dict[str, Any], response)


# ---------------------------------------------------------------------------
# Cache markers — mirrors Node corePreset.applyCacheMarkers
# ---------------------------------------------------------------------------


def _apply_cache_markers(tools: list, provider: ToolProvider, cache_requested: bool) -> Dict[str, Any]:
    if not cache_requested:
        return {'tools': tools, 'cacheStrategy': 'disabled'}
    if provider == 'anthropic':
        if not tools:
            return {'tools': tools, 'cacheStrategy': 'explicit'}
        next_tools = list(tools[:-1])
        last = dict(tools[-1]) if isinstance(tools[-1], dict) else tools[-1]
        if isinstance(last, dict):
            last['cache_control'] = {'type': 'ephemeral'}
        next_tools.append(last)
        return {'tools': next_tools, 'cacheStrategy': 'explicit'}
    if provider == 'openai':
        return {'tools': tools, 'cacheStrategy': 'automatic'}
    return {'tools': tools, 'cacheStrategy': 'unsupported'}


# ---------------------------------------------------------------------------
# Session-less reads — fresh sync runtime per call
# ---------------------------------------------------------------------------


def _core_get_catalog() -> Dict[str, Any]:
    runtime = _stateless_runtime()
    try:
        return _unwrap(runtime.invoke('doc.preset.getCatalog', {'preset': 'core'}))
    finally:
        runtime.dispose()


def _core_get_tools(
    provider: ToolProvider,
    *,
    cache: bool = False,
    exclude_actions: Optional[list] = None,
) -> Dict[str, Any]:
    if provider not in ('openai', 'anthropic', 'vercel', 'generic'):
        raise SuperDocError(
            'provider is required.',
            code='INVALID_ARGUMENT',
            details={'provider': provider},
        )
    payload: Dict[str, Any] = {'preset': 'core', 'provider': provider, 'cache': False}
    # Exclusions travel as comma-separated strings — the CLI op accepts one
    # plain string on both the flag and JSON-RPC paths; names contain no commas.
    if exclude_actions:
        payload['excludeActions'] = ','.join(str(name) for name in exclude_actions)
    runtime = _stateless_runtime()
    try:
        # We always request cache=False from the host and apply markers locally:
        # the CLI host's getTools response goes through JSON-RPC and we want a
        # single deterministic implementation of provider cache markers.
        result = _unwrap(runtime.invoke('doc.preset.getTools', payload))
    finally:
        runtime.dispose()
    tools = result.get('tools') if isinstance(result.get('tools'), list) else []
    return _apply_cache_markers(cast(list, tools), provider, cache)


def _core_get_system_prompt(
    *,
    exclude_actions: Optional[list] = None,
) -> str:
    payload: Dict[str, Any] = {'preset': 'core'}
    if exclude_actions:
        payload['excludeActions'] = ','.join(str(name) for name in exclude_actions)
    runtime = _stateless_runtime()
    try:
        result = _unwrap(runtime.invoke('doc.preset.getSystemPrompt', payload))
    finally:
        runtime.dispose()
    prompt = result.get('prompt')
    if not isinstance(prompt, str):
        raise SuperDocError(
            'core preset: getSystemPrompt response missing string prompt.',
            code='TOOLS_ASSET_INVALID',
            details={'preset': 'core'},
        )
    return prompt


def _core_get_mcp_prompt() -> str:
    runtime = _stateless_runtime()
    try:
        result = _unwrap(runtime.invoke('doc.preset.getMcpPrompt', {'preset': 'core'}))
    finally:
        runtime.dispose()
    prompt = result.get('prompt')
    if not isinstance(prompt, str):
        raise SuperDocError(
            'core preset: getMcpPrompt response missing string prompt.',
            code='TOOLS_ASSET_INVALID',
            details={'preset': 'core'},
        )
    return prompt


# ---------------------------------------------------------------------------
# Dispatch — reuse the document handle's session-bound runtime
# ---------------------------------------------------------------------------


def _core_dispatch(
    document_handle: Any,
    tool_name: str,
    args: Optional[Dict[str, Any]] = None,
    invoke_options: Optional[Dict[str, Any]] = None,
    *,
    exclude_actions: Optional[list] = None,
) -> Any:
    if args is not None and not isinstance(args, dict):
        raise SuperDocError(
            'Tool arguments must be an object.',
            code='INVALID_ARGUMENT',
            details={'toolName': tool_name},
        )
    payload: Dict[str, Any] = {
        'preset': 'core',
        'toolName': tool_name,
        'args': args or {},
    }
    # Defense-in-depth parity with Node: a host that narrowed the advertised
    # surface can pass the same exclusions so dispatch refuses excluded calls.
    if exclude_actions:
        payload['excludeActions'] = ','.join(str(name) for name in exclude_actions)
    runtime = _runtime_from_handle(document_handle)
    invoke_kwargs = dict(invoke_options or {})
    raw = runtime.invoke('doc.preset.dispatch', payload, **invoke_kwargs)
    # When called against the async client, the bound runtime returns an
    # awaitable. dispatch() (sync) cannot await it; surface the misuse rather
    # than block.
    if inspect.isawaitable(raw):
        raise SuperDocError(
            'core preset: dispatch() received an awaitable from the async runtime. '
            'Use dispatch_superdoc_tool_async (or the descriptor.dispatch_async) '
            'with AsyncSuperDocDocument handles.',
            code='INVALID_ARGUMENT',
            details={'preset': 'core', 'toolName': tool_name},
        )
    return _unwrap(raw).get('result')


async def _core_dispatch_async(
    document_handle: Any,
    tool_name: str,
    args: Optional[Dict[str, Any]] = None,
    invoke_options: Optional[Dict[str, Any]] = None,
    *,
    exclude_actions: Optional[list] = None,
) -> Any:
    if args is not None and not isinstance(args, dict):
        raise SuperDocError(
            'Tool arguments must be an object.',
            code='INVALID_ARGUMENT',
            details={'toolName': tool_name},
        )
    payload: Dict[str, Any] = {
        'preset': 'core',
        'toolName': tool_name,
        'args': args or {},
    }
    if exclude_actions:
        payload['excludeActions'] = ','.join(str(name) for name in exclude_actions)
    runtime = _runtime_from_handle(document_handle)
    invoke_kwargs = dict(invoke_options or {})
    raw = runtime.invoke('doc.preset.dispatch', payload, **invoke_kwargs)
    if inspect.isawaitable(raw):
        raw = await raw
    return _unwrap(raw).get('result')


# ---------------------------------------------------------------------------
# Descriptor
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class _CorePreset:
    id: str = 'core'
    description: str = (
        'Actions-only LLM surface proxied to the Node SDK preset registry via CLI. '
        'No bundled assets in Python; all calls go through the SuperDoc CLI host.'
    )
    supports_cache_control: bool = True

    def get_tools(
        self,
        provider: ToolProvider,
        *,
        cache: bool = False,
        exclude_actions: Optional[list] = None,
    ) -> Dict[str, Any]:
        return _core_get_tools(provider, cache=cache, exclude_actions=exclude_actions)

    def get_catalog(self) -> Dict[str, Any]:
        return _core_get_catalog()

    def get_system_prompt(
        self,
        *,
        exclude_actions: Optional[list] = None,
    ) -> str:
        return _core_get_system_prompt(exclude_actions=exclude_actions)

    def get_mcp_prompt(self) -> str:
        return _core_get_mcp_prompt()

    def dispatch(
        self,
        document_handle: Any,
        tool_name: str,
        args: Optional[Dict[str, Any]] = None,
        invoke_options: Optional[Dict[str, Any]] = None,
        *,
        exclude_actions: Optional[list] = None,
    ) -> Any:
        return _core_dispatch(
            document_handle, tool_name, args, invoke_options,
            exclude_actions=exclude_actions,
        )

    def dispatch_async(
        self,
        document_handle: Any,
        tool_name: str,
        args: Optional[Dict[str, Any]] = None,
        invoke_options: Optional[Dict[str, Any]] = None,
        *,
        exclude_actions: Optional[list] = None,
    ) -> Awaitable[Any]:
        return _core_dispatch_async(
            document_handle, tool_name, args, invoke_options,
            exclude_actions=exclude_actions,
        )


core_preset: _CorePreset = _CorePreset()
