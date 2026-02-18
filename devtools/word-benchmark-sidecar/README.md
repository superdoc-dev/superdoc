# Word Baseline Sidecar (Dev Only)

> **Prerequisite:** The `superdoc-benchmark` CLI must be installed globally before using this sidecar:
>
> ```bash
> npm i -g @superdoc-dev/visual-benchmarks
> ```

Local sidecar for `SuperdocDev.vue` that:

1. accepts an exported DOCX payload,
2. runs `superdoc-benchmark word ... --force`,
3. serves generated `page_XXXX.png` images back to the dev UI.

## Run

From repo root:

```bash
pnpm word-benchmark-sidecar
```

If a healthy sidecar is already running on the configured host/port, this command exits successfully and reuses the existing instance.

Or run together with Vite:

```bash
pnpm dev
```

## Requirements

- macOS
- Microsoft Word
- `superdoc-benchmark` installed and available in `PATH`

## API

- `GET /health`
- `POST /api/word-baseline`
  - JSON body: `{ "fileName": "document.docx", "docxBase64": "..." }`
  - Response: `{ "jobId": "...", "pageCount": 2, "pages": ["http://.../api/word-baseline/jobs/<id>/pages/page_0001.png", ...] }`
- `POST /api/word-baseline/from-path`
  - JSON body: `{ "localPath": "/absolute/path/to/document.docx", "fileName": "optional-name.docx" }`
  - Response: same shape as `POST /api/word-baseline`
- `GET /api/word-baseline/jobs/:jobId/pages/:pageName`

## Environment

- `SUPERDOC_WORD_BASELINE_HOST` (default `127.0.0.1`)
- `SUPERDOC_WORD_BASELINE_PORT` (default `9185`)
- `SUPERDOC_WORD_BASELINE_DIR` (default `${TMPDIR}/superdoc-word-baselines`)
- `SUPERDOC_WORD_BASELINE_MAX_DOCX_BYTES` (default `41943040`)
- `SUPERDOC_WORD_BASELINE_MAX_REQUEST_BYTES` (default `83886080`)
- `SUPERDOC_WORD_BASELINE_CLEANUP_AGE_MS` (default `21600000`)
- `SUPERDOC_WORD_BASELINE_CLEANUP_INTERVAL_MS` (default `600000`)
