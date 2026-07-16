"""Smoke test for the Python `core` preset (proxy to Node SDK preset via CLI).

Verifies the cross-language path end-to-end:

  1. ``choose_tools({preset: 'core', provider: 'openai'})`` returns the 2 LLM
     tools the Node core preset advertises (``superdoc_inspect``,
     ``superdoc_perform_action``) — superdoc_execute_code is WIP and not
     advertised.
  2. ``get_system_prompt('core')`` proxies through the CLI and returns the
     bundled Node actions-only system prompt (currently 20K+ chars).
  3. ``dispatch_superdoc_tool(doc, 'superdoc_perform_action', {...}, preset='core')``
     actually mutates the open session — the new paragraph is observable in
     the saved document.

Run with ``SUPERDOC_CLI_BIN=/abs/path/to/apps/cli/dist/index.js`` if the
companion-CLI package is not installed in the local interpreter.
"""

from __future__ import annotations

import json
import os
import shutil
import sys
import tempfile
from pathlib import Path
from typing import Any, Dict

# Allow running from a source checkout: prepend the python SDK package dir.
HERE = Path(__file__).resolve().parent
SDK_ROOT = HERE.parent
sys.path.insert(0, str(SDK_ROOT))

from superdoc import (  # noqa: E402
    SuperDocClient,
    choose_tools,
    dispatch_superdoc_tool,
    get_system_prompt,
    list_presets,
)


# Repo-relative so the smoke test runs from any checkout. Uses a tracked
# super-editor test fixture (the demo apps and their fixtures are local-only).
REPO_ROOT = HERE.parents[4]
FIXTURE_PATH = str(
    REPO_ROOT / 'packages' / 'super-editor' / 'src' / 'editors' / 'v1' / 'tests' / 'data' / 'basic-paragraph.docx'
)
INSERTED_TEXT = 'Hello from Python via core preset.'


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

    presets = list_presets()
    _assert('core' in presets, f"list_presets() includes 'core' (got {presets})")

    # ---- choose_tools ----------------------------------------------------
    _section('choose_tools({preset:core, provider:openai})')
    chooser = choose_tools({'provider': 'openai', 'preset': 'core'})
    tool_count = chooser['meta']['toolCount']
    print(f'  toolCount: {tool_count}')
    print(f"  preset: {chooser['meta']['preset']}")
    _assert(tool_count == 2, f'core preset advertises exactly 2 tools (got {tool_count})')

    tool_names = sorted(t.get('function', t).get('name') for t in chooser['tools'])
    print(f'  tools: {tool_names}')
    _assert(
        set(tool_names) == {'superdoc_inspect', 'superdoc_perform_action'},
        f'core preset exposes superdoc_inspect and superdoc_perform_action (got {tool_names})',
    )

    # ---- get_system_prompt ----------------------------------------------
    _section("get_system_prompt('core')")
    prompt = get_system_prompt('core')
    print(f'  prompt length: {len(prompt)}')
    _assert(len(prompt) > 20_000, f'core preset system prompt > 20K chars (got {len(prompt)})')

    # ---- dispatch_superdoc_tool(superdoc_perform_action) ---------------------------
    # Work against a copy so the fixture itself stays unchanged on disk.
    with tempfile.TemporaryDirectory() as tmp:
        working_copy = Path(tmp) / 'fixture.docx'
        shutil.copy2(fixture, working_copy)
        output_copy = Path(tmp) / 'after.docx'

        env_overrides: Dict[str, str] = {}
        # Force the local source CLI when no companion package is installed
        # (works in dev checkouts; ignored in published wheels).
        cli_bin_env = os.environ.get('SUPERDOC_CLI_BIN')
        if not cli_bin_env:
            default_dev_cli = str(SDK_ROOT.parents[3] / 'apps/cli/dist/index.js')
            if Path(default_dev_cli).exists():
                env_overrides['SUPERDOC_CLI_BIN'] = default_dev_cli

        with SuperDocClient(env=env_overrides or None) as client:
            doc = client.open({'doc': str(working_copy)})
            _section('dispatch_superdoc_tool(superdoc_perform_action, preset=core)')
            result = dispatch_superdoc_tool(
                doc,
                'superdoc_perform_action',
                {'action': 'insert_paragraphs', 'text': INSERTED_TEXT},
                preset='core',
            )
            # Print a compact summary; the full receipt is verbose.
            if isinstance(result, dict):
                summary = {
                    'status': result.get('status'),
                    'intent': result.get('intent'),
                    'verificationPassed': result.get('verificationPassed'),
                }
                print(f'  receipt: {json.dumps(summary)}')
            else:
                print(f'  receipt: {result!r}')

            doc.save({'out': str(output_copy), 'mode': 'final', 'force': True})
            # The save above writes to --out; the working session is still dirty
            # (in-place hasn't been written). Discard the session to release it
            # cleanly without re-saving over the fixture copy.
            doc.close({'discard': True})

        # ---- Confirm the doc was actually mutated -----------------------
        _section('Verify mutation')
        if not output_copy.exists():
            print(f'FAIL: expected saved copy at {output_copy}')
            sys.exit(1)
        # DOCX is a zip; inspect document.xml for the inserted text.
        import zipfile

        found = False
        with zipfile.ZipFile(output_copy) as zf:
            for name in ('word/document.xml', 'word/document2.xml'):
                if name in zf.namelist():
                    xml = zf.read(name).decode('utf-8', errors='replace')
                    if INSERTED_TEXT in xml:
                        found = True
                        break
        _assert(found, f'inserted paragraph text "{INSERTED_TEXT}" found in saved docx')

    print()
    print('SMOKE PASSED.')
    return {'tools': tool_count, 'prompt_chars': len(prompt), 'mutation_observed': True}


if __name__ == '__main__':
    main()
