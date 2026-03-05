# SuperDoc

A document editing and rendering library for the web.

## Architecture: Rendering

SuperDoc uses its own rendering pipeline — **ProseMirror is NOT used for visual output**.

```
PM Doc (hidden) → pm-adapter → FlowBlock[] → layout-engine → Layout[] → DomPainter → DOM
```

- `PresentationEditor` wraps a hidden ProseMirror `Editor` instance for document state and editing commands
- The hidden Editor's contenteditable DOM is never shown to the user
- **DomPainter** (`layout-engine/painters/dom/`) owns all visual rendering
- Style-resolved properties (backgrounds, fonts, borders, etc.) must flow through `pm-adapter` → DomPainter, not through PM decorations

### Where visual changes go

| Change | Where |
|--------|-------|
| How something looks | `pm-adapter/` (data) + `painters/dom/` (rendering) |
| Style resolution | `style-engine/` |
| Editing behavior | `super-editor/src/extensions/` |

**Do NOT** add ProseMirror decoration plugins for visual styling — DomPainter handles rendering.

### State Communication

State flows from super-editor → Layout Engine via:
- `PresentationEditor.ts` listens to editor events (`super-editor/src/core/presentation-editor/`)
- Calls DomPainter methods to update state
- DomPainter re-renders with new state

## Project Structure

```
packages/
  superdoc/          Main entry point (npm: superdoc)
  react/             React wrapper (@superdoc-dev/react)
  super-editor/      ProseMirror editor (@superdoc/super-editor)
  layout-engine/     Layout & pagination pipeline
    contracts/       - Shared type definitions
    pm-adapter/      - ProseMirror → Layout bridge
    layout-engine/   - Pagination algorithms
    layout-bridge/   - Pipeline orchestration
    painters/dom/    - DOM rendering
    style-engine/    - OOXML style resolution
  ai/                AI integration
  collaboration-yjs/ Collaboration server
shared/              Internal utilities
e2e-tests/           Playwright tests
tests/visual/        Visual regression tests (Playwright + R2 baselines)
```

## Where to Look

| Task | Location |
|------|----------|
| React integration | `packages/react/src/SuperDocEditor.tsx` |
| Editing features | `super-editor/src/extensions/` |
| Presentation mode visuals | `layout-engine/painters/dom/src/renderer.ts` |
| DOCX import/export | `super-editor/src/core/super-converter/` |
| Style resolution | `layout-engine/style-engine/` |
| Main entry point (Vue) | `superdoc/src/SuperDoc.vue` |
| Visual regression tests | `tests/visual/` (see its CLAUDE.md) |
| Document API contract | `packages/document-api/src/contract/operation-definitions.ts` |
| Adding a doc-api operation | See `packages/document-api/README.md` § "Adding a new operation" |
| SDK + Collab + LLM demo | `examples/sdk-poc/` |
| Collaboration agent demo | `examples/collaboration/superdoc-yjs/` |

## SDK POC (Document API Testing)

`examples/sdk-poc/` is a three-tier demo for testing the Document API SDK with real-time collaboration and AI-powered document verification.

### Architecture

```
┌─────────────┐     WebSocket      ┌──────────────────┐
│   Client    │ ◄─────────────────► │     Server       │
│  (Vue 3)    │    :3050            │  (Fastify + Yjs) │
│   :5173     │                     │                  │
└─────────────┘                     └────────▲─────────┘
                                             │
                            SDK poll (5s)    │
                                             │
                                    ┌────────┴─────────┐
                                    │   Agent (Node    │
                                    │   or Python)     │
                                    │   + OpenAI LLM   │
                                    └──────────────────┘
```

| Component | Location | Purpose |
|-----------|----------|---------|
| Server | `examples/sdk-poc/server/` | Yjs collaboration hub (Fastify WebSocket) |
| Client | `examples/sdk-poc/client/` | Vue 3 SuperDoc editor with collab UI |
| Node Agent | `examples/sdk-poc/node/` | SDK demo with OpenAI tool-calling |
| Python Agent | `examples/sdk-poc/python/` | Async Python equivalent |

### Running the POC

```bash
# Node agent version
./examples/sdk-poc/run-node.sh

# Python agent version
./examples/sdk-poc/run-python.sh
```

Requires `OPENAI_API_KEY` in `node/.env` or `python/.env` (copy from `.env.example`).

### SDK Integration Patterns

The agents demonstrate key SDK usage:

```typescript
// Create client and join collaboration room
const client = createSuperDocClient({ user: { name: 'Agent' } });
await client.doc.open({ collabUrl, collabDocumentId });

// Poll for changes
const info = await client.doc.info({});
const text = await client.doc.getText({});

// LLM tool-calling integration
const tools = await chooseTools({ provider: 'openai', profile: 'readonly', budget: 8 });
const result = await dispatchSuperDocTool(client, toolName, args);
```

Key SDK functions: `createSuperDocClient()`, `doc.open()`, `doc.info()`, `doc.getText()`, `chooseTools()`, `dispatchSuperDocTool()`, `inferDocumentFeatures()`.

## SDK + LLM Tools Gotchas

These issues were discovered while building `examples/collaboration/superdoc-yjs/agent.ts`. They need proper documentation.

### Collaboration provider type

When using the `collaboration` object in `doc.open()`, you must specify `providerType`. The shorthand `collabUrl`/`collabDocumentId` defaults to `'hocuspocus'`, but y-websocket servers (like `superdoc-yjs-collaboration`) require `'y-websocket'`:

```typescript
await client.doc.open({
  collaboration: {
    providerType: 'y-websocket',  // Required for y-websocket servers
    url: 'ws://localhost:3050/collaboration',
    documentId: 'my-doc',
  },
});
```

### LLM tool schema issues

Some tools have `"type": "json"` in their schemas which is not valid JSON Schema. OpenAI rejects them with "Invalid schema". Exclude these until codegen is fixed:

```typescript
const { tools } = await chooseTools({
  provider: 'openai',
  policy: {
    forceExclude: [
      'apply_mutations', 'preview_mutations',
      'doc_mutations_apply', 'doc_mutations_preview',
      'doc_lists_setLevelRestart', 'doc_lists_setValue',
      'doc_sections_setPageBorders', 'set_list_level_restart',
      'set_list_value', 'set_section_page_borders',
    ],
  },
});
```

### Getting mutation tools

By default, `chooseTools()` uses `mode: 'essential'` which returns a limited set of tools. To get mutation tools like `insert_content`:

```typescript
// npm SDK v1.0.0-alpha.44
const { tools } = await chooseTools({
  provider: 'openai',
  mode: 'all',                           // Get all tools including mutations
  groups: ['core', 'format', 'create'],  // Ensure these groups are included
});

// Then filter out LLM-incompatible tools manually
const EXCLUDED = new Set(['apply_mutations', 'query_match']);
const usableTools = tools.filter((t) => !EXCLUDED.has(t.function.name));
```

### Tool parameter complexity

The `insert_content` tool has a complex `target` schema requiring `kind`, `blockId`, and `range`. For simple appends, omit `target` entirely:

```typescript
// Insert at end of document - just pass value, no target
{ "value": "text to append" }
```

### Markdown content insertion

The SDK supports markdown formatting in `insert_content`. Pass `type: "markdown"` to parse headings, bold, italic:

```typescript
{ "value": "# New Chapter\n\nThis is **bold** and *italic* text.", "type": "markdown" }
```

## Collaboration Agent Example

`examples/collaboration/superdoc-yjs/` demonstrates a real-time AI writing agent that collaborates with human users.

### Architecture

```
┌─────────────┐     y-websocket      ┌──────────────────┐
│   Client    │ ◄───────────────────► │     Server       │
│  (Vue 3)    │    :3050              │  (Fastify + Yjs) │
│   :5173     │                       │                  │
└─────────────┘                       └────────▲─────────┘
       ▲                                       │
       │ awareness                    y-websocket + SDK
       │ (status)                              │
       │                              ┌────────┴─────────┐
       └──────────────────────────────│   Agent (Node)   │
                                      │   + OpenAI LLM   │
                                      └──────────────────┘
```

### Key Files

| File | Purpose |
|------|---------|
| `agent.ts` | AI agent that listens for changes and continues writing |
| `server.ts` | Yjs collaboration server (Fastify + y-websocket) |
| `src/App.vue` | Vue client with status indicator |

### Running

```bash
cd examples/collaboration/superdoc-yjs
cp .env.example .env  # Add OPENAI_API_KEY
pnpm dev              # Runs server, client, and agent concurrently
```

### Agent Patterns

#### Real-time updates via Yjs

The agent connects to the same Yjs room as the client and listens for remote document changes:

