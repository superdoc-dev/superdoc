"""Public LLM-tools API (Python SDK). Thin layer over the preset registry.

Every call here resolves a preset (defaulting to ``legacy`` for backwards
compat) and delegates to it. Mirrors ``packages/sdk/langs/node/src/tools.ts``.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, TypedDict, cast

from .presets import (
    DEFAULT_PRESET,
    ToolProvider,
    get_preset,
    list_presets,
    register_preset,
    unregister_preset,
)
from .errors import SuperDocError

__all__ = [
    'DEFAULT_PRESET',
    'ToolChooserInput',
    'ToolProvider',
    'choose_tools',
    'create_agent_toolkit',
    'dispatch_superdoc_tool',
    'dispatch_superdoc_tool_async',
    'get_preset',
    'get_mcp_prompt',
    'get_system_prompt',
    'get_tool_catalog',
    'list_presets',
    'list_tools',
    'register_preset',
    'unregister_preset',
]


class ToolChooserInput(TypedDict, total=False):
    provider: ToolProvider
    # Preset ID to load tools from. Defaults to DEFAULT_PRESET ('legacy')
    # for backwards compatibility. Use list_presets() to discover presets.
    preset: str
    # When True, applies provider-specific prompt-cache markers (Anthropic
    # ``cache_control: { type: "ephemeral" }`` on the last tool, etc).
    cache: bool
    # Action names to REMOVE from the advertised action surface (core preset:
    # the superdoc_perform_action enum/description/args shrink together).
    # Unknown names fail. Presets without an action surface ignore it.
    excludeActions: List[str]


def get_tool_catalog(preset: Optional[str] = None) -> Dict[str, Any]:
    """Return the full tool catalog for a preset (default: legacy)."""
    return get_preset(preset).get_catalog()


def list_tools(provider: ToolProvider, preset: Optional[str] = None) -> List[Dict[str, Any]]:
    """Return the raw tool array for a provider from a preset (default: legacy).

    No cache markers applied. Use :func:`choose_tools` for cache markers and metadata.
    """
    if provider not in ('openai', 'anthropic', 'vercel', 'generic'):
        raise SuperDocError(
            'provider is required.',
            code='INVALID_ARGUMENT',
            details={'provider': provider},
        )
    result = get_preset(preset).get_tools(provider, cache=False)
    tools = result.get('tools') if isinstance(result.get('tools'), list) else []
    return cast(List[Dict[str, Any]], tools)


def choose_tools(input: ToolChooserInput) -> Dict[str, Any]:
    """Select tools for a specific provider from a preset.

    Example::

        # Default — legacy preset.
        result = choose_tools({'provider': 'openai'})

        # Pick a specific preset.
        result = choose_tools({'provider': 'anthropic', 'preset': 'legacy', 'cache': True})
    """
    provider = input.get('provider')
    if provider not in ('openai', 'anthropic', 'vercel', 'generic'):
        raise SuperDocError(
            'provider is required.',
            code='INVALID_ARGUMENT',
            details={'provider': provider},
        )

    # Default only when `preset` is absent. An explicit empty string is passed
    # through to get_preset() so it raises PRESET_NOT_FOUND, matching Node/MCP
    # fail-fast behavior. Using `or DEFAULT_PRESET` would silently treat
    # `preset: ''` as legacy and hide misconfiguration.
    preset_arg = input.get('preset')
    preset_id = preset_arg if preset_arg is not None else DEFAULT_PRESET
    cache_requested = bool(input.get('cache'))

    preset = get_preset(preset_id)
    # Core-preset exclusion knobs (Node parity: chooseTools({excludeActions,...})).
    # Only forwarded when provided so third-party preset descriptors whose
    # get_tools() lacks the kwargs keep working unchanged.
    extra_kwargs: Dict[str, Any] = {}
    exclude_actions = input.get('excludeActions') or input.get('exclude_actions')
    if exclude_actions:
        extra_kwargs['exclude_actions'] = list(exclude_actions)
    result = preset.get_tools(cast(ToolProvider, provider), cache=cache_requested, **extra_kwargs)
    tools = result.get('tools') if isinstance(result.get('tools'), list) else []
    cache_strategy = result.get('cacheStrategy', 'disabled')

    return {
        'tools': tools,
        'meta': {
            'provider': provider,
            'preset': preset_id,
            'toolCount': len(tools) if isinstance(tools, list) else 0,
            'cacheStrategy': cache_strategy,
        },
    }


def dispatch_superdoc_tool(
    document_handle: Any,
    tool_name: str,
    args: Optional[Dict[str, Any]] = None,
    invoke_options: Optional[Dict[str, Any]] = None,
    *,
    preset: Optional[str] = None,
    exclude_actions: Optional[List[str]] = None,
) -> Any:
    """Dispatch a tool call against a bound document handle.

    ``preset`` selects the LLM-tools preset (defaults to :data:`DEFAULT_PRESET`,
    currently ``'legacy'``). Pass ``preset='core'`` to route through the
    actions-only core LLM surface proxied to the Node SDK over the CLI.

    ``exclude_actions`` mirrors :func:`choose_tools`: pass the SAME exclusions
    so the dispatch guard refuses actions the narrowed tool surface cannot
    call (core preset; legacy ignores it).

    The handle injects session targeting automatically; arguments should not
    contain ``doc`` or ``sessionId`` — those are stripped if present.
    """
    return get_preset(preset).dispatch(
        document_handle, tool_name, args, invoke_options,
        exclude_actions=list(exclude_actions) if exclude_actions else None,
    )


async def dispatch_superdoc_tool_async(
    document_handle: Any,
    tool_name: str,
    args: Optional[Dict[str, Any]] = None,
    invoke_options: Optional[Dict[str, Any]] = None,
    *,
    preset: Optional[str] = None,
    exclude_actions: Optional[List[str]] = None,
) -> Any:
    """Async version of :func:`dispatch_superdoc_tool`."""
    return await get_preset(preset).dispatch_async(
        document_handle, tool_name, args, invoke_options,
        exclude_actions=list(exclude_actions) if exclude_actions else None,
    )


def create_agent_toolkit(
    input: Dict[str, Any],
) -> Dict[str, Any]:
    """One-call agent surface: tools, system prompt, and pre-bound dispatchers
    that are coherent BY CONSTRUCTION — the same preset and ``excludeActions``
    apply to all three, so an action can never linger in the system prompt
    after being excluded from the tool array (or vice versa).

    Mirrors the Node SDK's ``createAgentToolkit``. Returns a dict with
    ``tools``, ``meta``, ``system_prompt``, ``dispatch`` and
    ``dispatch_async`` (both pre-bound to the preset + exclusions).

    The legacy preset ignores exclusion options everywhere (it has no action
    surface); passing ``excludeActions`` with ``preset='legacy'`` is a no-op.
    """
    preset_arg = input.get('preset')
    preset = preset_arg if preset_arg is not None else DEFAULT_PRESET
    exclude_actions = list(input.get('excludeActions') or input.get('exclude_actions') or []) or None

    # One-call custom-actions path: hand your actions to the toolkit and use it.
    # Build an ephemeral extended/composed preset over `base` (default 'core')
    # and drive it directly — no register_preset, no preset id to thread through
    # dispatch. Advanced callers can still extend_preset/compose_preset + preset.
    actions = input.get('actions') or []
    include_core = input.get('includeCoreActions')
    if include_core is None:
        include_core = input.get('include_core_actions')
    if actions or include_core is not None:
        from .presets.custom import extend_preset, compose_preset  # lazy: avoid import cycle
        provider = input.get('provider')
        # Validate provider up front (parity with choose_tools) — the actions
        # path builds tools directly, so it must not skip this check.
        if provider not in ('openai', 'anthropic', 'vercel', 'generic'):
            raise SuperDocError('provider is required.', code='INVALID_ARGUMENT', details={'provider': provider})
        # `preset` doubles as the base to extend here; `base` wins if both given.
        base_arg = input.get('base')
        base_id = base_arg if base_arg is not None else (preset_arg if preset_arg is not None else 'core')
        if include_core is not None:
            descriptor = compose_preset(id='custom_superdoc_preset', base_id=base_id,
                                        include_core_actions=include_core, actions=actions)
        else:
            descriptor = extend_preset(base_id, id='custom_superdoc_preset', actions=actions)
        tools_res = descriptor.get_tools(provider, cache=bool(input.get('cache')),
                                         exclude_actions=exclude_actions)
        tools = tools_res.get('tools') if isinstance(tools_res.get('tools'), list) else []
        sys_prompt = descriptor.get_system_prompt(exclude_actions=exclude_actions)

        def _dispatch(document_handle: Any, tool_name: str,
                      args: Optional[Dict[str, Any]] = None,
                      invoke_options: Optional[Dict[str, Any]] = None) -> Any:
            return descriptor.dispatch(document_handle, tool_name, args, invoke_options,
                                       exclude_actions=exclude_actions)

        async def _dispatch_async(document_handle: Any, tool_name: str,
                                  args: Optional[Dict[str, Any]] = None,
                                  invoke_options: Optional[Dict[str, Any]] = None) -> Any:
            return await descriptor.dispatch_async(document_handle, tool_name, args, invoke_options,
                                                   exclude_actions=exclude_actions)

        return {
            'tools': tools,
            'meta': {
                'provider': provider,
                'preset': descriptor.id,
                'toolCount': len(tools),
                'cacheStrategy': tools_res.get('cacheStrategy', 'disabled'),
            },
            'system_prompt': sys_prompt,
            'dispatch': _dispatch,
            'dispatch_async': _dispatch_async,
        }

    chosen = choose_tools({**input, 'preset': preset})
    system_prompt = (
        get_system_prompt(preset, exclude_actions=exclude_actions)
        if exclude_actions
        else get_system_prompt(preset)
    )

    def dispatch(document_handle: Any, tool_name: str,
                 args: Optional[Dict[str, Any]] = None,
                 invoke_options: Optional[Dict[str, Any]] = None) -> Any:
        return dispatch_superdoc_tool(
            document_handle, tool_name, args, invoke_options,
            preset=preset, exclude_actions=exclude_actions,
        )

    async def dispatch_async(document_handle: Any, tool_name: str,
                             args: Optional[Dict[str, Any]] = None,
                             invoke_options: Optional[Dict[str, Any]] = None) -> Any:
        return await dispatch_superdoc_tool_async(
            document_handle, tool_name, args, invoke_options,
            preset=preset, exclude_actions=exclude_actions,
        )

    return {
        'tools': chosen['tools'],
        'meta': chosen['meta'],
        'system_prompt': system_prompt,
        'dispatch': dispatch,
        'dispatch_async': dispatch_async,
    }


def get_system_prompt(
    preset: Optional[str] = None,
    *,
    exclude_actions: Optional[List[str]] = None,
) -> str:
    """Read the packaged SDK system prompt (default preset: legacy).

    Includes a persona preamble suitable for embedded LLM usage. For MCP
    server instructions, use :func:`get_mcp_prompt` instead.

    ``exclude_actions`` mirrors ``choose_tools``: pass the SAME exclusions so
    the prompt stops documenting actions the narrowed tool surface cannot
    call (core preset; legacy ignores it).
    """
    if exclude_actions:
        return get_preset(preset).get_system_prompt(exclude_actions=list(exclude_actions))
    return get_preset(preset).get_system_prompt()


def get_mcp_prompt(preset: Optional[str] = None) -> str:
    """Read the packaged MCP system prompt for intent tools (default preset: legacy).

    Omits the persona preamble and includes session lifecycle instructions
    (open/save/close) suitable for MCP server ``instructions``.
    """
    return get_preset(preset).get_mcp_prompt()
