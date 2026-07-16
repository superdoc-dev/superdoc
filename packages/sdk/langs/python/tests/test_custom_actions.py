"""Custom-action unit tests (Python) — no CLI host required.

Mirrors the host-free portion of the Node ``custom-actions.test.ts``: codegen
template, tool merging, collision/duplicate checks, registry register/unregister,
and the superdoc_execute_code rewrite + receipt mapping (against a fake base preset).
"""

import os
import re
import sys
from pathlib import Path

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from superdoc import (  # noqa: E402
    SuperDocError,
    get_preset,
    register_preset,
    unregister_preset,
)
from superdoc.presets import _BUILTIN_IDS  # noqa: E402
from superdoc.presets.custom import (  # noqa: E402
    BUILTIN_ACTION_NAMES,
    compose_preset,
    define_action,
    extend_preset,
)
from footnote_fixture import footnote_actions  # noqa: E402


def _cli_available() -> bool:
    if os.environ.get('SUPERDOC_CLI_BIN'):
        return True
    try:
        from superdoc.embedded_cli import resolve_embedded_cli_path

        resolve_embedded_cli_path()
        return True
    except Exception:  # noqa: BLE001 — no binary on this platform/CI stage
        return False


# The python core preset proxies get_tools/dispatch through the CLI host, so
# tests exercising the REAL core preset need a binary. They run locally and in
# host-equipped CI stages; the pure-registry/fake-base tests cover the logic
# everywhere else (Node runs the same scenarios natively).
requires_host = pytest.mark.skipif(not _cli_available(), reason='SuperDoc CLI binary unavailable')


@pytest.fixture
def cleanup_registered():
    ids = []
    yield ids
    for pid in ids:
        try:
            unregister_preset(pid)
        except SuperDocError:
            pass


# ---------------------------------------------------------------------------
# define_action — two tiers
# ---------------------------------------------------------------------------


def test_define_action_run_tier_keeps_callable():
    fn = lambda doc, args: args  # noqa: E731
    spec = define_action(
        name='demo.echo',
        description='echo',
        input_schema={'type': 'object', 'properties': {'x': {'type': 'string'}}, 'required': ['x']},
        run=fn,
    )
    assert spec['name'] == 'demo.echo'
    assert spec['run'] is fn
    assert 'source' not in spec
    assert spec['inputSchema']['required'] == ['x']


def test_define_action_steps_tier_validates_builtins():
    spec = define_action(
        name='demo.steps', description='d',
        steps=[{'action': 'insert_paragraphs', 'args': {'texts': ['{{label}}']}}],
    )
    assert spec['steps'] == [{'action': 'insert_paragraphs', 'args': {'texts': ['{{label}}']}}]
    with pytest.raises(SuperDocError):
        define_action(name='demo.bad', description='d', steps=[{'action': 'not_a_real_action'}])


def test_define_action_requires_exactly_one_tier():
    with pytest.raises(SuperDocError):
        define_action(name='x.none', description='d')
    with pytest.raises(SuperDocError):
        define_action(name='x.two', description='d', run=lambda d, a: None,
                      steps=[{'action': 'insert_paragraphs'}])


# ---------------------------------------------------------------------------
# collision / duplicate
# ---------------------------------------------------------------------------


def test_rejects_collision_with_builtin():
    builtin = next(iter(BUILTIN_ACTION_NAMES))
    bad = define_action(name=builtin, description='x', run=lambda d, a: None)
    with pytest.raises(SuperDocError) as ex:
        extend_preset('core', id='bad', actions=[bad])
    assert ex.value.code == 'INVALID_ARGUMENT'


def test_rejects_duplicate_names():
    a = define_action(name='dup.one', description='a', run=lambda d, a: None)
    b = define_action(name='dup.one', description='b', run=lambda d, a: None)
    with pytest.raises(SuperDocError):
        extend_preset('core', id='dup', actions=[a, b])


# The canonical 40 names from ACTION_NAMES_LIST in
# node/src/agent/actions.ts (source of truth). Asserting the EXACT set — not
# just the count — makes any drift from Node fail loudly.
_CANONICAL_ACTION_NAMES = sorted([
    'accept_tracked_changes',
    'add_comments',
    'add_hyperlink',
    'add_list_items',
    'append_list',
    'apply_letter_spacing',
    'apply_style',
    'attach_numbering',
    'comment_paragraphs',
    'convert_list',
    'create_table',
    'delete_table',
    'delete_table_column',
    'delete_table_row',
    'delete_text',
    'fill_placeholders',
    'format_paragraph',
    'format_text',
    'insert_heading',
    'insert_page_break',
    'insert_paragraphs',
    'insert_table_column',
    'insert_table_row',
    'insert_toc',
    'move_range',
    'move_table',
    'move_text',
    'normalize_body_font_size',
    'redo_changes',
    'reject_tracked_changes',
    'reply_to_comment',
    'resolve_comments',
    'replace_text',
    'rewrite_block',
    'set_font_family',
    'set_paragraph_spacing',
    'split_list',
    'split_table',
    'style_table',
    'undo_changes',
])


def test_builtin_action_names_match_node_exactly():
    assert sorted(BUILTIN_ACTION_NAMES) == _CANONICAL_ACTION_NAMES


