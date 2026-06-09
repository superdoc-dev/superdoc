# Shared Test Corpus

Repo-level DOCX corpus tooling shared by `tests/visual` and `tests/layout`.

## Commands

```bash
# Download/sync corpus locally (default: <repo>/test-corpus)
pnpm corpus:pull

# Download one of the Docx Universe folders shown in the UI
pnpm corpus:pull -- --filter "Test Docs - Extra Spicy"

# Delete one or more corpus docs from R2, remove their registry entries, and delete local copies
pnpm corpus:delete -- rendering/sd-1234-example.docx
pnpm corpus:delete -- basic/advanced-tables.docx layout/advanced-tables.docx

# Upload a doc, update registry.json in R2, then generate/upload Word baseline via superdoc-benchmark
pnpm corpus:push -- --path rendering/sd-1234-example.docx /path/to/file.docx

# Skip automatic Word baseline generation/upload for this push
pnpm corpus:push -- --no-word-baseline --path rendering/sd-1234-example.docx /path/to/file.docx

# Reconcile registry.json in R2 against live .docx keys
pnpm corpus:update-registry
```

`pnpm corpus:pull` is registry-driven by default: it syncs the `.docx` entries exposed by `registry.json` from the Docx Universe corpus bucket.
Pass `--include-unregistered` when you want to merge in live bucket `.docx` objects that were uploaded without a registry reconciliation yet.
`pnpm corpus:pull` now tolerates missing keys and prunes stale `registry.json` entries automatically.
`pnpm corpus:pull` does not remove local files that no longer exist in R2; use `pnpm corpus:delete` when you want the shared corpus and local copy removed together.
`pnpm corpus:update-registry` performs a full live reconciliation of `registry.json` against bucket `.docx` keys: it removes stale entries and adds bucket docs that were missing from the registry.

### Worktrees: seeding from the primary repo

When `pnpm corpus:pull` runs inside a git worktree it first hardlinks anything
the primary repo already has on disk, then only goes to R2 for the rest. The
primary's bytes are already local so this is effectively instant for a fresh
worktree.

- Hardlinks (not copies) — zero disk overhead, both worktrees see the same
  inode. Falls back to copy automatically when the two checkouts live on
  different filesystems.
- `--force` still re-downloads from R2. Destinations are unlinked before each
  R2 write, so the primary's files are never clobbered.
- Pass `--no-seed` to skip the hardlink step and go straight to R2.
`pnpm corpus:push` runs `superdoc-benchmark baseline <uploaded-key> --force` by default after upload.
Set `SUPERDOC_CORPUS_SKIP_WORD_BASELINE=1` (or pass `--no-word-baseline`) to disable this behavior.

## Auth

Preferred local flow:

```bash
npx wrangler login
```

CI / explicit credentials can use:

- `SUPERDOC_CORPUS_R2_ACCOUNT_ID`
- `SUPERDOC_CORPUS_R2_ACCESS_KEY_ID`
- `SUPERDOC_CORPUS_R2_SECRET_ACCESS_KEY`

Corpus bucket is fixed in code to `docx-test-documents` (the Docx Universe corpus shown in the UI).

Backward-compatible env names are also accepted:

- `SD_TESTING_R2_*`

Word baseline upload additionally requires a Word baseline bucket environment variable
(typically `SD_TESTING_R2_WORD_BUCKET_NAME`; `SUPERDOC_CORPUS_R2_WORD_BUCKET`
is also recognized by `corpus:push`).
