"""Preset registry for SuperDoc LLM tools (Python).

Mirrors the Node SDK preset registry (see ``packages/sdk/langs/node/src/presets.ts``).
A preset is a self-contained collection of LLM tools — provider catalogs
(openai / anthropic / vercel / generic), a system prompt, and a dispatcher.
Multiple presets can coexist; consumers select one at runtime via
``choose_tools({'preset': ...})``.

v1 ships a single preset: ``'legacy'`` — a thin wrapper around today's
codegen-emitted intent tools. When callers omit ``preset``, ``legacy`` is used.

Presets are NOT versioned. The preset id encodes the variant; a new shape
ships as a new id, not a new version of an existing one.
"""

from __future__ import annotations

from typing import Any, Awaitable, Dict, List, Literal, Optional, Protocol

from ..errors import SuperDocError

ToolProvider = Literal['openai', 'anthropic', 'vercel', 'generic']


class PresetDescriptor(Protocol):
    """Self-contained preset of LLM tools.

    Mirrors the Node SDK PresetDescriptor interface 1:1. Each preset owns
    its tool catalogs per provider, its system prompts, and its dispatcher.
    """

    id: str
    description: str
    supports_cache_control: bool

    def get_tools(self, provider: ToolProvider, *, cache: bool = False) -> Dict[str, Any]: ...
    def get_catalog(self) -> Dict[str, Any]: ...
    def get_system_prompt(self) -> str: ...
    def get_mcp_prompt(self) -> str: ...
    def dispatch(
        self,
        document_handle: Any,
        tool_name: str,
        args: Optional[Dict[str, Any]] = None,
        invoke_options: Optional[Dict[str, Any]] = None,
    ) -> Any: ...
    def dispatch_async(
        self,
        document_handle: Any,
        tool_name: str,
        args: Optional[Dict[str, Any]] = None,
        invoke_options: Optional[Dict[str, Any]] = None,
    ) -> Awaitable[Any]: ...


# Lazy import to avoid the registry pulling in heavy modules at package load.
def _build_registry() -> Dict[str, PresetDescriptor]:
    from .legacy import legacy_preset  # noqa: WPS433 — intentional lazy import
    return {'legacy': legacy_preset}


DEFAULT_PRESET: str = 'legacy'
_PRESETS: Optional[Dict[str, PresetDescriptor]] = None


def _registry() -> Dict[str, PresetDescriptor]:
    global _PRESETS
    if _PRESETS is None:
        _PRESETS = _build_registry()
    return _PRESETS


def list_presets() -> List[str]:
    """List the IDs of all registered presets."""
    return list(_registry().keys())


def get_preset(preset_id: Optional[str] = None) -> PresetDescriptor:
    """Resolve a preset by ID.

    Raises :class:`SuperDocError` with code ``PRESET_NOT_FOUND`` if the ID is
    not registered. Omit the argument to get the default preset.
    """
    resolved = preset_id if preset_id is not None else DEFAULT_PRESET
    registry = _registry()
    preset = registry.get(resolved)
    if preset is None:
        raise SuperDocError(
            f'Unknown LLM-tools preset: "{resolved}"',
            code='PRESET_NOT_FOUND',
            details={'id': resolved, 'availablePresets': list(registry.keys())},
        )
    return preset


__all__ = [
    'PresetDescriptor',
    'DEFAULT_PRESET',
    'ToolProvider',
    'get_preset',
    'list_presets',
]