def test_builtin_action_names_match_node_source():
    """The real drift guard: parse Node's ACTION_NAMES (the source of truth)
    and compare the exact set. The hand-copied list above is only a fallback
    for environments without the Node source tree."""
    node_actions = (
        Path(__file__).resolve().parents[2] / 'node' / 'src' / 'agent' / 'actions.ts'
    )
    if not node_actions.exists():
        pytest.skip('Node source tree not available (installed-package run)')
    source = node_actions.read_text()
    match = re.search(r'const ACTION_NAMES: readonly ActionName\[\] = \[(.*?)\];', source, re.S)
    assert match, 'ACTION_NAMES declaration not found in node actions.ts'
    node_names = set(re.findall(r"'([a-z_]+)'", match.group(1)))
    assert node_names == set(BUILTIN_ACTION_NAMES), (
        f'drift: only-in-node={sorted(node_names - BUILTIN_ACTION_NAMES)} '
        f'only-in-python={sorted(BUILTIN_ACTION_NAMES - node_names)}'
    )


# ---------------------------------------------------------------------------
# registry
# ---------------------------------------------------------------------------


def test_register_resolve_unregister(cleanup_registered):
    p = extend_preset('core', id='tmp-preset', actions=footnote_actions)
    register_preset(p)
    cleanup_registered.append('tmp-preset')
    assert get_preset('tmp-preset').id == 'tmp-preset'
    unregister_preset('tmp-preset')
    with pytest.raises(SuperDocError):
        get_preset('tmp-preset')


def test_cannot_overwrite_builtin():
    p = extend_preset('core', id='will-rename', actions=[])
    object.__setattr__(p, 'id', 'core')  # frozen dataclass
    with pytest.raises(SuperDocError):
        register_preset(p)


def test_cannot_unregister_builtin():
    for pid in _BUILTIN_IDS:
        with pytest.raises(SuperDocError):
            unregister_preset(pid)


# ---------------------------------------------------------------------------
# tool merging (against a fake base — no host)
# ---------------------------------------------------------------------------


class _FakeBase:
    """A minimal core-shaped base preset that records superdoc_execute_code calls."""

    id = 'fake-base'
    description = 'fake'
    supports_cache_control = True

    def __init__(self):
        self.captured = {}

    def get_tools(self, provider, *, cache=False, exclude_actions=None):
        # core-shaped superdoc_perform_action with an enum + flat properties.
        action_tool = {
            'name': 'superdoc_perform_action',
            'description': 'base action tool.',
            'input_schema': {
                'type': 'object',
                'properties': {
                    'action': {'type': 'string', 'enum': ['insert_paragraphs']},
                    'text': {'type': 'string'},
                },
            },
        }
        execute = {'name': 'superdoc_execute_code', 'input_schema': {'type': 'object', 'properties': {}}}
        tools = [action_tool, execute]
        # Mirror core's marker placement so the wrapper's re-normalize path is
        # exercised: anthropic cache marks the LAST tool.
        if cache and provider == 'anthropic':
            tools[-1] = {**tools[-1], 'cache_control': {'type': 'ephemeral'}}
            return {'tools': tools, 'cacheStrategy': 'explicit'}
        return {'tools': tools, 'cacheStrategy': 'disabled'}

    def get_catalog(self):
        return {
            'contractVersion': 'fake',
            'generatedAt': None,
            'toolCount': 1,
            'tools': [{'toolName': 'superdoc_execute_code', 'description': 'x', 'inputSchema': {}, 'mutates': True, 'operations': []}],
        }

    def get_system_prompt(self, *, exclude_actions=None):
        return 'base prompt'

    def get_mcp_prompt(self):
        return 'base mcp'

    def dispatch(self, handle, tool_name, args=None, invoke_options=None):
        assert tool_name == 'superdoc_execute_code'
        self.captured['code'] = (args or {}).get('code')
        return {'ok': True, 'result': {'success': True, 'footnote': {'noteId': 'fn-1'}}, 'logs': []}


def _register_fake(cleanup_registered):
    fake = _FakeBase()
    register_preset(fake)
    cleanup_registered.append('fake-base')
    return fake


def test_extend_merges_into_superdoc_perform_action(cleanup_registered):
    _register_fake(cleanup_registered)
    acme = extend_preset('fake-base', id='acme-merge', actions=footnote_actions)
    register_preset(acme)
    cleanup_registered.append('acme-merge')
    tools = acme.get_tools('anthropic')['tools']
    action_tool = next(t for t in tools if t.get('name') == 'superdoc_perform_action')
    names = action_tool['input_schema']['properties']['action']['enum']
    for r in footnote_actions:
        assert r['name'] in names
    assert 'insert_paragraphs' in names  # base preserved
    assert 'noteId' in action_tool['input_schema']['properties']  # unioned


def _safe_actions():
    """Footnote actions with provider-safe (dot-free) names for standalone mode."""
    return [{**r, 'name': r['name'].replace('.', '_')} for r in footnote_actions]


def test_extend_standalone_tools(cleanup_registered):
    _register_fake(cleanup_registered)
    safe = _safe_actions()
    acme = extend_preset('fake-base', id='acme-standalone', actions=safe, standalone=True)
    register_preset(acme)
    cleanup_registered.append('acme-standalone')
    tools = acme.get_tools('openai')['tools']
    names = [t.get('function', t).get('name') for t in tools]
    for r in safe:
        assert r['name'] in names


def test_standalone_vercel_uses_flat_core_dialect(cleanup_registered):
    _register_fake(cleanup_registered)
    safe = _safe_actions()
    acme = extend_preset('fake-base', id='acme-vercel', actions=safe, standalone=True)
    register_preset(acme)
    cleanup_registered.append('acme-vercel')
    tools = acme.get_tools('vercel')['tools']
    add = next(t for t in tools if t.get('name') == 'footnotes_add')
    # Core's vercel dialect is flat {name, description, inputSchema}.
    assert 'function' not in add and 'type' not in add
    assert add['inputSchema'] is not None