```typescript
const provider = new WebsocketProvider(COLLAB_URL, documentId, ydoc);

ydoc.on('update', (_update, origin) => {
  // Only trigger on remote changes (origin is the provider for remote updates)
  if (origin === provider) {
    onUpdate();
  }
});
```

#### Debouncing with AbortController

Wait for user to stop typing before processing, with cancellation support:

```typescript
function createDebouncedHandler(handler, delayMs) {
  let timeoutId = null;
  let abortController = null;

  const cancel = () => {
    if (timeoutId) clearTimeout(timeoutId);
    if (abortController) abortController.abort();
  };

  const trigger = () => {
    cancel();
    timeoutId = setTimeout(async () => {
      abortController = new AbortController();
      await handler(abortController.signal);
    }, delayMs);
  };

  return { trigger, cancel };
}
```

#### Preventing infinite loops

The agent's own writes trigger Yjs updates. Use a flag to ignore self-triggered updates:

```typescript
let isAgentWriting = false;

// When executing tools:
isAgentWriting = true;
await dispatchSuperDocTool(client, toolName, args);
setTimeout(() => { isAgentWriting = false; }, 500); // Delay for sync propagation

// When handling updates:
if (isAgentWriting) return; // Ignore our own writes
```

#### Content buffering

Track last-seen content to avoid re-prompting on unchanged documents:

```typescript
let lastSeenContent = '';

// Before prompting LLM:
if (currentContent === lastSeenContent) return;
const newContent = currentContent.slice(lastSeenContent.length).trim();
if (newContent.length === 0) return;

// After writing:
lastSeenContent = await client.doc.getText({});
```

#### Status broadcasting via Yjs awareness

Broadcast agent status to all clients using Yjs awareness protocol:

```typescript
// Agent broadcasts status
provider.awareness.setLocalStateField('agent', {
  status: 'working',  // 'idle' | 'starting' | 'working' | 'done' | 'error'
  message: 'Executing: insert_content',
  timestamp: Date.now(),
});

// Client receives via onAwarenessUpdate callback
const onAwarenessUpdate = ({ states }) => {
  for (const state of Object.values(states)) {
    if (state?.agent) {
      agentStatus.value = state.agent.status;
      agentMessage.value = state.agent.message;
    }
  }
};
```

#### Agentic/ReAct loop

The standard pattern for LLM tool-calling agents:

```typescript
while (true) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages,
    tools,
    tool_choice: isFirstCall ? 'required' : 'auto',
  });

  const message = response.choices[0].message;
  messages.push(message);

  if (!message.tool_calls?.length) {
    return message.content; // Done
  }

  for (const call of message.tool_calls) {
    const result = await dispatchSuperDocTool(client, call.function.name, JSON.parse(call.function.arguments));
    messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
  }
}
```

## Style Resolution Boundary

**The importer stores raw OOXML properties. The style-engine resolves them at render time.**

- The converter (`super-converter/`) should only parse and store what is explicitly in the XML (inline properties, style references). It must NOT resolve style cascades, conditional formatting, or inherited properties.
- The style-engine (`layout-engine/style-engine/`) is the single source of truth for cascade logic. All style resolution (defaults → table style → conditional formatting → inline overrides) happens here.
- Both rendering systems call the style-engine to compute final visual properties.

**Why**: Resolving styles during import bakes them into node attributes as inline properties. On export, these get written as direct formatting instead of style references, losing the original document intent.

## When to Modify Which System

- **Visual rendering**: Modify `pm-adapter/` (to feed data) and/or `painters/dom/` (to render it)
- **Style resolution**: Modify `style-engine/` — called by pm-adapter during conversion
- **Editing commands/behavior**: Modify `super-editor/src/extensions/`
- **State bridging**: Modify `PresentationEditor.ts`

## Document API Contract

The `packages/document-api/` package uses a contract-first pattern with a single source of truth.

- **`operation-definitions.ts`** — canonical object defining every operation's key, metadata, member path, reference doc path, and group. All downstream maps are projected from this file automatically.
- **`operation-registry.ts`** — type-level registry mapping each operation to its `input`, `options`, and `output` types.
- **`invoke.ts`** — `TypedDispatchTable` validates dispatch wiring against the registry at compile time.

Adding a new operation touches 4 files: `operation-definitions.ts`, `operation-registry.ts`, `invoke.ts` (dispatch table), and the implementation. See `packages/document-api/README.md` for the full guide.

