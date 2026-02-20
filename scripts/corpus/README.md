# Shared Test Corpus

Repo-level DOCX corpus tooling shared by `tests/visual` and `tests/layout-snapshots`.

## Commands

```bash
# Download/sync corpus locally (default: <repo>/test-corpus)
pnpm corpus:pull

# Upload a doc, update registry.json in R2, then generate/upload Word baseline via superdoc-benchmark
pnpm corpus:push -- --path rendering/sd-1234-example.docx /path/to/file.docx

# Skip automatic Word baseline generation/upload for this push
pnpm corpus:push -- --no-word-baseline --path rendering/sd-1234-example.docx /path/to/file.docx

# Reconcile registry.json in R2 by removing entries for missing object keys
pnpm corpus:update-registry
```

`pnpm corpus:pull` now tolerates missing keys and prunes stale `registry.json` entries automatically.
`pnpm corpus:push` runs `superdoc-benchmark baseline <uploaded-key> --force` by default after upload.
Set `SUPERDOC_CORPUS_SKIP_WORD_BASELINE=1` (or pass `--no-word-baseline`) to disable this behavior.

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

Word baseline upload additionally requires a Word baseline bucket environment variable
(typically `SD_TESTING_R2_WORD_BUCKET_NAME`; `SD_VISUAL_TESTING_R2_WORD_BUCKET_NAME` and
`SUPERDOC_CORPUS_R2_WORD_BUCKET` are also recognized by `corpus:push`).