@requires_host
def test_merged_vercel_advertises_customs_in_flat_dialect(cleanup_registered):
    acme = extend_preset('core', id='acme-vercel-merged', actions=footnote_actions)
    register_preset(acme)
    cleanup_registered.append('acme-vercel-merged')
    tools = acme.get_tools('vercel')['tools']
    perform = next(t for t in tools if t.get('name') == 'superdoc_perform_action')
    assert 'footnotes.add' in perform['inputSchema']['properties']['action']['enum']


@requires_host
def test_exclude_actions_coherent_on_extended_preset(cleanup_registered):
    from superdoc import choose_tools as _choose

    acme = extend_preset('core', id='acme-excl', actions=footnote_actions)
    register_preset(acme)
    cleanup_registered.append('acme-excl')
    exclude = ['footnotes.add', 'create_table']
    tools = _choose({'provider': 'openai', 'preset': 'acme-excl', 'excludeActions': exclude})['tools']
    perform = next(t['function'] for t in tools if t['function']['name'] == 'superdoc_perform_action')
    names = perform['parameters']['properties']['action']['enum']
    assert 'footnotes.add' not in names       # custom excluded by the wrapper
    assert 'create_table' not in names        # builtin excluded by the base
    assert 'footnotes.list' in names          # other customs survive

    prompt = acme.get_system_prompt(exclude_actions=exclude)
    assert '- footnotes.add —' not in prompt
    assert 'footnotes.list' in prompt

    with pytest.raises(SuperDocError) as ex:
        acme.dispatch(object(), 'superdoc_perform_action',
                      {'action': 'footnotes.add', 'at': {}, 'content': 'x'},
                      exclude_actions=exclude)
    assert ex.value.details.get('excluded') is True


def test_steps_partial_step_aggregates_partial(cleanup_registered):
    _, acme = _register_steps(cleanup_registered, [{'status': 'ok'}, {'status': 'partial'}])
    receipt = acme.dispatch(object(), 'superdoc_perform_action', {'action': 'acme.stamp'})
    assert receipt['status'] == 'partial'
    assert receipt['failedStep']['index'] == 1


def test_steps_template_text_parity_for_non_strings(cleanup_registered):
    base = _StepsBase([{'status': 'ok'}])
    register_preset(base)
    cleanup_registered.append('steps-base')
    spec = define_action(
        name='acme.parity',
        description='d',
        steps=[{'action': 'insert_paragraphs', 'args': {'texts': ['flag={{flag}} items={{items}} obj={{obj}}']}}],
    )
    acme = extend_preset('steps-base', id='acme-parity', actions=[spec])
    register_preset(acme)
    cleanup_registered.append('acme-parity')
    acme.dispatch(object(), 'superdoc_perform_action',
                  {'action': 'acme.parity', 'flag': True, 'items': [1, 2], 'obj': {'a': 1}})
    # MUST match Node: JSON text forms, not Python str() forms.
    assert base.calls[0]['texts'] == ['flag=true items=[1,2] obj={"a":1}']


def test_steps_missing_template_dropped_from_arrays(cleanup_registered):
    base = _StepsBase([{'status': 'ok'}])
    register_preset(base)
    cleanup_registered.append('steps-base')
    spec = define_action(
        name='acme.arrmiss',
        description='d',
        steps=[{'action': 'insert_paragraphs', 'args': {'texts': ['{{present}}', '{{absent}}']}}],
    )
    acme = extend_preset('steps-base', id='acme-arrmiss', actions=[spec])
    register_preset(acme)
    cleanup_registered.append('acme-arrmiss')
    acme.dispatch(object(), 'superdoc_perform_action', {'action': 'acme.arrmiss', 'present': 'AAA'})
    assert base.calls[0]['texts'] == ['AAA']


def test_raw_spec_with_empty_steps_rejected():
    raw = {'name': 'acme.empty', 'description': 'd', 'inputSchema': {'type': 'object', 'properties': {}},
           'steps': []}
    with pytest.raises(SuperDocError):
        extend_preset('core', id='acme-empty', actions=[raw])


def test_sync_dispatch_of_async_run_is_refused(cleanup_registered):
    _register_fake(cleanup_registered)

    async def _async_run(doc, args):
        return {'never': 'awaited'}

    native = define_action(name='acme.async-native', description='d', run=_async_run)
    acme = extend_preset('fake-base', id='acme-async-native', actions=[native])
    register_preset(acme)
    cleanup_registered.append('acme-async-native')
    receipt = acme.dispatch(_RevisionHandle(['0', '0']), 'superdoc_perform_action', {'action': 'acme.async-native'})
    assert receipt['status'] == 'failed'
    assert 'dispatch_async' in receipt['errors'][0]['message']


def test_standalone_does_not_route_customs_through_perform_action(cleanup_registered):
    fake = _register_fake(cleanup_registered)

    def _spy_dispatch(handle, tool_name, args=None, invoke_options=None, *, exclude_actions=None):
        return {'delegated': tool_name, 'action': (args or {}).get('action')}

    fake.dispatch = _spy_dispatch  # type: ignore[assignment]
    safe = _safe_actions()
    acme = extend_preset('fake-base', id='acme-standalone-gate', actions=safe, standalone=True)
    register_preset(acme)
    cleanup_registered.append('acme-standalone-gate')
    # perform_action route must fall through to the base (delegated), not run the custom.
    result = acme.dispatch(object(), 'superdoc_perform_action', {'action': 'footnotes_add', 'at': {}, 'content': 'x'})
    assert result == {'delegated': 'superdoc_perform_action', 'action': 'footnotes_add'}


