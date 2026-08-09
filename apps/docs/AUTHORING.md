# Docs authoring

This guide keeps SuperDoc documentation consistent as pages gain diagrams, downloads, and interactive examples. Start with the smallest complete explanation. Add richer media only when it helps a reader complete or understand the task.

## Choose a page shape

Use one of these shapes before adding custom structure.

### Concept

1. State what the concept is.
2. Explain when it matters.
3. Show one concrete example or diagram.
4. Link to the next task.

### Task guide

1. State the outcome and prerequisites.
2. Provide the required input or fixture.
3. Walk through numbered steps.
4. Define a visible verification target.
5. Link to the next useful task.

### Reference

1. State what the surface controls.
2. List inputs, outputs, defaults, and failure modes.
3. Include one minimal example.
4. Link to a complete workflow instead of repeating it.

## Use Markdown first

Write headings, prose, links, lists, code, and images with standard Markdown. This keeps pages useful in HTML, per-page Markdown, `llms.txt`, and `llms-full.txt`.

Use a custom MDX component only when Markdown cannot express the behavior. A component must not contain the only explanation of a concept or task. Introduce it with plain prose that remains useful when the component is reduced to its machine-readable Markdown form.

Register each supported rich component in `lib/llm-markdown.ts`. Its renderer must preserve every prop that changes the meaning of the example. Keep the fallback concise. Do not expose raw MDX or implementation-only placeholders in per-page Markdown or `llms-full.txt`.

## Keep code examples executable

Complete, runnable projects live in the repository's top-level `examples/` directory. Documentation-owned copy-paste snippets live under `snippets/` and are included directly in MDX:

```mdx
<include>../../../snippets/document-api/mutation-plans.ts</include>
```

Fumadocs renders non-MDX includes as code blocks. TypeScript snippets are part of the docs app typecheck, so the displayed source and validated source cannot drift apart. Keep snippets focused on the documented task; use a top-level example when readers need a complete project they can install and run.

Use a raw fenced TypeScript or JavaScript block only for a contextual fragment that cannot run alone. Introduce the required surrounding state in prose and do not call it a complete example. The content tests syntax-check fenced code and validate `doc.*()` operation paths against the generated Document API manifest.

Shell blocks are checked with `bash -n`, must use the repository's public package manager convention, and should be safe to paste from the documented working directory. HTML fragments are checked for balanced tags and duplicate IDs. Do not use placeholder commands that appear runnable.

## Choose media on purpose

Make an explicit media decision for every page. No media is a valid choice when prose and code already explain the task.

| To show                                  | Use                                         |
| ---------------------------------------- | ------------------------------------------- |
| A concept, flow, or architecture         | A page-owned SVG diagram                    |
| Behavior the reader benefits from trying | A live `EditorDemo`                         |
| A multi-step UI flow or motion           | A captioned video or short muted video loop |
| A single UI state or where to click      | A screenshot                                |
| Document content illustratively          | `DocumentPreview`                           |
| Nothing that adds reader value           | Prose and code only                         |

Use one primary medium per section. Do not repeat the same explanation in a diagram, screenshot, and embed. Every medium must help the reader decide, understand, or verify something.

Prefer a live embed when trying the behavior is the lesson. Prefer recorded media when the sequence itself is the lesson or the live behavior cannot be offered reliably. Use a screenshot only when a precise visual location or state is difficult to communicate in text.

## Component vocabulary

| Component            | Use it for                                              | Do not use it for                      |
| -------------------- | ------------------------------------------------------- | -------------------------------------- |
| `Callout`            | A necessary warning, constraint, or verification target | Repeating nearby prose                 |
| `FileDownload`       | A named input, fixture, or generated artifact           | Ordinary navigation links              |
| `DocumentPreview`    | A static explanation of document state                  | Claiming that an editor is live        |
| `EditorDemo`         | A real product interaction that loads near the viewport | Decorative product screenshots         |
| `RuntimeExampleTabs` | The same operation shown in browser and headless hosts  | Unrelated alternatives                 |
| `ReceiptBar`         | A compact example of a successful mutation receipt      | Invented performance or corpus metrics |

Add a component only after a real page needs it. Do not create a universal media component or a configurable demo framework.

## Own assets with their content

Keep a page-specific image beside its page:

```text
content/docs/<section>/
├── <page>.mdx
└── _media/
    └── <page>/
        └── <what-it-shows>.svg
```

Use lowercase kebab-case names that describe the content, not its position. Prefer `tracked-change-review.svg` to `diagram-2.svg`.

Use these locations:

- `content/docs/<section>/_media/<page>/` for page-owned images and diagrams. Reference them with relative Markdown image syntax.
- `public/media/<topic>/` for assets reused by more than one page or files that need a stable public URL.
- `public/fixtures/<workflow>/` for files a reader opens, edits, executes, or downloads as part of a workflow.

Do not store screenshots in a generic root folder. Do not duplicate the same asset under multiple pages.

