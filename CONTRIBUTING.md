# Contributing to SuperDoc

Thanks for helping out. Bug reports, docs, examples, tests, and code are all
welcome.

## Ways to contribute

**Report a rendering bug.** Open a `.docx` in SuperDoc, compare it with
Microsoft Word, and if they differ,
[file an issue](https://github.com/superdoc/docx-editor/issues/new?template=bug-report.yml)
with the file attached. A reproduction document is the single most useful thing
you can send.

**Improve the docs.** They live in `apps/docs/` and ship to
[docs.superdoc.dev](https://docs.superdoc.dev). Run `pnpm run dev:docs` to
preview, and read `apps/docs/AUTHORING.md` before adding a page.

**Add an example.** Keep it runnable and focused on one documented outcome. All examples live in `examples/`.

**Fix a bug or add a feature.** Start with
[good first issues](https://github.com/superdoc/docx-editor/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
or [help wanted](https://github.com/superdoc/docx-editor/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22).
For anything large, open an issue first so we can agree on the approach before
you write code.

## Choose a branch

Open contributions against `main` for the current V2 editor. Target `v1` only
for fixes that must also ship in the maintained V1 editor. If you are unsure,
use `main` or ask in the issue before starting implementation.

## Prerequisites

- [Node.js](https://nodejs.org/) 22, pinned in `.nvmrc`
- [pnpm](https://pnpm.io/) 10, pinned in `package.json#packageManager`
  (`corepack enable` picks it up)

## Set up locally

Fork the repository on GitHub, then:

```bash
git clone https://github.com/<your-username>/docx-editor.git
cd docx-editor
pnpm install
pnpm dev
```

`pnpm dev` gives you a live editor to try your changes in.

## Where to make changes

| What you want to change | Where to look |
|---|---|
| Visual rendering | `packages/layout-engine/painters/dom/` |
| Style resolution (fonts, colors, borders) | `packages/layout-engine/style-engine/` |
| Editing behavior (keyboard, commands) | v2 document runtime commands and adapters |
| DOCX import and export | v2 document runtime import/export code |
| Main entry point | `packages/superdoc/` |
| React wrapper | `packages/react/` |

Design note worth knowing before you touch import: the importer stores raw OOXML
properties and the style engine resolves them at render time. Resolving styles
during import bakes them into node attributes and loses the original document
intent on export.

## Test your change

```bash
pnpm test          # all packages
pnpm test:superdoc # just the superdoc package
pnpm run lint
pnpm run format
```

Unit tests sit next to the source they cover. Test placement, fixture rules, and
DOCX fixture privacy are documented in [`tests/README.md`](tests/README.md).
Read the fixture privacy section before committing a `.docx`: fixtures are
synthetic by default, and `pnpm check:docx-privacy` will fail on a document it
cannot verify.

For rendering changes, run the unit suites and then compare the affected `.docx`
side by side in Microsoft Word and SuperDoc. There is no pixel-diff gate.

Full local CI is a separate, slower step and needs
[Bun](https://bun.sh/) 1.3.13 on your PATH for the checks that parse TypeScript
directly:

```bash
pnpm ci:local
```

## Open a pull request

Keep the PR focused on one fix or feature. Use
[Conventional Commits](https://www.conventionalcommits.org/) for the commit
message, since the release version is derived from it:

| Prefix | Release |
|---|---|
| `fix:` | patch |
| `feat:` | minor |
| `feat!:` or `BREAKING CHANGE:` | major |
| `chore:`, `docs:`, `refactor:`, `test:` | none |

A local Git hook checks the message format before the commit lands.

Before you open the PR:

- [ ] `pnpm test` passes
- [ ] `pnpm run format:check` and `pnpm run lint` pass
- [ ] Tests added or updated
- [ ] The description says what changed and why, and links the issue
- [ ] Screenshots for visual changes
- [ ] If you grew the public API surface, you added a fixture under
      `tests/consumer-typecheck/src/` asserting both the parameter and return
      shapes, and `pnpm check:public` passes

CI runs on your PR and a maintainer will review it.

## Community and conduct

- [Discord](https://discord.com/invite/b9UuaZRyaB) for questions and discussion
- [Docs](https://docs.superdoc.dev) for the API reference and guides

This project follows our [Code of Conduct](CODE_OF_CONDUCT.md). Report
unacceptable behavior to [conduct@superdoc.dev](mailto:conduct@superdoc.dev).