def test_standalone_keeps_action_named_argument(cleanup_registered):
    received = {}

    def _run(doc, args):
        received.update(args)
        return {'ok': True}

    spec = define_action(
        name='wf_trigger', description='run a workflow step',
        input_schema={'type': 'object', 'properties': {'action': {'type': 'string', 'enum': ['approve', 'reject']}},
                      'required': ['action']},
        run=_run,
    )
    acme = extend_preset('core', id='acme-standalone-arg', actions=[spec], standalone=True)
    register_preset(acme)
    cleanup_registered.append('acme-standalone-arg')
    # Dispatched as its OWN tool: `action` is a real arg, must survive.
    receipt = acme.dispatch(object(), 'wf_trigger', {'action': 'approve'})
    assert receipt['status'] == 'succeeded'
    assert received == {'action': 'approve'}


def test_standalone_rejects_dotted_names_merged_accepts():
    # Dotted name invalid as a provider tool name (standalone), valid as enum
    # value (merged).
    with pytest.raises(SuperDocError) as ex:
        extend_preset('core', id='bad-standalone', actions=footnote_actions, standalone=True)
    assert ex.value.code == 'INVALID_ARGUMENT'
    # merged mode (default) accepts the dotted names without raising.
    extend_preset('core', id='ok-merged', actions=footnote_actions)


def test_anthropic_cache_marks_exactly_last_tool(cleanup_registered):
    _register_fake(cleanup_registered)
    safe = _safe_actions()
    acme = extend_preset('fake-base', id='acme-cache', actions=safe, standalone=True)
    register_preset(acme)
    cleanup_registered.append('acme-cache')
    tools = acme.get_tools('anthropic', cache=True)['tools']
    with_marker = [t for t in tools if isinstance(t, dict) and t.get('cache_control') is not None]
    assert len(with_marker) == 1
    assert tools[-1]['cache_control'] == {'type': 'ephemeral'}


def test_dispatch_validates_required(cleanup_registered):
    _register_fake(cleanup_registered)
    acme = extend_preset('fake-base', id='acme-validate', actions=footnote_actions)
    register_preset(acme)
    cleanup_registered.append('acme-validate')
    with pytest.raises(SuperDocError) as ex:
        acme.dispatch(object(), 'superdoc_perform_action', {'action': 'footnotes.add', 'content': 'x'})
    assert ex.value.code == 'INVALID_ARGUMENT'


def test_dispatch_delegates_non_custom(cleanup_registered):
    fake = _register_fake(cleanup_registered)

    delegated = {}

    def _spy_dispatch(handle, tool_name, args=None, invoke_options=None, *, exclude_actions=None):
        delegated['tool'] = tool_name
        return {'delegated': tool_name}

    fake.dispatch = _spy_dispatch  # type: ignore[assignment]
    acme = extend_preset('fake-base', id='acme-delegate', actions=footnote_actions)
    register_preset(acme)
    cleanup_registered.append('acme-delegate')
    result = acme.dispatch(object(), 'superdoc_perform_action', {'action': 'insert_paragraphs', 'text': 'hi'})
    assert delegated['tool'] == 'superdoc_perform_action'
    assert result == {'delegated': 'superdoc_perform_action'}


# ---------------------------------------------------------------------------
# compose_preset
# ---------------------------------------------------------------------------


def test_compose_drops_superdoc_execute_code(cleanup_registered):
    _register_fake(cleanup_registered)
    composed = compose_preset(id='composed-1', base_id='fake-base', include_superdoc_execute_code=False, actions=footnote_actions)
    register_preset(composed)
    cleanup_registered.append('composed-1')
    tools = composed.get_tools('generic')['tools']
    names = [t.get('function', t).get('name') for t in tools]
    assert 'superdoc_execute_code' not in names
    action_tool = next(t for t in tools if t.get('name') == 'superdoc_perform_action')
    assert 'footnotes.add' in action_tool['parameters' if 'parameters' in action_tool else 'input_schema']['properties']['action']['enum']


@requires_host
def test_compose_custom_only_synthesizes_perform_action(cleanup_registered):
    composed = compose_preset(
        id='composed-custom-only', base_id='core',
        include_core_actions=[], actions=footnote_actions,
    )
    register_preset(composed)
    cleanup_registered.append('composed-custom-only')
    tools = composed.get_tools('openai')['tools']
    perform = next((t for t in tools if (t.get('function') or t).get('name') == 'superdoc_perform_action'), None)
    assert perform is not None  # synthesized — the base dropped it
    names = perform['function']['parameters']['properties']['action']['enum']
    for r in footnote_actions:
        assert r['name'] in names
    assert 'insert_paragraphs' not in names


@requires_host
def test_compose_catalog_narrowed_by_allowlist(cleanup_registered):
    from superdoc import get_tool_catalog

    composed = compose_preset(
        id='composed-cat', base_id='core',
        include_core_actions=['insert_paragraphs'], actions=footnote_actions,
    )
    register_preset(composed)
    cleanup_registered.append('composed-cat')
    catalog = get_tool_catalog('composed-cat')
    perform = next(t for t in catalog['tools'] if t['toolName'] == 'superdoc_perform_action')
    props = perform['inputSchema']['properties']
    names = props['action']['enum']
    assert 'insert_paragraphs' in names
    assert 'create_table' not in names  # outside the allowlist — not in the catalog
    # The row narrows BEYOND the enum: create_table-only args are gone, so a
    # catalog-driven UI/validator can't offer inputs for a refused action.
    assert 'rows' not in props and 'columns' not in props
    assert 'text' in props  # insert_paragraphs' own arg survives
    assert 'create_table' not in perform.get('description', '')  # description narrows too
    # custom actions appear as their own catalog rows (not merged into the
    # perform_action enum the way get_tools does)
    assert any(t['toolName'] == 'footnotes.add' for t in catalog['tools'])