## Media requirements

- Every meaningful image needs alt text that explains its purpose.
- Use empty alt text only for a decorative image.
- Captions should add context, not repeat the alt text.
- Prefer SVG for diagrams and PNG or WebP for interface captures.
- Give video a poster, visible controls, captions, and a nearby text summary. Load the video only when the reader plays it.
- Use a short muted video loop, not an animated GIF file, for a single repeatable motion. Keep it under 10 seconds, provide pause and play controls, and show a still frame when reduced motion is requested.
- Record the SuperDoc version and capture date with every screenshot or video source so stale media can be found and replaced.
- Keep the page usable if an image, video, or interactive example does not load.
- Keep essential meaning in nearby prose so the per-page Markdown remains complete.

Do not add a general video component or choose a hosting model before a real guide needs recorded media. That first use must decide between same-origin files and a public asset host based on export size, caching, and deployment policy. The resulting URL must remain publicly accessible.

## Interactive examples

Interactive examples load as they approach the viewport. The initial page should remain fast, readable, and useful before the product bundle is available or when it cannot load.

Each demo must declare a fixture, a supported preset, and a reader-facing title:

```mdx
<EditorDemo fixture='/fixtures/tracked-changes.docx' preset='tracked-review' title='Try suggesting mode' />
```

Keep presets finite and tied to verified workflows. The supported presets are `tracked-review` and `document-modes`. Add another only when a shipped guide needs behavior that cannot be expressed by either one.

Set `allowLocalFile` only when a task produces a DOCX that the reader should inspect in the embedded editor. The file is opened in the browser and is not uploaded by the documentation site. Keep a sample fixture available so the interaction remains useful before the reader completes the task.

### Runtime delivery

The editor examples load exact, pinned browser bundles from jsDelivr as the embed approaches the viewport. This is a docs-only delivery choice for the static site, not the recommended product integration. The DOCX fixture is fetched from the docs origin and its bytes are not sent to jsDelivr.

Keep the package names, versions, and CDN origin in `config/editor-demo-runtime.json`. The content tests verify those versions against the public `superdoc` package manifest. Do not add another remote runtime or copy the same constants into a component.

Same-origin delivery would require publishing the editor shell, engine module, browser worker, styles, and manifest together. Move to that model when the docs deployment can publish the official build artifacts without committing generated or separately licensed engine bundles to the documentation source.

Until then, deployment policy must allow `cdn.jsdelivr.net` for the editor script, styles, and engine modules, plus `blob:` for the same-origin worker bootstrap. Pages and fallbacks must remain useful when those resources are blocked.

## Preserve published routes

When a published page moves, add one entry to `pageMoves` in `config/redirects.json`:

```json
{
  "source": "/docs/editor/platform/old-page/",
  "destination": "/docs/editor/platform/new-page/",
  "reason": "The guide moved to a clearer path."
}
```

The build generates permanent redirects for both HTML path variants and the Markdown export. Use the `redirects` array for V1 migrations, temporary routing, and paths that are not documentation pages. Raw redirects must declare `301` or `302` explicitly.

Redirect destinations must exist in the built documentation. Update links inside this documentation to the current destination instead of relying on redirects.

`config/routes.json` is an append-only inventory of published documentation pages. After adding a page, build the site and run:

```bash
pnpm --filter @superdoc/docs generate:routes
```

When a recorded route disappears, the build requires a `pageMoves` entry, a raw redirect, or an entry in `retiredRoutes` with the reason the page should return a missing response. Do not retire a route when an equivalent page exists.

## Contributor checklist

Before opening a pull request:

1. Confirm the page follows a concept, task, or reference shape.
2. File verified API, configuration, framework, or workflow friction in the owning product tracker. Include source or runtime evidence, label hypotheses, and keep product changes separate from the content commit.
3. Record the page's media decision, including why the chosen medium provides more value than prose or why no media is needed.
4. Confirm content files, assets, folders, and non-component source files use lowercase kebab-case. React component files use PascalCase. Existing kebab-case components in `components/` predate that convention and are not the pattern to copy.
5. Confirm every internal route, fixture, and page-owned image resolves.
6. Confirm every image has useful alt text and every recorded medium has the required accessibility and version metadata.
7. Confirm custom components are registered in `mdx-components.tsx` and have a machine-readable renderer in `lib/llm-markdown.ts`.
8. Read the per-page Markdown and make sure the essential explanation survives without the rich component.
9. Test the page at desktop and mobile widths with keyboard navigation.
10. Run:

```bash
pnpm --filter @superdoc/docs typecheck
pnpm --filter @superdoc/docs test:content
pnpm --filter @superdoc/docs test:links
pnpm --filter @superdoc/docs test:redirects
pnpm --filter @superdoc/docs build
pnpm --filter @superdoc/docs check:links
pnpm --filter @superdoc/docs check:redirects
pnpm --filter @superdoc/docs test:export
```
