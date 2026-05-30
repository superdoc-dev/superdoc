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


def test_get_preset_no_arg_returns_legacy():
    preset = get_preset()
    assert preset.id == 'legacy'


def test_get_preset_explicit_returns_legacy():
    preset = get_preset('legacy')
    assert preset.id == 'legacy'
    assert preset.description
    assert preset.supports_cache_control is True


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