@requires_host
def test_compose_catalog_row_matches_get_tools_without_custom(cleanup_registered):
    from superdoc import choose_tools, get_tool_catalog

    composed = compose_preset(id='composed-cat-nocustom', base_id='core',
                              include_core_actions=['insert_paragraphs'])
    register_preset(composed)
    cleanup_registered.append('composed-cat-nocustom')
    row = next(t for t in get_tool_catalog('composed-cat-nocustom')['tools']
               if t['toolName'] == 'superdoc_perform_action')
    # With no custom actions the catalog row and the advertised tool coincide —
    # one narrowing, no drift.
    tools = choose_tools({'provider': 'generic', 'preset': 'composed-cat-nocustom'})['tools']
    advertised = next(t for t in tools if t.get('name') == 'superdoc_perform_action')
    assert row['inputSchema']['properties']['action']['enum'] == advertised['parameters']['properties']['action']['enum']
    assert sorted(row['inputSchema']['properties']) == sorted(advertised['parameters']['properties'])


@requires_host
def test_compose_allowlist_no_enum_leak_and_dispatch_enforced(cleanup_registered):
    composed = compose_preset(
        id='composed-leak', base_id='core',
        include_core_actions=['insert_paragraphs'], actions=footnote_actions,
    )
    register_preset(composed)
    cleanup_registered.append('composed-leak')
    tools = composed.get_tools('generic', exclude_actions=['footnotes.add'])['tools']
    perform = next(t for t in tools if t.get('name') == 'superdoc_perform_action')
    names = perform['parameters']['properties']['action']['enum']
    assert 'footnotes.add' not in names   # must not leak back via the allowlist rebuild
    assert 'footnotes.list' in names
    assert 'insert_paragraphs' in names
    # The DESCRIPTION and advertised args narrow with the allowlist too — the
    # base rebuilds them from the derived exclusion, not a hand-rolled filter.
    assert 'create_table' not in perform['description']
    # allowlist enforced at dispatch too
    with pytest.raises(SuperDocError) as ex:
        composed.dispatch(object(), 'superdoc_perform_action', {'action': 'create_table', 'rows': 1, 'columns': 1})
    assert ex.value.details.get('excludedBy') == 'includeCoreActions'


def test_reserved_tool_names_match_node_catalog():
    node_catalog = (
        Path(__file__).resolve().parents[2] / 'node' / 'src' / 'agent' / 'catalog.ts'
    )
    if not node_catalog.exists():
        pytest.skip('Node source tree not available (installed-package run)')
    source = node_catalog.read_text()
    match = re.search(r'export const AGENT_TOOL_NAMES = \[(.*?)\] as const;', source, re.S)
    assert match, 'AGENT_TOOL_NAMES declaration not found in node catalog.ts'
    node_names = set(re.findall(r"'([a-z_]+)'", match.group(1)))
    from superdoc.presets.custom import _RESERVED_TOOL_NAMES

    assert node_names == set(_RESERVED_TOOL_NAMES), (
        f'drift: only-in-node={sorted(node_names - _RESERVED_TOOL_NAMES)} '
        f'only-in-python={sorted(set(_RESERVED_TOOL_NAMES) - node_names)}'
    )


def test_explicit_none_enum_value_rejected(cleanup_registered):
    base = _StepsBase([{'status': 'ok'}])
    register_preset(base)
    cleanup_registered.append('steps-base')
    spec = define_action(
        name='acme.enumnull', description='d',
        input_schema={'type': 'object', 'properties': {
            'mode': {'type': 'string', 'enum': ['a', 'b'], 'default': 'a'}}},
        steps=[{'action': 'insert_paragraphs', 'args': {'texts': ['x']}}],
    )
    acme = extend_preset('steps-base', id='acme-enumnull', actions=[spec])
    register_preset(acme)
    cleanup_registered.append('acme-enumnull')
    # Explicit None is a VALUE, not an absence — reject (Node parity), don't
    # silently forward a live None past the default.
    with pytest.raises(SuperDocError) as ex:
        acme.dispatch(object(), 'superdoc_perform_action', {'action': 'acme.enumnull', 'mode': None})
    assert ex.value.code == 'INVALID_ARGUMENT'
    # Omitting the key entirely still applies the default and succeeds.
    receipt = acme.dispatch(object(), 'superdoc_perform_action', {'action': 'acme.enumnull'})
    assert receipt['status'] == 'succeeded'


def test_reserved_tool_name_rejected():
    bad = define_action(name='superdoc_execute_code', description='x', run=lambda d, a: None)
    with pytest.raises(SuperDocError):
        extend_preset('core', id='bad-reserved', actions=[bad], standalone=True)


def test_required_with_default_satisfied_by_default(cleanup_registered):
    base = _StepsBase([{'status': 'ok'}])
    register_preset(base)
    cleanup_registered.append('steps-base')
    spec = define_action(
        name='acme.reqdef', description='d',
        input_schema={'type': 'object', 'properties': {'label': {'type': 'string', 'default': 'D'}},
                      'required': ['label']},
        steps=[{'action': 'insert_paragraphs', 'args': {'texts': ['{{label}}']}}],
    )
    acme = extend_preset('steps-base', id='acme-reqdef', actions=[spec])
    register_preset(acme)
    cleanup_registered.append('acme-reqdef')
    receipt = acme.dispatch(object(), 'superdoc_perform_action', {'action': 'acme.reqdef'})
    assert receipt['status'] == 'succeeded'
    assert base.calls[0]['texts'] == ['D']