Do NOT hand-edit `COMMAND_CATALOG`, `OPERATION_MEMBER_PATH_MAP`, `OPERATION_REFERENCE_DOC_PATH_MAP`, or `REFERENCE_OPERATION_GROUPS` — they are derived from `OPERATION_DEFINITIONS`.

## JSDoc types

Many packages use `.js` files with JSDoc `@typedef` for type definitions (e.g., `packages/superdoc/src/core/types/index.js`). These typedefs ARE the published type declarations — `vite-plugin-dts` generates `.d.ts` files from them.

- **Keep JSDoc typedefs in sync with code.** If a function destructures `{ a, b, c }`, the `@typedef` must include all three properties. Missing properties become type errors for consumers.
- **Verify types after adding parameters.** When adding a parameter to a function, update its `@typedef` or `@param` JSDoc. Build with `pnpm run --filter superdoc build:es` and check the generated `.d.ts` in `dist/`.
- **Workspace packages don't publish types.** `@superdoc/common`, `@superdoc/contracts`, etc. are private. If a public API references their types, those types must be inlined or resolved through path aliases — consumers can't resolve workspace packages.

## Commands

- `pnpm build` - Build all packages
- `pnpm test` - Run tests
- `pnpm dev` - Start dev server (from examples/)
- `pnpm run generate:all` - Generate all derived artifacts (schemas, SDK clients, tool catalogs, reference docs)

## Generated Artifacts

These directories are produced by `pnpm run generate:all`:

| Directory | In git? | What it contains |
|-----------|---------|-----------------|
| `packages/document-api/generated/` | No (gitignored) | Agent tool schemas, JSON schemas, manifest |
| `apps/cli/generated/` | No (gitignored) | SDK contract JSON exported from CLI metadata |
| `packages/sdk/langs/node/src/generated/` | No (gitignored) | Node SDK generated client code |
| `packages/sdk/langs/python/superdoc/generated/` | No (gitignored) | Python SDK generated client code |
| `packages/sdk/tools/*.json` | No (gitignored) | Tool catalogs for all providers (catalog.json, tools.openai.json, etc.) |
| `apps/docs/document-api/reference/` | Yes (Mintlify deploys from git) | Reference doc pages generated from contract |

After a fresh clone, run `pnpm run generate:all` before working on SDK, CLI, or doc-api code.

Note: `packages/sdk/tools/__init__.py` is a manual file (Python package marker) and stays committed.

## Testing

| What to verify | Command | Speed |
|---|---|---|
| Logic works? | `pnpm test` | seconds |
| Editing works? | `pnpm test:behavior` | minutes |
| Layout regressed? | `pnpm test:layout` | ~10 min |
| Pixel diff? | `pnpm test:visual` | ~5 min |

### Unit Tests (Vitest)

Co-located with source code as `feature.test.ts` next to `feature.ts`. Test pure logic, data transformations, and utilities in isolation.

- Framework: **Vitest** (config at `vitest.config.mjs`)
- Most coverage in `packages/super-editor/` (526 files) and `packages/layout-engine/` (150 files)
- Run a single package: `pnpm --filter <package> test`

### Behavior Tests (Playwright)

End-to-end tests that exercise editing features through the browser. Located in `tests/behavior/`.

- Framework: **Playwright** (Chromium, Firefox, WebKit)
- Tests editing commands, formatting, tables, comments, tracked changes, lists, toolbar
- Asserts on document state, not pixels — see `tests/behavior/README.md`

### Layout Comparison (`pnpm test:layout`)

Compares layout engine output (JSON structure) across ~382 test documents against a published npm version. This is the primary tool for catching rendering regressions.

- Run: `pnpm test:layout` (interactive — prompts for reference version)
- Flags: `--reference <version>`, `--match <pattern>`, `--limit <n>`
- Handles auth, corpus download, build, and comparison automatically
- Reports written to `tests/layout/reports/`
- Lower-level access: `pnpm layout:compare` (same engine, no interactive UX)
- One-time setup: `npx wrangler login` (for corpus download from R2)

### Visual Comparison (`pnpm test:visual`)

Pixel-level before/after comparison for documents that failed layout comparison. Reads the latest layout report and generates an HTML diff report.

- Run `pnpm test:layout` first to generate a comparison report
- Then `pnpm test:visual` to see pixel differences for changed docs
- HTML report output in `devtools/visual-testing/results/`

## Brand & Design System

Brand guidelines, voice, and design tokens live in `brand/`. Token values are defined in `packages/superdoc/src/assets/styles/tokens.css`.

