# SuperDoc Documentation

Mintlify-powered docs at `docs.superdoc.dev`.

## File structure

File paths must mirror the navigation structure in `docs.json`. If a page appears under "Guides > Collaboration" in the nav, the file lives in `guides/collaboration/`, not somewhere else.

When moving or renaming a page, always add a redirect in `docs.json`:

```json
{
  "source": "/old/path",
  "destination": "/new/path"
}
```

## Document API generation boundary

Document API docs have mixed manual/generated ownership. Treat these paths as authoritative:

- `apps/docs/document-api/reference/*`: generated, committed to git (Mintlify deploys from git), do not hand-edit.
- `packages/document-api/generated/*`: generated, **not in git**, do not hand-edit. Run `pnpm run generate:all` to produce.
- `apps/docs/document-api/available-operations.mdx`: manual except for the block between:
  - `{/* DOC_API_OPERATIONS_START */}`
  - `{/* DOC_API_OPERATIONS_END */}`

To refresh generated content:

```bash
pnpm exec tsx packages/document-api/scripts/generate-contract-outputs.ts
pnpm exec tsx packages/document-api/scripts/check-contract-outputs.ts
```

## Brand voice

One personality, two registers. SuperDoc is the same person in every conversation — warm, clear, technically confident. It adjusts **what it emphasizes** based on who's listening. Developers hear about the how. Leaders hear about the why.

Documentation uses the **developer register**: clear, direct, code-forward. Respect the reader's time.

### Headings

Sentence case, always. "What we built" not "What We Built."

### Universal voice rules

- **Say what it does, not what it is** — "Renders DOCX files in the browser" not "an enterprise document management solution." Nouns are vague. Verbs are clear.
- **Short sentences win** — If a sentence has a comma, try splitting it in two. If it has a semicolon, definitely split it. Scannable beats comprehensive.
- **No buzzwords** — "Next-generation," "cutting-edge," "revolutionary," "best-in-class" are banned. If it sounds like a press release, rewrite it.
- **Show, then tell** — A code snippet or demo is always better than a paragraph of description. When words are needed, be specific: "5 lines" not "easy."
- **"You" not "we"** — "Your documents stay on your servers" hits harder than "We ensure data privacy." The reader is the hero, not SuperDoc.
- **Acknowledge trade-offs** — If something has a limitation, say so. "SuperDoc runs client-side, so very large documents (1000+ pages) need good hardware." Honesty builds trust.
- **Be specific with numbers** — "60+ extensions" not "many extensions." "5 lines of code" not "minimal integration." Specificity is credibility.
- **Conversational, not chummy** — Write like you're talking to a smart colleague. Not a pitch deck ("leverage synergies") and not a chat message ("lol it just works fr fr").

### Developer register pattern

**Structure:** What it does → How to use it → What it saves you

Lead with the developer's problem or goal. Follow with what SuperDoc does (concretely). End with how fast they can start. Always include code or an install command near the top.

Example:
> "Add document signing to your app with the esign package. Drop in the component, define your fields, and get back a signed document with a full audit trail. No need to integrate DocuSign or build signing from scratch."

### Same concept, two registers

| Concept | Developer register | Leader register |
|---|---|---|
| Self-hosted | "Runs entirely in the browser. No cloud calls. Your data stays on your servers." | "Documents never leave your infrastructure. Full data sovereignty with zero cloud dependency." |
| Easy to use | "Five lines of code. Pass a file, mount the editor, done." | "Your team can ship document editing in days, not quarters. No specialized hires needed." |
| DOCX fidelity | "Built on OOXML. Real pagination, section breaks, headers/footers. Not rich text with export bolted on." | "Users see documents exactly as they look in Word. No formatting loss, no complaints, no re-work." |
| Collaboration | "Yjs-based CRDT. Add real-time editing in ~10 lines. Conflicts resolve automatically." | "Teams edit documents together in real time. Built-in conflict resolution means no lost work." |
| Open source | "AGPLv3. Read the code, fork it, contribute. Commercial license if you need proprietary." | "Open-source foundation means no vendor lock-in. Inspect the code. Switch away anytime." |
| Extensible | "60+ extensions built-in. Write your own with the plugin API. Full ProseMirror access." | "Adapts to your workflow, not the other way around. Custom extensions, branding, and integrations." |
| AI | "Bring your own LLM. AI actions with tool use — find, replace, highlight, insert. Streaming built in." | "AI-assisted document workflows with your choice of provider. Your data, your model, your infrastructure." |