@requires_host
def test_compose_exclude_actions_coherent(cleanup_registered):
    from superdoc import choose_tools as _choose

    composed = compose_preset(id='composed-excl', base_id='core', actions=footnote_actions)
    register_preset(composed)
    cleanup_registered.append('composed-excl')
    exclude = ['footnotes.add', 'create_table']
    tools = _choose({'provider': 'generic', 'preset': 'composed-excl', 'excludeActions': exclude})['tools']
    perform = next(t for t in tools if t.get('name') == 'superdoc_perform_action')
    names = perform['parameters']['properties']['action']['enum']
    assert 'footnotes.add' not in names
    assert 'create_table' not in names
    assert 'footnotes.list' in names
    prompt = composed.get_system_prompt(exclude_actions=exclude)
    assert '- footnotes.add —' not in prompt


def test_compose_filters_core_actions(cleanup_registered):
    _register_fake(cleanup_registered)
    composed = compose_preset(
        id='composed-2',
        base_id='fake-base',
        include_core_actions=['insert_paragraphs'],
        actions=footnote_actions,
    )
    register_preset(composed)
    cleanup_registered.append('composed-2')
    tools = composed.get_tools('anthropic')['tools']
    action_tool = next(t for t in tools if t.get('name') == 'superdoc_perform_action')
    names = action_tool['input_schema']['properties']['action']['enum']
    assert 'insert_paragraphs' in names
    assert 'footnotes.add' in names


# ---------------------------------------------------------------------------
# steps tier — declarative composition (mirrors Node's steps-tier tests)
# ---------------------------------------------------------------------------


class _StepsBase:
    """Fake base recording superdoc_perform_action step dispatches with scripted receipts."""

    id = 'steps-base'
    description = 'fake'
    supports_cache_control = True

    def __init__(self, receipts):
        self.calls = []
        self._receipts = receipts
        self._cursor = 0

    def get_tools(self, provider, *, cache=False):
        return {'tools': [], 'cacheStrategy': 'disabled'}

    def get_catalog(self):
        return {'contractVersion': 'x', 'generatedAt': None, 'toolCount': 0, 'tools': []}

    def get_system_prompt(self):
        return 'base'

    def get_mcp_prompt(self):
        return 'base'

    def dispatch(self, handle, tool_name, args=None, invoke_options=None, *, exclude_actions=None):
        assert tool_name == 'superdoc_perform_action'
        self.calls.append(args)
        item = self._receipts[min(self._cursor, len(self._receipts) - 1)]
        self._cursor += 1
        if isinstance(item, Exception):
            raise item
        return item


def _stamp_spec():
    return define_action(
        name='acme.stamp',
        description='banner + comment',
        input_schema={'type': 'object', 'properties': {'label': {'type': 'string', 'default': 'CONFIDENTIAL'}}},
        steps=[
            {'action': 'insert_paragraphs', 'args': {'texts': ['{{label}}'], 'placement': {'at': 'document_start'}}},
            {'action': 'add_comments', 'args': {
                'selectors': [{'kind': 'textSearch', 'terms': ['{{label}}']}],
                'commentText': 'Stamped: {{label}} — verify.',
            }},
        ],
    )


def _register_steps(cleanup_registered, receipts):
    base = _StepsBase(receipts)
    register_preset(base)
    cleanup_registered.append('steps-base')
    acme = extend_preset('steps-base', id='acme-steps', actions=[_stamp_spec()])
    register_preset(acme)
    cleanup_registered.append('acme-steps')
    return base, acme


def test_steps_templating_defaults_and_success(cleanup_registered):
    base, acme = _register_steps(cleanup_registered, [{'status': 'ok', 'verificationPassed': True}])
    receipt = acme.dispatch(object(), 'superdoc_perform_action', {'action': 'acme.stamp'})
    assert receipt['status'] == 'succeeded'
    assert len(receipt['steps']) == 2
    # Whole-string template preserved the raw list value; default applied.
    assert base.calls[0] == {
        'action': 'insert_paragraphs',
        'texts': ['CONFIDENTIAL'],
        'placement': {'at': 'document_start'},
    }
    # Partial template interpolated as text.
    assert base.calls[1]['commentText'] == 'Stamped: CONFIDENTIAL — verify.'
    assert base.calls[1]['selectors'] == [{'kind': 'textSearch', 'terms': ['CONFIDENTIAL']}]


def test_steps_change_mode_passthrough(cleanup_registered):
    base, acme = _register_steps(cleanup_registered, [{'status': 'ok'}])
    acme.dispatch(object(), 'superdoc_perform_action', {'action': 'acme.stamp', 'label': 'X', 'changeMode': 'tracked'})
    assert base.calls[0]['changeMode'] == 'tracked'
    assert base.calls[1]['changeMode'] == 'tracked'


