# Word oracle goldens

These JSON files record how **real Microsoft Word** behaves for specific SDT
(content control) keyboard interactions. They are the expected-behavior source
for `../sdt-word-parity.spec.ts`.

## How they were captured

Each golden was produced by running the scenario on Windows Word 16 through the
`word-api` `run_behavior_probe` tool: it opens the fixture in visible Word,
places the caret relative to `ContentControls(1)`, sends **real keystrokes**
(`WScript.Shell.SendKeys`, not COM `Selection` methods — COM can bypass the
lock-handler paths we care about), and captures selection + content-control
state after each press. Provenance is in each file:

```
"inputMode": "win32-sendkeys-post-tscon"
"source":    "Windows Word real keyboard via WScript.Shell.SendKeys post-tscon"
"wordVersion": "16.0"
```

## How the spec uses them

Word story-character offsets are **not** comparable to ProseMirror positions, so
`sdt-word-parity.spec.ts` does not assert raw offsets. It asserts the
observable, ABI-independent facts these goldens establish:

| Golden | Word fact the spec asserts |
|---|---|
| `*.right-arrow-trailing.*` | one Right-arrow from the trailing edge exits the SDT |
| `*.backspace-from-outside.*` (4 lock modes) | Backspace just outside the trailing edge selects the SDT content first (non-destructive press 1) |
| `*.delete-from-outside.*` | Delete just outside the leading edge selects the SDT content first (symmetric mirror) |
| `*.ctrl-a-inside-sdt.*` | select-all inside an SDT selects the whole document, not just the SDT |
| `*.shift-right-into-sdt.*` | Shift+Right into an SDT is character-granular, not atomic |

## Regenerating / extending

Full methodology, the tscon-reattach discovery that made real keystroke routing
possible, and the complete set of captured scenarios (including inside-edge
Backspace/Delete and Enter-at-block-SDT) are documented out-of-tree in the
review workspace under `.tmp/sd-3237-behavior-tests/word-oracle/`. New goldens
are produced with `run_behavior_probe`; only the JSON (not the `.after.docx`
artifacts) is committed here.