**When creating or modifying UI components:**
- Use `--sd-*` CSS custom properties — never hardcode hex values. See `tokens.css` for all available variables.
- Tokens follow three tiers: primitive (`--sd-color-blue-500`) → semantic (`--sd-action-primary`) → component (`--sd-comment-bg`). Components reference semantic or component-level variables.
- Expose component-specific variables as `--sd-{component}-*` so consumers can customize via CSS.
- Document component CSS variables in `apps/docs/ui-components/` (Mintlify docs).

**When writing copy or content:** see `brand/brand-guidelines.md` for voice, tone, and the dual-register pattern (developer vs. leader). Product name is always **SuperDoc** (capital S, capital D).

## SD-2091: chooseTools() Investigation Findings (RESOLVED)

### Root Cause

The `chooseTools()` function wasn't returning mutation tools due to:

1. **Default phase is `'read'`** — excludes `mutation`, `create`, `format` categories
2. **Wrong budget syntax** — `budget: 100` should be `budget: { maxTools: 100 }`
3. **Default maxTools is 12** — limits tools even when phase allows more

### How chooseTools() Works

**Location**: `packages/sdk/langs/node/src/tools.ts`

The function filters tools based on phase, then applies budget limits:

| Phase | Included Categories | Excluded Categories |
|-------|---------------------|---------------------|
| `read` (default) | introspection, query | mutation, create, format, comments, trackChanges, session |
| `mutate` | query, mutation, format, comments, create | session |
| `locate` | query | mutation, create, format, comments, trackChanges, session |
| `review` | query, trackChanges, comments | mutation, create, format, session |

**Default budgets**: intent=12, operation=16 tools max.

### Correct Usage for Mutation Tools

**IMPORTANT:** The npm SDK (v1.0.0-alpha.44) has a different API than local development.

```typescript
// npm SDK v1.0.0-alpha.44 API
const { tools, selected, meta } = await chooseTools({
  provider: 'openai',
  mode: 'all',                          // 'essential' (default) or 'all'
  groups: ['core', 'format', 'create'], // Additional groups to include
  includeDiscoverTool: false,           // Whether to include discover_tools meta-tool
});

// Filter out LLM-incompatible tools manually
const EXCLUDED = new Set(['apply_mutations', 'query_match', 'preview_mutations']);
const filteredTools = tools.filter((t) => !EXCLUDED.has(t.function.name));
```

**Available groups:** `core`, `format`, `create`, `tables`, `sections`, `lists`, `comments`, `trackChanges`, `toc`, `images`, `history`, `session`

**Note:** The local dev version has more sophisticated options (`taskContext.phase`, `budget`, `policy.forceInclude/forceExclude`) that aren't in the npm package yet.

### Available Tools by Category (intent profile)

| Category | Tools |
|----------|-------|
| mutation | `insert_content`, `replace_content`, `delete_content`, `apply_mutations` |
| create | `create_paragraph`, `create_heading`, `create_section_break`, `create_table`, `create_table_of_contents`, `create_image` |
| query | `find_content`, `get_node`, `get_node_by_id`, `get_document_text`, `get_document_markdown`, `get_document_html`, `get_document_info`, `query_match`, `preview_mutations` |
| format | `format_bold`, `format_italic`, `format_underline`, + 30 more |

### Tools With Complex Schemas (LLM Incompatible)

These tools have discriminated union schemas that LLMs cannot construct correctly:

| Tool | Issue |
|------|-------|
| `apply_mutations` | Complex `steps` array with discriminated union variants |
| `query_match` | Complex `select` parameter with multiple schema variants |
| `preview_mutations` | Same as apply_mutations |

Use `forceExclude` to remove these from LLM tool sets.

### Files Changed

**examples/collaboration/superdoc-yjs/**
- `agent.ts` — Fixed `chooseTools()` configuration with correct budget syntax and forceInclude/forceExclude
- `package.json` — Uses npm packages (`superdoc@^1.18.2`, `@superdoc-dev/sdk@^1.0.0-alpha.44`)
- `src/App.vue` — Chat sidebar for agent communication
- `README.md` — Customer documentation

### Remaining Work

1. **Fix tool schema generation** for `apply_mutations` and `query_match` to be LLM-compatible
2. **Consider adding wrapper tools** with simpler schemas for complex operations
3. **Document chooseTools() gotchas** in SDK documentation