def test_steps_do_not_inherit_surface_exclusions(cleanup_registered):
    # Base that mirrors core's defense-in-depth: refuse any call whose action is
    # in the invoke-time exclude_actions. If a surface exclusion leaked into the
    # steps, the insert_paragraphs step would be refused and acme.stamp
    # (advertised!) would fail — the coherence bug this guards against.
    seen = []

    class _ExclEnforcingBase:
        id = 'steps-excl-base'
        description = 'fake base enforcing invoke-time exclusions'
        supports_cache_control = True

        def get_tools(self, provider, *, cache=False, exclude_actions=None):
            return {'tools': [], 'cacheStrategy': 'disabled'}

        def get_catalog(self):
            return {'contractVersion': 'x', 'generatedAt': None, 'toolCount': 0, 'tools': []}

        def get_system_prompt(self, *, exclude_actions=None):
            return 'base'

        def get_mcp_prompt(self):
            return 'base'

        def dispatch(self, handle, tool_name, args=None, invoke_options=None, *, exclude_actions=None):
            seen.append(exclude_actions)
            action = (args or {}).get('action')
            if exclude_actions and action in exclude_actions:
                raise SuperDocError(f"Action {action} is excluded by configuration.",
                                    code='INVALID_ARGUMENT', details={'excluded': True})
            return {'status': 'ok', 'verificationPassed': True}

    register_preset(_ExclEnforcingBase())
    cleanup_registered.append('steps-excl-base')
    acme = extend_preset('steps-excl-base', id='acme-steps-excl', actions=[_stamp_spec()])
    register_preset(acme)
    cleanup_registered.append('acme-steps-excl')

    # Hide insert_paragraphs from the model, but acme.stamp composes it.
    receipt = acme.dispatch(object(), 'superdoc_perform_action', {'action': 'acme.stamp'},
                            exclude_actions=['insert_paragraphs'])
    assert receipt['status'] == 'succeeded'  # step NOT refused
    assert len(receipt['steps']) == 2
    assert all(s is None for s in seen)  # internal steps saw NO exclude_actions

    # Guard preserved: a DIRECT model call to the hidden built-in is still refused.
    with pytest.raises(SuperDocError):
        acme.dispatch(object(), 'superdoc_perform_action', {'action': 'insert_paragraphs', 'text': 'x'},
                      exclude_actions=['insert_paragraphs'])


def test_steps_second_failure_aggregates_partial(cleanup_registered):
    _, acme = _register_steps(
        cleanup_registered,
        [{'status': 'ok'}, {'status': 'failed', 'errors': [{'message': 'no match'}]}],
    )
    receipt = acme.dispatch(object(), 'superdoc_perform_action', {'action': 'acme.stamp'})
    assert receipt['status'] == 'partial'
    assert receipt['failedStep']['index'] == 1


def test_steps_thrown_first_step_aggregates_failed(cleanup_registered):
    _, acme = _register_steps(cleanup_registered, [SuperDocError('bad args', code='INVALID_ARGUMENT')])
    receipt = acme.dispatch(object(), 'superdoc_perform_action', {'action': 'acme.stamp'})
    assert receipt['status'] == 'failed'
    assert receipt['steps'][0]['status'] == 'failed'


def test_steps_reject_unknown_builtin_at_define_time():
    with pytest.raises(SuperDocError) as ex:
        define_action(name='demo.bad', description='d', steps=[{'action': 'not_a_real_action'}])
    assert ex.value.code == 'INVALID_ARGUMENT'


# ---------------------------------------------------------------------------
# run tier — native Python callable with a synthesized receipt
# ---------------------------------------------------------------------------


class _RevisionHandle:
    def __init__(self, revisions):
        self._revisions = revisions
        self._i = 0

    def info(self, params):
        revision = self._revisions[min(self._i, len(self._revisions) - 1)]
        self._i += 1
        return {'revision': revision}


def test_run_tier_success_receipt(cleanup_registered):
    _register_fake(cleanup_registered)
    native = define_action(
        name='acme.native',
        description='d',
        input_schema={'type': 'object', 'properties': {'x': {'type': 'number', 'default': 7}}},
        run=lambda doc, args: {'got': args['x']},
    )
    acme = extend_preset('fake-base', id='acme-native', actions=[native])
    register_preset(acme)
    cleanup_registered.append('acme-native')
    receipt = acme.dispatch(_RevisionHandle(['0', '1']), 'superdoc_perform_action', {'action': 'acme.native'})
    assert receipt['status'] == 'succeeded'
    assert receipt['result'] == {'got': 7}
    assert receipt['preRevision'] == '0'
    assert receipt['postRevision'] == '1'


def test_run_tier_failure_partial_mutation(cleanup_registered):
    _register_fake(cleanup_registered)

    def _boom(doc, args):
        raise RuntimeError('boom between ops')

    native = define_action(name='acme.native-fail', description='d', run=_boom)
    acme = extend_preset('fake-base', id='acme-native-fail', actions=[native])
    register_preset(acme)
    cleanup_registered.append('acme-native-fail')
    receipt = acme.dispatch(_RevisionHandle(['3', '4']), 'superdoc_perform_action', {'action': 'acme.native-fail'})
    assert receipt['status'] == 'failed'
    assert receipt['partialMutation'] is True
    assert receipt['recovery']['kind'] == 'revert'


def test_run_tier_failure_clean_retry(cleanup_registered):
    _register_fake(cleanup_registered)

    def _boom(doc, args):
        raise RuntimeError('failed before touching the doc')

    native = define_action(name='acme.native-cf', description='d', run=_boom)
    acme = extend_preset('fake-base', id='acme-native-cf', actions=[native])
    register_preset(acme)
    cleanup_registered.append('acme-native-cf')
    receipt = acme.dispatch(_RevisionHandle(['5', '5']), 'superdoc_perform_action', {'action': 'acme.native-cf'})
    assert receipt['status'] == 'failed'
    assert receipt['partialMutation'] is False
    assert receipt['recovery']['kind'] == 'retry'


# ---------------------------------------------------------------------------
# schema guards + one-call toolkit (review follow-ups)
# ---------------------------------------------------------------------------