### Quick reference

| Instead of | Write | Why |
|---|---|---|
| "Next-generation document editor" | "A document editor for the web" | Cut the hype. Say what it is. |
| "Seamless integration" | "Five lines of code" | Specific beats vague. |
| "Enterprise-grade security" | "Self-hosted. Your documents never leave your servers." | Describe the mechanism, not the claim. |
| "Leveraging AI capabilities" | "AI that finds, replaces, and rewrites text in your documents" | Say what it does. |
| "Robust collaboration features" | "Real-time editing with Yjs. Conflicts resolve automatically." | Name the tech. Devs trust specifics. |
| "We ensure data privacy" | "Your documents stay on your servers" | "You" framing. Mechanism, not promise. |
| "Comprehensive formatting support" | "60+ extensions: tables, images, lists, tracked changes, and more" | List beats adjective. |
| "Get in touch for pricing" | "Free under AGPLv3. Commercial license starts at $X/year." | Transparency builds trust. Devs hate hidden pricing. |

## Page depth

- **Getting Started** pages are high-level overviews. Link to detailed pages, don't duplicate content.
- **Core** pages (SuperDoc, SuperEditor) are the detailed API reference.
- **Module** pages document configuration, API, and events for each module.
- **Guide** pages are step-by-step walkthroughs for specific integrations.

Don't add Tips, Warnings, or deep explanations in overview pages. Keep examples concise.

## Layer model

When documenting a customer-facing operation, name the right layer:

- **Document API** (`editor.doc.*`) — request/response document operations: comments, tracked changes, format apply, insert/replace/delete, mark up. Same shape on server, client, and AI agents. **Use this for any document mutation.**
- **`superdoc/ui` and `superdoc/ui/react`** — browser UI controller for custom toolbar, comments sidebar, review panel, selection capture, viewport, document controls (export / mode toggle / dirty indicator). **Use this for new custom React UI.**
- **Modules** (`modules/*`) — built-in SuperDoc-rendered UI. Use this when the customer is happy with the built-in look and just wants config.
- **Core** (`core/*`) — low-level instance/reference surface. Lifecycle, refs, host events. Reach for it when the higher layers don't cover the case (rare).

Recommend the highest layer that solves the problem. Mutate documents through the Document API. Build custom React UI through `superdoc/ui/react`. Reach `superdoc.activeEditor.*` only when documenting legacy compat or a known escape hatch (and call it out as such).

## API naming

- `superdoc.export()` for SuperDoc-level methods
- `editor.doc.*` for document operations (the recommended path)
- `superdoc.activeEditor.commands.X()` for editor chain commands. **Legacy/compat only — prefer `editor.doc.*` for mutations and `ui.commands.*` for UI dispatch.**
- `superdoc.activeEditor.getHTML()` for editor-level methods
- `superdoc.getHTML()` returns `Array<string>` (one per document section)

Always verify API names against the source code before documenting. Key source files:

| API surface | Source |
|---|---|
| SuperDoc methods | `packages/superdoc/src/core/SuperDoc.js` |
| SuperDoc config | `packages/superdoc/src/core/types/index.js` |
| Editor methods | `packages/super-editor/src/editors/v1/core/Editor.ts` |
| Extensions | `packages/super-editor/src/editors/v1/extensions/` |
| Document API contract | `packages/document-api/src/contract/operation-definitions.ts` |
| `superdoc/ui` controller | `packages/super-editor/src/ui/types.ts`, `create-super-doc-ui.ts` |
| `superdoc/ui/react` hooks | `packages/super-editor/src/ui/react/` |

