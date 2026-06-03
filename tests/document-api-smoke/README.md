# Document API Smoke

This package keeps the small in-repo guardrails for the
Document API:

- representative namespace and method presence
- a small SDK open/read/mutate/save/reopen smoke workflow

Additional conformance coverage may exist in a separate checkout. This package
contains only the in-repo smoke suite.

Run the in-repo smoke suite from the repo root:

```bash
pnpm run test:document-api-smoke
```
