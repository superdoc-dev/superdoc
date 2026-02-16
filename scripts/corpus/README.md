# Shared Test Corpus

Repo-level DOCX corpus tooling shared by `tests/visual` and `tests/layout-snapshots`.

## Commands

```bash
# Download/sync corpus locally (default: <repo>/test-corpus)
pnpm corpus:pull

# Upload a doc and update registry.json in R2
pnpm corpus:push -- --path rendering/sd-1234-example.docx /path/to/file.docx
```

## Auth

Preferred local flow:

```bash
npx wrangler login
```

CI / explicit credentials can use:

- `SUPERDOC_CORPUS_R2_ACCOUNT_ID`
- `SUPERDOC_CORPUS_R2_BUCKET`
- `SUPERDOC_CORPUS_R2_ACCESS_KEY_ID`
- `SUPERDOC_CORPUS_R2_SECRET_ACCESS_KEY`

Backward-compatible env names are also accepted:

- `SD_TESTING_R2_*`
- `SD_VISUAL_TESTING_R2_*`
