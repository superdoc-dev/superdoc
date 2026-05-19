# AI redlining (server-side)

A headless Node script that opens a DOCX, sends its text to an LLM for review, applies the returned suggestions as tracked changes through the Document API, and writes the redlined DOCX back to disk. No browser, no editor UI, no user interaction.

## What this teaches

- Opening a DOCX headlessly via `Editor.open(buffer, { documentMode: 'suggesting' })`.
- Calling an LLM with a `{ find, replace, comment }` schema and applying each suggestion as a tracked change attributed to a configured author.
- Exporting the resulting DOCX with the tracked changes preserved, ready for a reviewer to open in SuperDoc or Word.

## Run it

```bash
pnpm install
cp .env.example .env  # set OPENAI_API_KEY
pnpm start
```

Pass an input path and an output path:

```bash
pnpm start -- input.docx redlined.docx
```

A sample DOCX (`sample.docx`) is included for first-run smoke testing.

### Required env

- `OPENAI_API_KEY`: an OpenAI API key with access to the model the script calls. Without it the script exits early with a clear error. Replace the provider call if you're not on OpenAI.

## When to reach for it

- You're running AI redlining server-side (background job, ingestion pipeline) and the reviewer opens the redlined file later.
- You want a reference for the Editor.open headless entry point and the tracked-change application loop.

## When not

- You're shipping AI redlining in the browser with a live reviewer. Use [`examples/ai/redlining`](../../ai/redlining) instead.

## Docs

[AI overview](https://docs.superdoc.dev/ai/overview), [Document Engine SDKs](https://docs.superdoc.dev/document-engine/sdks).