def test_define_action_rejects_non_dict_input_schema():
    class _Schemaish:  # stand-in for a Zod/Pydantic schema object
        pass

    with pytest.raises(SuperDocError):
        define_action(name='x.bad', description='d', input_schema=_Schemaish(),
                      run=lambda doc, args: None)


@requires_host
def test_create_agent_toolkit_actions_one_call():
    from superdoc import create_agent_toolkit, list_presets

    stamp = define_action(
        name='superdoc.demo_stamp', description='Insert a demo banner.',
        input_schema={'type': 'object', 'properties': {'label': {'type': 'string'}}},
        steps=[{'action': 'insert_paragraphs', 'args': {'texts': ['{{label}}']}}],
    )
    kit = create_agent_toolkit({'provider': 'openai', 'actions': [stamp]})
    perform = next(t for t in kit['tools'] if (t.get('function') or {}).get('name') == 'superdoc_perform_action')
    names = perform['function']['parameters']['properties']['action']['enum']
    assert 'superdoc.demo_stamp' in names                 # custom action advertised
    assert 'superdoc.demo_stamp' in kit['system_prompt']  # prompt narrows WITH it
    assert callable(kit['dispatch']) and callable(kit['dispatch_async'])
    assert kit['meta']['preset'] == 'custom_superdoc_preset'
    assert 'custom_superdoc_preset' not in list_presets()  # ephemeral — no global register


@requires_host
def test_create_agent_toolkit_actions_conflict_rejected():
    from superdoc import create_agent_toolkit

    a = define_action(name='x.a', description='a',
                      input_schema={'type': 'object', 'properties': {'foo': {'type': 'string'}}},
                      run=lambda doc, args: None)
    b = define_action(name='x.b', description='b',
                      input_schema={'type': 'object', 'properties': {'foo': {'type': 'number'}}},
                      run=lambda doc, args: None)
    with pytest.raises(SuperDocError):
        create_agent_toolkit({'provider': 'openai', 'actions': [a, b]})


@requires_host
def test_create_agent_toolkit_identical_schema_reordered_keys_allowed():
    from superdoc import create_agent_toolkit

    a = define_action(name='x.a', description='a',
                      input_schema={'type': 'object',
                                    'properties': {'foo': {'type': 'string', 'description': 'the foo'}}},
                      run=lambda doc, args: None)
    b = define_action(name='x.b', description='b',
                      input_schema={'type': 'object',
                                    'properties': {'foo': {'description': 'the foo', 'type': 'string'}}},
                      run=lambda doc, args: None)
    kit = create_agent_toolkit({'provider': 'generic', 'actions': [a, b]})
    perform = next(t for t in kit['tools'] if t.get('name') == 'superdoc_perform_action')
    assert 'x.b' in perform['parameters']['properties']['action']['enum']


@requires_host
def test_create_agent_toolkit_shared_arg_compatible_desc_only_allowed():
    """Reusing a built-in arg name with a compatible type + extra DESCRIPTION
    only is allowed (only a structural difference conflicts)."""
    from superdoc import create_agent_toolkit

    a = define_action(name='x.a', description='a',
                      input_schema={'type': 'object', 'properties': {'foo': {'type': 'string'}}},
                      run=lambda doc, args: None)
    b = define_action(name='x.b', description='b',
                      input_schema={'type': 'object',
                                    'properties': {'foo': {'type': 'string', 'description': 'documented'}}},
                      run=lambda doc, args: None)
    kit = create_agent_toolkit({'provider': 'generic', 'actions': [a, b]})
    perform = next(t for t in kit['tools'] if t.get('name') == 'superdoc_perform_action')
    assert 'x.b' in perform['parameters']['properties']['action']['enum']


@requires_host
def test_create_agent_toolkit_shared_arg_one_sided_enum_rejected():
    """A shared arg name where one side adds an enum the other lacks is a real
    conflict (differs beyond description)."""
    from superdoc import create_agent_toolkit

    a = define_action(name='x.a', description='a',
                      input_schema={'type': 'object', 'properties': {'mode': {'type': 'string'}}},
                      run=lambda doc, args: None)
    b = define_action(name='x.b', description='b',
                      input_schema={'type': 'object',
                                    'properties': {'mode': {'type': 'string', 'enum': ['fast', 'slow']}}},
                      run=lambda doc, args: None)
    with pytest.raises(SuperDocError):
        create_agent_toolkit({'provider': 'generic', 'actions': [a, b]})


@requires_host
def test_create_agent_toolkit_dispatch_runs_a_custom_action():
    """Review item: run a custom action through the RETURNED toolkit dispatch."""
    from superdoc import SuperDocClient, create_agent_toolkit

    stamp = define_action(
        name='superdoc.stamp_banner',
        description='Insert a banner at the top of the document.',
        input_schema={'type': 'object', 'properties': {'label': {'type': 'string', 'default': 'CONFIDENTIAL'}}},
        steps=[{'action': 'insert_paragraphs',
                'args': {'texts': ['{{label}}'], 'placement': {'at': 'document_start'}}}],
    )
    kit = create_agent_toolkit({'provider': 'openai', 'actions': [stamp]})
    with SuperDocClient() as client:
        doc = client.open({})  # embedded blank document
        receipt = kit['dispatch'](doc, 'superdoc_perform_action',
                                  {'action': 'superdoc.stamp_banner', 'label': 'CONFIDENTIAL'})
        assert receipt.get('status') == 'succeeded', receipt
        texts = [b.get('text') or '' for b in doc.blocks.list({'includeText': True, 'limit': 6})['blocks']]
        assert any('CONFIDENTIAL' in t for t in texts), texts
        doc.close({'discard': True})
