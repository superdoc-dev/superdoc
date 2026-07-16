"""Preset registry tests (Python SDK) — mirrors Node SDK presets.test.ts."""

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from superdoc import (  # noqa: E402
    DEFAULT_PRESET,
    SuperDocError,
    choose_tools,
    get_preset,
    get_mcp_prompt,
    get_system_prompt,
    get_tool_catalog,
    list_presets,
    list_tools,
)


PROVIDERS = ('openai', 'anthropic', 'vercel', 'generic')


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

def test_default_preset_is_legacy():
    assert DEFAULT_PRESET == 'legacy'


def test_list_presets_includes_legacy():
    presets = list_presets()
    assert 'legacy' in presets


def test_list_presets_includes_core():
    """core preset must be registered for Python ↔ Node parity."""
    presets = list_presets()
    assert 'core' in presets


def test_get_preset_no_arg_returns_legacy():
    preset = get_preset()
    assert preset.id == 'legacy'


def test_get_preset_explicit_returns_legacy():
    preset = get_preset('legacy')
    assert preset.id == 'legacy'
    assert preset.description
    assert preset.supports_cache_control is True


def test_get_preset_core_returns_core_descriptor():
    """core preset must be resolvable by id and expose the descriptor surface."""
    preset = get_preset('core')
    assert preset.id == 'core'
    assert preset.description
    assert preset.supports_cache_control is True
    # Sanity-check all PresetDescriptor methods exist and are callable.
    for method_name in (
        'get_tools',
        'get_catalog',
        'get_system_prompt',
        'get_mcp_prompt',
        'dispatch',
        'dispatch_async',
    ):
        assert callable(getattr(preset, method_name))


def test_get_preset_nonexistent_raises_preset_not_found():
    with pytest.raises(SuperDocError) as excinfo:
        get_preset('nonexistent-preset')
    assert excinfo.value.code == 'PRESET_NOT_FOUND'
    assert 'nonexistent-preset' in str(excinfo.value)
    assert excinfo.value.details['id'] == 'nonexistent-preset'
    assert 'legacy' in excinfo.value.details['availablePresets']


def test_get_preset_empty_string_raises_preset_not_found():
    """Empty string is NOT the default — it must fail fast like Node."""
    with pytest.raises(SuperDocError) as excinfo:
        get_preset('')
    assert excinfo.value.code == 'PRESET_NOT_FOUND'


def test_choose_tools_empty_preset_raises_preset_not_found():
    """Cross-lang parity with Node: chooseTools({preset: ''}) must throw, not
    silently use legacy."""
    with pytest.raises(SuperDocError) as excinfo:
        choose_tools({'provider': 'openai', 'preset': ''})
    assert excinfo.value.code == 'PRESET_NOT_FOUND'


# ---------------------------------------------------------------------------
# choose_tools — default preset equivalence
# ---------------------------------------------------------------------------

@pytest.mark.parametrize('provider', PROVIDERS)
def test_choose_tools_omit_preset_equals_legacy(provider):
    implicit = choose_tools({'provider': provider})
    explicit = choose_tools({'provider': provider, 'preset': 'legacy'})
    assert implicit['tools'] == explicit['tools']
    assert implicit['meta']['toolCount'] == explicit['meta']['toolCount']
    assert implicit['meta']['provider'] == explicit['meta']['provider']
    assert implicit['meta']['cacheStrategy'] == explicit['meta']['cacheStrategy']
    assert implicit['meta']['preset'] == 'legacy'
    assert explicit['meta']['preset'] == 'legacy'


def test_choose_tools_nonexistent_preset_raises():
    with pytest.raises(SuperDocError) as excinfo:
        choose_tools({'provider': 'openai', 'preset': 'nonexistent-preset'})
    assert excinfo.value.code == 'PRESET_NOT_FOUND'


def test_choose_tools_meta_preset_field_present():
    result = choose_tools({'provider': 'openai'})
    assert result['meta']['preset'] == 'legacy'


# ---------------------------------------------------------------------------
# Catalog + listings — default preset equivalence
# ---------------------------------------------------------------------------

def test_get_tool_catalog_default_equals_legacy():
    implicit = get_tool_catalog()
    explicit = get_tool_catalog('legacy')
    assert implicit == explicit


@pytest.mark.parametrize('provider', PROVIDERS)
def test_list_tools_default_equals_legacy(provider):
    implicit = list_tools(provider)
    explicit = list_tools(provider, 'legacy')
    assert implicit == explicit


def test_get_tool_catalog_nonexistent_preset_raises():
    with pytest.raises(SuperDocError) as excinfo:
        get_tool_catalog('nonexistent-preset')
    assert excinfo.value.code == 'PRESET_NOT_FOUND'


# ---------------------------------------------------------------------------
# System prompts — default preset equivalence
# ---------------------------------------------------------------------------

def test_get_system_prompt_default_equals_legacy():
    assert get_system_prompt() == get_system_prompt('legacy')


def test_get_mcp_prompt_default_equals_legacy():
    assert get_mcp_prompt() == get_mcp_prompt('legacy')


# ---------------------------------------------------------------------------
# Direct preset access
# ---------------------------------------------------------------------------

def test_preset_get_catalog_matches_top_level():
    direct = get_preset('legacy').get_catalog()
    via_top_level = get_tool_catalog()
    assert direct == via_top_level


