# AI redlining (browser)

A React example that opens a DOCX in SuperDoc, sends the document text to an LLM for a structured set of suggestions, then applies each suggestion as a tracked change so the reviewer accepts or rejects it.

## What this teaches

- Driving SuperDoc in `documentMode: 'suggesting'` so AI-generated edits land as tracked changes attributed to a configured user.
- Calling an LLM with a `{ find, replace, comment }` schema and turning that schema into editor mutations.
- Wiring the built-in comments panel alongside tracked changes so each suggestion can carry rationale text.

## Run it

```bash
pnpm install
cp .env.example .env  # set VITE_OPENAI_API_KEY
pnpm dev
```

Open the local URL Vite prints. Upload a DOCX, then click the AI review button.

### Required env

- `VITE_OPENAI_API_KEY`: an OpenAI API key with access to the model the example calls. Without it the AI review button is non-functional. Replace with your own provider if you're not on OpenAI.

## When to reach for it

- You're prototyping AI-assisted document review in the browser and want a reference for the suggestion-to-tracked-change pipeline.
- You're deciding between client-side and server-side AI redlining; this is the browser flavor.

## When not

- You want server-side AI redlining (no browser, no user-facing review surface). Use [`examples/document-engine/ai-redlining`](../../document-engine/ai-redlining) instead.

## Docs

[AI overview](https://docs.superdoc.dev/ai/overview).
