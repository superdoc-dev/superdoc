"""Smoke test for Python custom actions (footnotes) over the `core` preset.

Mirrors ``smoke_core_preset.py``. Verifies the cross-language path:

  1. ``register_preset(extend_preset('core', id='acme', actions=footnote_actions))``
     makes ``acme`` resolvable.
  2. ``choose_tools({preset:'acme', provider:'anthropic'})`` shows the footnote
     action names in the ``superdoc_perform_action`` enum.
  3. ``dispatch_superdoc_tool(doc, 'superdoc_perform_action', {action:'footnotes.add', ...},
     preset='acme')`` runs the run-tier action against the host; ``footnotes.list``
     then shows the inserted note.

Run with ``SUPERDOC_CLI_BIN=/abs/path/to/apps/cli/dist/index.js`` if the
companion-CLI package is not installed in the local interpreter.
"""

from __future__ import annotations

import os
import shutil
import sys
import tempfile
from pathlib import Path
from typing import Any, Dict

HERE = Path(__file__).resolve().parent
SDK_ROOT = HERE.parent
sys.path.insert(0, str(SDK_ROOT))

from superdoc import (  # noqa: E402
    SuperDocClient,
    choose_tools,
    dispatch_superdoc_tool,
    list_presets,
    register_preset,
    unregister_preset,
)
from superdoc.presets.custom import extend_preset  # noqa: E402
from footnote_fixture import footnote_actions  # noqa: E402

REPO_ROOT = HERE.parents[4]
# Same fixture the Node custom-actions e2e test uses.
FIXTURE_PATH = str(
    REPO_ROOT / 'packages' / 'super-editor' / 'src' / 'editors' / 'v1' / 'tests' / 'data' / 'advanced-text.docx'
)


def _section(title: str) -> None:
    print()
    print(f'== {title} ==')


def _assert(condition: bool, message: str) -> None:
    if not condition:
        print(f'FAIL: {message}')
        sys.exit(1)
    print(f'  ok — {message}')


def main() -> Dict[str, Any]:
    fixture = Path(FIXTURE_PATH)
    if not fixture.exists():
        print(f'FAIL: fixture missing at {fixture}')
        sys.exit(1)

    # ---- register acme ---------------------------------------------------
    register_preset(extend_preset('core', id='acme', actions=footnote_actions))
    try:
        _assert('acme' in list_presets(), "list_presets() includes 'acme'")

        # ---- choose_tools ------------------------------------------------
        _section('choose_tools({preset:acme, provider:anthropic})')
        chooser = choose_tools({'provider': 'anthropic', 'preset': 'acme'})
        action_tool = next((t for t in chooser['tools'] if t.get('name') == 'superdoc_perform_action'), None)
        _assert(action_tool is not None, 'superdoc_perform_action tool present')
        names = action_tool['input_schema']['properties']['action']['enum']
        for r in footnote_actions:
            _assert(r['name'] in names, f"{r['name']} in superdoc_perform_action enum")

        # ---- dispatch footnotes.add + footnotes.list ---------------------
        with tempfile.TemporaryDirectory() as tmp:
            working_copy = Path(tmp) / 'fixture.docx'
            shutil.copy2(fixture, working_copy)

            env_overrides: Dict[str, str] = {}
            cli_bin_env = os.environ.get('SUPERDOC_CLI_BIN')
            if not cli_bin_env:
                default_dev_cli = str(SDK_ROOT.parents[3] / 'apps/cli/dist/index.js')
                if Path(default_dev_cli).exists():
                    env_overrides['SUPERDOC_CLI_BIN'] = default_dev_cli

            with SuperDocClient(env=env_overrides or None) as client:
                doc = client.open({'doc': str(working_copy)})

                blocks = doc.blocks.list({'limit': 50, 'includeText': True})
                para = next(
                    (b for b in blocks['blocks'] if b['nodeType'] == 'paragraph' and (b.get('text') or '')),
                    None,
                )
                _assert(para is not None, 'found a non-empty body paragraph to anchor on')
                at = {'kind': 'text', 'segments': [{'blockId': para['nodeId'], 'range': {'start': 0, 'end': 0}}]}

                _section('dispatch footnotes.add (preset=acme)')
                add = dispatch_superdoc_tool(
                    doc,
                    'superdoc_perform_action',
                    {'action': 'footnotes.add', 'at': at, 'content': 'Inserted by footnotes.add (Python).'},
                    preset='acme',
                )
                print(f'  receipt status: {add.get("status")}, action: {add.get("action")}')
                _assert(add.get('action') == 'footnotes.add', 'receipt action is footnotes.add')
                _assert(add.get('status') == 'succeeded', 'footnotes.add succeeded')

                _section('dispatch footnotes.list (preset=acme)')
                listed = dispatch_superdoc_tool(
                    doc, 'superdoc_perform_action', {'action': 'footnotes.list'}, preset='acme'
                )
                items = (listed.get('result') or {}).get('items') or []
                print(f'  footnotes listed: {len(items)}')
                _assert(listed.get('status') == 'succeeded', 'footnotes.list succeeded')
                _assert(len(items) >= 1, 'at least one footnote present after add')

                doc.close({'discard': True})
    finally:
        unregister_preset('acme')

    print()
    print('SMOKE PASSED.')
    return {'mutation_observed': True}


if __name__ == '__main__':
    main()