@pytest.mark.parametrize('provider', PROVIDERS)
def test_preset_get_tools_matches_choose_tools(provider):
    direct = get_preset('legacy').get_tools(provider)
    via_top_level = choose_tools({'provider': provider})
    assert direct['tools'] == via_top_level['tools']
    assert direct['cacheStrategy'] == via_top_level['meta']['cacheStrategy']


# ---------------------------------------------------------------------------
# dispatch_superdoc_tool — exclude_actions threading (mirrors Node dispatch guard)
# ---------------------------------------------------------------------------

def test_dispatch_superdoc_tool_accepts_and_forwards_exclude_actions(monkeypatch):
    import superdoc.tools_api as tools_api

    recorded = {}

    class _RecordingPreset:
        def dispatch(self, document_handle, tool_name, args=None, invoke_options=None, *, exclude_actions=None):
            recorded['exclude_actions'] = exclude_actions
            return 'dispatched'

    monkeypatch.setattr(tools_api, 'get_preset', lambda preset=None: _RecordingPreset())

    result = tools_api.dispatch_superdoc_tool(
        object(), 'superdoc_perform_action', {'action': 'insert_paragraphs', 'text': 'x'},
        preset='core', exclude_actions=['add_hyperlink'],
    )
    assert result == 'dispatched'
    assert recorded['exclude_actions'] == ['add_hyperlink']


def test_dispatch_exclude_actions_defaults_to_none(monkeypatch):
    import superdoc.tools_api as tools_api

    recorded = {}

    class _RecordingPreset:
        def dispatch(self, document_handle, tool_name, args=None, invoke_options=None, *, exclude_actions=None):
            recorded['exclude_actions'] = exclude_actions
            return 'ok'

    monkeypatch.setattr(tools_api, 'get_preset', lambda preset=None: _RecordingPreset())
    tools_api.dispatch_superdoc_tool(object(), 'superdoc_inspect')
    assert recorded['exclude_actions'] is None


def test_legacy_dispatch_signature_ignores_exclude_actions():
    """Legacy dispatch must accept (and ignore) the core-preset kwarg so the
    public helpers can forward it unconditionally."""
    import inspect

    from superdoc.presets.legacy import legacy_preset

    sig = inspect.signature(legacy_preset.dispatch)
    # **_ignored swallows core kwargs without TypeError.
    assert any(p.kind is inspect.Parameter.VAR_KEYWORD for p in sig.parameters.values())


# ---------------------------------------------------------------------------
# create_agent_toolkit — coherent surface by construction (mirrors Node)
# ---------------------------------------------------------------------------

def test_create_agent_toolkit_binds_preset_and_exclusions(monkeypatch):
    import superdoc.tools_api as tools_api

    recorded = {}

    class _RecordingPreset:
        def dispatch(self, document_handle, tool_name, args=None, invoke_options=None, *, exclude_actions=None):
            recorded['dispatch'] = {'tool': tool_name, 'exclude_actions': exclude_actions}
            return 'dispatched'

        def get_system_prompt(self, *, exclude_actions=None):
            recorded['prompt_exclusions'] = exclude_actions
            return 'PROMPT'

        def get_tools(self, provider, *, cache=False, exclude_actions=None):
            recorded['tools_exclusions'] = exclude_actions
            return {'tools': ['t'], 'cacheStrategy': 'none'}

    monkeypatch.setattr(tools_api, 'get_preset', lambda preset=None: _RecordingPreset())

    kit = tools_api.create_agent_toolkit({
        'provider': 'openai',
        'preset': 'core',
        'excludeActions': ['add_hyperlink'],
    })
    assert kit['system_prompt'] == 'PROMPT'
    assert recorded['prompt_exclusions'] == ['add_hyperlink']
    assert recorded['tools_exclusions'] == ['add_hyperlink']

    result = kit['dispatch'](object(), 'superdoc_perform_action', {'action': 'insert_paragraphs', 'text': 'x'})
    assert result == 'dispatched'
    assert recorded['dispatch']['exclude_actions'] == ['add_hyperlink']


def test_create_agent_toolkit_legacy_ignores_exclusions():
    from superdoc import create_agent_toolkit, choose_tools, get_system_prompt

    kit = create_agent_toolkit({'provider': 'generic', 'preset': 'legacy', 'excludeActions': ['add_hyperlink']})
    plain = choose_tools({'provider': 'generic', 'preset': 'legacy'})
    assert kit['tools'] == plain['tools']
    assert kit['system_prompt'] == get_system_prompt('legacy')
    assert kit['meta']['preset'] == 'legacy'


def test_create_agent_toolkit_empty_preset_fails_fast():
    from superdoc import SuperDocError, create_agent_toolkit

    with pytest.raises(SuperDocError) as exc_info:
        create_agent_toolkit({'provider': 'generic', 'preset': ''})

    assert exc_info.value.code == 'PRESET_NOT_FOUND'


@pytest.mark.parametrize('base_selection', [
    {'base': '', 'preset': 'core'},
    {'preset': ''},
])
def test_create_agent_toolkit_custom_surface_empty_base_fails_fast(base_selection):
    from superdoc import SuperDocError, create_agent_toolkit

    with pytest.raises(SuperDocError) as exc_info:
        create_agent_toolkit({
            'provider': 'generic',
            'includeCoreActions': [],
            **base_selection,
        })

    assert exc_info.value.code == 'PRESET_NOT_FOUND'


def test_tools_api_all_exports_create_agent_toolkit():
    import superdoc.tools_api as tools_api

    assert 'create_agent_toolkit' in tools_api.__all__
