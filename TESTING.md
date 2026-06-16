# Testing Guide

How to verify public SuperDoc changes before pushing.

## Quick Reference

| What to verify | Command | Speed | CI Gate |
|---|---|---|---|
| Logic works? | `pnpm test` | ~30s | Hard |
| Document API smoke? | `pnpm test:document-api-smoke` | ~1 min | Hard |
| Public surface? | `pnpm check:public` | ~5 min | Hard |

## Unit Tests

Test pure logic: data transformations, algorithms, style resolution, layout
math, import/export behavior, and editor command internals.

```bash
pnpm test                 # all packages
pnpm test:editor          # super-editor only
pnpm --filter <pkg> test  # specific package
```

Tests are co-located with source code as `feature.test.ts` next to
`feature.ts`. Framework: Vitest.

## Document API Smoke

SuperDoc keeps low-detail Document API guardrails in this repo:

```bash
pnpm test:document-api-smoke
```

That smoke suite checks representative namespace/method presence and a small
SDK open/read/mutate/save/reopen workflow.

## Rendering Checks

The public tree does not expose a pixel-diff command. For rendering changes,
run the relevant unit suites, then manually compare the affected `.docx` in
Microsoft Word and SuperDoc.

```bash
pnpm test
```

Maintainers may run additional release checks for rendering-sensitive changes.

## Uploading Test Documents

For new `.docx` fixtures, keep the file minimal and place it with the public
test suite that consumes it. For larger reproduction documents, attach the file
to the issue or PR and explain which assertion it should cover.

Avoid adding broad fixture dumps; prefer focused documents that make a specific
behavior or rendering expectation clear.

## When to Run What

| I changed... | Run |
|---|---|
| A utility function or algorithm | `pnpm test` |
| An editing command or extension | `pnpm test` |
| Layout engine or style resolution | `pnpm test` + manual Word comparison |
| DomPainter rendering | `pnpm test` + manual Word comparison |
| PM adapter data conversion | `pnpm test` |
| Table rendering or spacing | `pnpm test` + manual Word comparison |
| Super-converter import/export | `pnpm test` |

## CI Behavior

| Suite | Runs on PRs | Blocks merge |
|---|---|---|
| Unit tests | Yes | Yes |
| Document API smoke | Yes | Yes |
| Public surface checks | Yes | Yes |
