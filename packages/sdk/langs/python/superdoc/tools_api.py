"""Public LLM-tools API (Python SDK). Thin layer over the preset registry.

Every call here resolves a preset (defaulting to ``legacy`` for backwards
compat) and delegates to it. Mirrors ``packages/sdk/langs/node/src/tools.ts``.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, TypedDict, cast

from .presets import DEFAULT_PRESET, ToolProvider, get_preset, list_presets
from .errors import SuperDocError

__all__ = [
    'DEFAULT_PRESET',
    'ToolChooserInput',
    'ToolProvider',
    'choose_tools',
    'dispatch_superdoc_tool',
    'dispatch_superdoc_tool_async',
    'get_preset',
    'get_mcp_prompt',
    'get_system_prompt',
    'get_tool_catalog',
    'list_presets',
    'list_tools',
]


class ToolChooserInput(TypedDict, total=False):
    provider: ToolProvider
    # Preset ID to load tools from. Defaults to DEFAULT_PRESET ('legacy')
    # for backwards compatibility. Use list_presets() to discover presets.
    preset: str
    # When True, applies provider-specific prompt-cache markers (Anthropic
    # ``cache_control: { type: "ephemeral" }`` on the last tool, etc).
    cache: bool


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
    result = preset.get_tools(cast(ToolProvider, provider), cache=cache_requested)
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
) -> Any:
    """Dispatch a tool call against a bound document handle using the default preset.

    The handle injects session targeting automatically; arguments should not
    contain ``doc`` or ``sessionId`` — those are stripped if present.
    """
    return get_preset(DEFAULT_PRESET).dispatch(document_handle, tool_name, args, invoke_options)


async def dispatch_superdoc_tool_async(
    document_handle: Any,
    tool_name: str,
    args: Optional[Dict[str, Any]] = None,
    invoke_options: Optional[Dict[str, Any]] = None,
) -> Any:
    """Async version of :func:`dispatch_superdoc_tool`."""
    return await get_preset(DEFAULT_PRESET).dispatch_async(
        document_handle, tool_name, args, invoke_options,
    )


def get_system_prompt(preset: Optional[str] = None) -> str:
    """Read the packaged SDK system prompt (default preset: legacy).

    Includes a persona preamble suitable for embedded LLM usage. For MCP
    server instructions, use :func:`get_mcp_prompt` instead.
    """
    return get_preset(preset).get_system_prompt()


def get_mcp_prompt(preset: Optional[str] = None) -> str:
    """Read the packaged MCP system prompt for intent tools (default preset: legacy).

    Omits the persona preamble and includes session lifecycle instructions
    (open/save/close) suitable for MCP server ``instructions``.
    """
    return get_preset(preset).get_mcp_prompt()
