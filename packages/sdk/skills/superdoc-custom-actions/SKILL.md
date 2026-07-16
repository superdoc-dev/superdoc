---
name: superdoc-custom-actions
description: >-
  Author a custom SuperDoc LLM-tools "action" — a named, deterministic
  document-edit verb that plugs into the core preset's superdoc_perform_action
  tool. Use when the user wants to add a new action (e.g. "build an action that
  adds footnotes / bolds table borders / stamps a banner") or asks how to
  extend SuperDoc's LLM tools with their own document operation. Works with
  installed packages only — no SuperDoc source checkout needed or expected.
---

# Build a SuperDoc custom action

A **custom action** is a named, namespaced verb (`superdoc.<verb>`, e.g.
`superdoc.add_footnote`) that a customer authors once and exposes to an LLM
through `superdoc_perform_action`, alongside the 40 built-in core actions. An
action is **deterministic application code**, not a prompt.

Your job when this skill is active: turn a plain-language request into a
correct, registered, **live-verified** ActionSpec, plus a test. Never hand back
an action you haven't executed against a real document.

---

## 1. The canonical ActionSpec — two execution tiers

```
ActionSpec = {
  name:        "superdoc.<verb>"       # namespaced; must not collide with built-ins
  description: string                  # shown to the model: what it does + when to use it
  input:       JSON Schema (object)    # the action's FLAT args; defaults are honored
  # exactly ONE of:
  steps:  [ {action, args}, ... ]      # TIER 1 — declarative (PREFER THIS)
  run:    (doc, args) -> result        # TIER 2 — native function in your process
}
```

**Tier selection rule — always try in this order:**

1. **`steps`** — can the goal be expressed as a sequence of built-in core
   actions? Then it MUST be steps: you inherit target resolution, placement
   handling, receipts, and per-step verification that the built-ins already
   guarantee. Steps are pure data (shippable as JSON) and behave identically
   from Node and Python.
2. **`run`** — the goal needs an API domain the built-in actions don't cover
   (footnotes, headers/footers, table borders, bookmarks…) or computed logic.
   A native function in YOUR language, called with the typed session-bound
   `doc` handle.

### Tier 1 example — verified working

```python
from superdoc import define_action

stamp = define_action(
    name='superdoc.stamp_confidential',
    description='Insert a confidentiality banner at the top and flag it with a review comment.',
    input_schema={'type': 'object', 'properties': {
        'label': {'type': 'string', 'default': 'CONFIDENTIAL'},
    }, 'required': []},
    steps=[
        {'action': 'insert_paragraphs',
         'args': {'texts': ['{{label}}'], 'placement': {'at': 'document_start'}}},
        {'action': 'add_comments',
         'args': {'selectors': [{'kind': 'textSearch', 'terms': ['{{label}}'], 'occurrence': 1}],
                  'commentText': 'Auto-stamped. Verify distribution before sending.'}},
    ],
)
```

Templating: `"{{label}}"` as a WHOLE string substitutes the raw value (arrays
and objects survive); `"Stamped: {{label}}"` interpolates as text. A caller's
`changeMode` flows into every step that doesn't pin its own. Receipts
aggregate per step: `succeeded` / `partial` (some steps landed — `failedStep`
says which and why) / `failed`.

### Tier 2 example — verified working

Take MODEL-FRIENDLY args (anchor text, ordinals — things an LLM can actually
produce) and resolve low-level targets INSIDE the action. Never expose raw
`TextTarget`/`ref` shapes as action args.

```python
def _add_footnote(doc, args):
    # Resolve anchor text -> a zero-width TextTarget right after the match.
    # NOTE: use includeText + block['text'] — the default textPreview field is
    # truncated to 80 chars, so anchors later in a paragraph are never found.
    # On large documents, paginate with offset/limit (see examples/reference_pack.py)
    # — one unpaginated call may not return every block.
    needle = args['anchorText']
    for block in doc.blocks.list({'includeText': True})['blocks']:
        text = block.get('text') or ''
        pos = text.find(needle)
        if pos >= 0:
            end = pos + len(needle)
            at = {'kind': 'text', 'segments': [{'blockId': block['nodeId'], 'range': {'start': end, 'end': end}}]}
            result = doc.footnotes.insert({'at': at, 'type': args.get('type', 'footnote'), 'content': args['content']})
            after = doc.footnotes.list({})   # re-inspect: prove the footnote exists
            return {'inserted': result, 'footnoteCount': after.get('total', len(after.get('items', [])))}
    raise ValueError(f'anchorText {needle!r} not found in any block')

add_footnote = define_action(
    name='superdoc.add_footnote',
    description='Insert a footnote whose marker lands right after the given anchor text. args: {anchorText, content, type?}.',
    input_schema={'type': 'object', 'properties': {
        'anchorText': {'type': 'string'}, 'content': {'type': 'string'},
        'type': {'type': 'string', 'enum': ['footnote', 'endnote'], 'default': 'footnote'},
    }, 'required': ['anchorText', 'content']},
    run=_add_footnote,
)
```

**Sync vs async — match the host app's doc handle (this trips agents).** The
example above is synchronous. But if the app dispatches through
`dispatch_async` / drives an `AsyncSuperDocClient` (a very common real case —
check the app first), your `run` MUST be `async def` and MUST `await` every
`doc.*` call. The kit awaits the value your run *returns*, but it does NOT make
the inner `doc.*` calls awaitable for you — a sync body on an async handle gets
un-awaited coroutines and fails with `'coroutine' object is not subscriptable`.
Async variant of the body above:

```python
async def _add_footnote(doc, args):
    needle = args['anchorText']
    for block in (await doc.blocks.list({'includeText': True}))['blocks']:
        pos = (block.get('text') or '').find(needle)
        if pos >= 0:
            end = pos + len(needle)
            at = {'kind': 'text', 'segments': [{'blockId': block['nodeId'], 'range': {'start': end, 'end': end}}]}
            result = await doc.footnotes.insert({'at': at, 'type': args.get('type', 'footnote'), 'content': args['content']})
            after = await doc.footnotes.list({})
            return {'inserted': result, 'footnoteCount': after.get('total')}
    raise ValueError(f'anchorText {needle!r} not found in any block')
```

`run` receipts are synthesized for you: `preRevision`/`postRevision`, and on
failure `partialMutation` + a recovery hint. Raise on failure — the exception
becomes a truthful failed receipt with shape
`{status:'failed', errors:[{code, message}], partialMutation, recovery}` — the
message lives at `errors[0].message` (NOT a top-level `error`); assert on that
in your tests. The `examples/` directory next to this file
contains complete, live-verified packs (footnotes + page headers, table
borders) authored exactly this way (in the synchronous form — apply the async
rule above if the host is async).

---

## 2. Register + advertise

**Simplest path — hand your actions to the toolkit (no preset to manage):**

```python
from superdoc import create_agent_toolkit

kit = create_agent_toolkit({'provider': 'openai', 'actions': [stamp, add_footnote]})
# kit['tools'] enum + kit['system_prompt'] now include your actions;
# kit['dispatch'] / kit['dispatch_async'] route them. No register_preset, no id.
```

`create_agent_toolkit({actions})` builds the extended preset internally over
`core` and returns tools + system prompt + dispatch that already agree; provider
shaping (anthropic/openai/vercel/generic) is automatic. (Node:
`createAgentToolkit({ provider, actions })`.) Pass `base` to extend a preset
other than `core`, or `includeCoreActions` to keep only a subset of the
built-ins alongside yours. Schema enum, tool description, system prompt, and
dispatch move together — coherence is the kit's job, not yours.

**Dispatch args are FLAT** — `{action, ...yourArgs}`, never a nested `args`
object:

```python
# async host (this uses dispatch_async); a sync host uses kit['dispatch']
receipt = await kit['dispatch_async'](doc, 'superdoc_perform_action',
    {'action': 'superdoc.add_footnote', 'anchorText': 'the report', 'content': 'See appendix.'})
# NOT {'action': ..., 'args': {...}} — a nested `args` raises
# "Unknown argument(s) for superdoc_perform_action: args".
```

**Integrating into the host app — find its toolkit seam.** Real apps differ;
read the app before writing files:

- The common case: the app already calls `create_agent_toolkit(...)` /
  `createAgentToolkit(...)` (often in one startup function). Just add your
  `actions` to THAT call — one import + one arg. No `register_preset`, no
  `PRESET` constant, no preset id threaded through dispatch.
- If the app has an action-discovery convention (an `actions/` folder it
  auto-loads, an `ACTIONS` list it imports), follow it and feed that list into
  the toolkit call. Do not add scaffolding, CLI flags, or discovery frameworks
  the app doesn't have.

**Advanced — a named, registered preset.** Only if the app uses the standalone
functions (`choose_tools` / `get_system_prompt` / `dispatch_superdoc_tool`) or
genuinely needs a reusable registered preset:

```python
from superdoc import extend_preset, register_preset

register_preset(extend_preset('core', id='custom_superdoc_preset', actions=[stamp, add_footnote]))
# then pass preset='custom_superdoc_preset' to choose_tools / get_system_prompt / dispatch_superdoc_tool
```

Reuse the app's existing extended-preset id if it has one; otherwise the
conventional default is `custom_superdoc_preset` — not an invented codename.

---

## 3. Discovery — you have no source access, and you don't need it

**Built-in action names + args** (decides steps-vs-run):

```python
from superdoc import choose_tools
perform = next(t['function'] for t in choose_tools({'provider': 'openai', 'preset': 'core'})['tools']
               if t['function']['name'] == 'superdoc_perform_action')
print(perform['parameters']['properties']['action']['enum'])   # the 40 built-ins
print(sorted(perform['parameters']['properties']))              # every advertised arg
print(perform['description'])                                   # grouped hints per action
```

**Native `doc.*` surface** (for the run tier) — the client self-describes; use
that FIRST, it beats trial-and-error:

```python
from superdoc import SuperDocClient
with SuperDocClient() as client:
    contract = client.describe()                       # ALL operations (~439) with ids like 'doc.tables.setBorders'
    print(sorted({op['id'].split('.')[1] for op in contract['operations']}))   # the namespaces
    spec = client.describe_command({'operationId': 'tables.setBorders'})       # full input contract for one op
    print(spec['operation'])
```

Then confirm against a live session on a COPY of a sample doc:

```python
    doc = client.open({'doc': 'work-copy.docx'})
    print([m for m in dir(doc.tables) if not m.startswith('_')])   # methods (snake_case + camelCase both work)
    print(doc.blocks.list()['blocks'][:3])                          # rows: ordinal, nodeId, nodeType, textPreview, ref
    doc.close({'discard': True})
```

Note: `dir(doc)` does NOT list the namespaces (they're dynamic attributes on
the Python handle) — `client.describe()` is the namespace directory;
`dir(doc.<ns>)` works once you know the namespace.

**Let errors teach you — but confirm params with `describe_command`, never
with a successful call.** Most inputs are validated against the real contract
and error messages enumerate the valid unions. Two traps, both observed live:

- Some ops **silently drop unknown params**: `headerFooters.parts.create`
  returns `success: true` for `{'content': ...}` while writing nothing — the
  success receipt lies about the param having done anything.
- Union error messages can mislead: `blocks.list({'in': ...})` prints
  `in.kind must be one of: "story","story","story"` and `storyType must equal
  "body"` even though richer story kinds are valid. Only
  `describe_command({'operationId': 'blocks.list'})` shows the real union.

Budget for iteration: some ops reveal ONE missing required field per probe
(`tables.setBorders` took six rounds that way — `describe_command` gives the
whole contract in one).

**Stories (header/footer content).** Body is only one story of a document.
Header/footer text is written with ordinary content ops pointed INTO a story:
`doc.create.paragraph({..., 'in': {'kind':'story','storyType':'headerFooterPart','refId': ...}})`,
or a slot story with `onWrite: 'materializeIfInherited'` (auto-creates and
wires the part). Wiring evidence comes from `doc.headerFooters.get(...)`
(refId/isExplicit); **header/footer TEXT has no in-session read-back**
(`blocks.list` returns body blocks regardless of `in`, `doc.get` omits header
parts) — save to a file and inspect the zip (`word/header1.xml`) for
text-level evidence.

**Finding table/row/cell handles:** `doc.blocks.list()` rows with
`nodeType == 'table'` carry the table `nodeId`; `doc.tables.get_cells(...)` /
`doc.tables.get_properties(...)` take it from there (probe their input shape
with a small call and read the validation error).

---

## 4. Verification — two layers; degrade honestly, never silently

**Layer 1 — contract validation. ALWAYS, no document needed.** Every operation
your action calls must be confirmed against
`client.describe_command({'operationId': ...})`: the op exists and your arg
shapes match its contract. Never confirm a param with a successful call —
some ops silently drop unknown params and report success anyway. This layer is
seconds of work and catches most authoring mistakes.

**Layer 2 — live semantic verification. When a document is available.** A run
on a COPY of a real document showing a `succeeded` receipt AND independent
evidence the document actually changed (re-inspect: `doc.blocks.list()` shows
the banner at ordinal 0, `doc.footnotes.list({})` count went up, borders read
back different; for header/footer text, saved-zip XML).

**Finding a document for layer 2, in order:**

1. Glob the workspace for `*.docx`, skipping outputs (`out*.docx`), Word lock
   files (`~$*`), and `.venv`/`node_modules`/state dirs. Prefer conventional
   homes first: `sample_docs/`, `fixtures/`, `tests/data/`.
2. Check suitability, not just existence: open a COPY, one `countsOnly`
   inspect — does it contain what the action targets (images, footnotes,
   tables)? If not, can you PLANT the conditions on the copy first (built-in
   actions or raw ops, e.g. `doc.footnotes.insert` before testing a renumber
   action)?
3. No usable document? **Open a blank one — built in.** `client.open({})`
   (no `doc` at all) starts a session from the SDK's embedded blank document,
   in both languages; `doc.save({'out': ...})` materializes it as a real file.
   PLANT the conditions your action needs on it (built-in actions or raw ops,
   e.g. `create_table`, `doc.footnotes.insert`), then verify against it.
4. Conditions you cannot synthesize (images, embedded objects, messy
   real-world structure) and a human is present: **ask the user for a
   representative document.** This is the one legitimate reason to stop and
   ask.
5. Nobody to ask (headless/CI) and synthesis impossible: **deliver anyway, as
   a DRAFT** — do not block, do not fabricate.

A generated-fixture verification is real layer-2 evidence for the mechanics,
but say so in your summary ("verified against a generated fixture") — it
proves the action works, not that it handles the customer's real documents.

**Draft labeling — when layer 2 did not run:** the action file's docstring AND
your final message must say plainly: *"DRAFT — contract-validated, not yet
executed against a document."* Still write the pytest (see below) so the
customer's first real run IS the verification. Never present an unexecuted
action as verified; a false "tested ✓" is worse than no action at all.

**A test is required in BOTH modes** — in `tests/`, following the existing
suite's pattern; if the app has NO test suite yet, create `tests/` plus a
conftest that wires the environment the same way the app does (e.g. read
`SUPERDOC_CLI_BIN` from the app's `.env`). Tests open a fresh doc (or tmp
copy), dispatch through the toolkit (or a registered preset), and assert receipt
fields plus re-inspected evidence. Failure honesty matters — if your action can partially
apply, test that path too.

Two receipt/fixture facts your tests must account for:
- **Status vocabulary differs by layer**: custom-action receipts report
  `succeeded`/`partial`/`failed`, but dispatching a BUILT-IN action directly
  (e.g. while planting conditions) returns `status: "ok"`. Accept both where
  appropriate.
- **A truly blank document interleaves empty paragraphs** around inserted
  texts (`['', 'AAA', '', 'BBB']`), so tail/count assertions against the bare
  embedded blank doc are unstable — plant body content first, then assert.

Never claim success from `status: 'succeeded'` alone — receipts synthesized for
`run`-tier actions confirm your code returned, not that the effect you intended
landed. Re-inspect.

**Clean up when you finish.** Verification leaves scratch behind — delete it so
the only new files are the action module and its test. Remove: any `.docx` you
opened/saved/generated for verification, session-state dirs the host created
(e.g. `.superdoc-state/`, `.superdoc-cli-state/`), a stray `out.docx`, and
`__pycache__/` from test runs. Do NOT delete the app's own sample documents,
seed assets, or anything that existed before you started. When in doubt, list
what you created and remove exactly that.

"Before" evidence can legitimately be ABSENT: style-inherited formatting reads
back with no explicit property at all (e.g. a `TableGrid`-styled table has no
`borders` key until direct borders are set). Compare "absent → explicit value",
don't assume a numeric before-state exists.

Read-back may NORMALIZE identifiers (e.g. a bookmark inserted with one blockId
can read back with a normalized id). Verify by stable evidence — names,
offsets, counts, saved-XML content — not by identifier equality.

---

## 5. Naming, schema, and description discipline

- Names: `superdoc.<verb>` — dots are valid in the merged enum. (Only
  `standalone` mode forbids dots, because provider tool names must match
  `^[A-Za-z0-9_-]{1,64}$`.)
- Never collide with built-in names — the kit rejects it.
- `description` is model-facing: one sentence on WHAT + one on WHEN, and name
  the args inline (models call better with `args: {at, content}` spelled out).
- Every arg gets a JSON-Schema property; put `default` on optionals — defaults
  are applied on all tiers. Mark true requirements in `required`.

## 6. Pitfalls (each of these bit a real implementation)

- **Reusing a built-in arg name:** custom actions merge into the ONE
  `superdoc_perform_action` schema, so a shared arg name maps to a single
  schema. Reusing a built-in name (`anchorText`, `text`, `caseSensitive`, …) is
  fine **only if your schema matches the built-in's exactly except for
  `description`** — a differing `type`, `enum` (including one side having one),
  `default`, limit, or pattern is a real conflict and the kit rejects it (the
  merged surface can advertise only one schema per name). A description-only
  difference is allowed, but the built-in's schema wins the merge so your
  description is not advertised — use a distinct arg name if you need it. Cross-
  check with §3's `sorted(perform['parameters']['properties'])`.
- **Async host apps (very common — inspect the app first):** if it dispatches
  via `dispatch_async` or an `AsyncSuperDocClient`, your `run` function MUST be
  `async def` and `await` every `doc.*` call. A synchronous body on an async
  handle hands back un-awaited coroutines and fails with `'coroutine' object is
  not subscriptable`. (See §1's async variant.) A synchronous app is the
  mirror: a plain `def run`.
- **Do not insert content via raw ops in `run` actions** — e.g.
  `doc.create.paragraph({placement: 'before', ...})` silently IGNORES placement
  and appends at document end. The built-in `insert_paragraphs` action resolves
  placement correctly — compose it via `steps` instead (or mix: a steps action
  for the insert, run for the rest).
- **Comment anchoring:** `doc.comments.create` with a `{text: ...}` target can
  return success without a visible comment. Use the built-in `add_comments`
  action (selector-resolved, verified) via `steps`.
- **Two failure shapes:** argument-validation errors THROW; runtime failures
  return `{'status': 'failed', ...}` receipts. Wrap dispatch in try/except and
  handle both.
- **Refs expire on mutation.** Any `ref` you fetched before an edit is invalid
  after it — re-list/re-search instead of caching handles across mutations.
- **Python handles return plain dicts** and accept both `snake_case` and
  `camelCase` method names; results use camelCase keys (`textPreview`,
  `nodeId`).
- **Some open string inputs are NOT enum-validated by the host** (e.g.
  `tables.setBorders` persists any `lineStyle` string verbatim — `zigzag`
  round-trips). Constrain such inputs with an `enum` in YOUR action's input
  schema so the model can't invent values.
- **`insert_paragraphs` rejects empty strings in `texts`** — you cannot
  compose a blank spacer paragraph declaratively; a `""` entry fails the whole
  action. Design steps-tier layouts without empty-line spacers.
- **Sandboxed agent environments:** the SDK's host bootstrap may `chmod` its
  bundled binary and write state under `~/.superdoc-cli` — both can be blocked
  by an agent sandbox. If `client.open` fails on permissions, set
  `SUPERDOC_CLI_BIN` to the installed binary and `SUPERDOC_CLI_STATE_DIR` to a
  writable path inside your workspace.

## 7. Worked examples

The `examples/` directory next to this file contains complete, live-verified
action packs (declarative steps, footnotes/page headers, table borders) with
their receipt-synthesis and verification patterns — in Python and JavaScript
(`policy_pack.py` / `policy_pack.mjs` are twins; the kit API maps 1:1 across
languages). Pattern-match them. There is
no bundled API reference by design — the live contract from `client.describe()`
/ `client.describe_command(...)` (§3) is always current; a bundled copy would
drift.