## Mintlify components

Common components: `ParamField`, `Note`, `Warning`, `Tip`, `CardGroup`, `Card`, `Tabs`, `Tab`, `Info`.

## Code examples pattern

Every code snippet in API/reference pages must be copy-pasteable. Use `<CodeGroup>` with two tabs when a snippet is a fragment (assumes prior setup):

- **Usage** tab — the focused snippet (what the method does)
- **Full Example** tab — complete, runnable code with imports and initialization

```mdx
<CodeGroup>

‍```javascript Usage
const blob = await superdoc.export({ isFinalDoc: true });
‍```

‍```javascript Full Example
import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

const superdoc = new SuperDoc({
  selector: '#editor',
  document: yourFile,
  onReady: async (superdoc) => {
    const blob = await superdoc.export({ isFinalDoc: true });
  },
});
‍```

</CodeGroup>
```

**Boilerplate by context:**

| Context | Initialization |
|---|---|
| SuperDoc methods | `new SuperDoc({ selector, document, onReady })` |
| SuperEditor methods | `const editor = await Editor.open(file, { element })` |
| Extension commands | `editor.commands.X()` inside SuperDoc onReady or Editor.open |

**When NOT to use CodeGroup:** Snippets that are already complete (have imports + initialization), config-only blocks, bash commands, XML/HTML examples.

## Icons

`docs.json` sets `"icons": { "library": "lucide" }`. Mintlify resolves every `icon="..."` value (in `<Card>`, `<CardGroup>`, `<Icon>`, etc.) against **Lucide only** — there is no per-icon library override. Names from Font Awesome, Material Design, Tabler, or brand icon sets silently render as a blank box.

**Rule of thumb:** before adding an icon, check the name exists at https://lucide.dev/icons/. If it doesn't, pick a Lucide alternative or use a custom SVG path.

Common name traps when migrating from Font Awesome:

| Don't use (FA only) | Use this (Lucide) |
|---|---|
| `gear` | `cog` or `settings` |
| `crosshairs` | `crosshair` (singular) |
| `compass-drafting` | `compass` |
| `screwdriver-wrench` | `wrench` |
| `arrow-up-right-from-square` | `external-link` or `square-arrow-out-up-right` |
| `arrow-right-arrow-left` | `arrow-left-right` |
| `file-export` | `file-output` or `download` |
| `react`, `vuejs`, `js`, `microsoft`, `google` | No Lucide brand icons — pick a generic (`code`, `book`, `file-text`) or use an SVG path |

For brand/language icons (React, Vue.js, Microsoft, etc.), Lucide doesn't ship them. Either use a generic Lucide icon that fits the context, or supply an SVG via `icon="/path/to/icon.svg"` or an external URL.

A `pnpm run check:icons` validator runs in pre-commit and walks every `<Card icon="...">`, `<Icon icon="...">`, and `docs.json` icon reference against the locally installed Lucide set. Catches drift before deploy. Add new icons through this validator — if it complains, the name isn't in the Lucide library.

## Testing

Code examples are tested automatically via pre-commit hooks and CI. Two checks run when `.mdx` files change:

- `pnpm run check:imports` — validates import paths in all code blocks against an allowlist
- `pnpm run test:examples` — extracts "Full Example" blocks, executes them headlessly against a real Editor instance, and fails if any documented API doesn't exist

The doctest suite lives in `__tests__/` and uses remark to parse MDX. When adding or modifying a Full Example, run `pnpm run test:examples` to verify it works.

## Commands

- `npx mintlify dev` — Start local dev server
- `npx mintlify broken-links` — Check for broken links
- `pnpm run check:imports` — Validate code block import paths
- `pnpm run test:examples` — Run doctest suite (277 examples)
