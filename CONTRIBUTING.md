# Contributing to SuperDoc

Thank you for your interest in contributing to SuperDoc! Whether you're fixing a bug, improving documentation, or adding a feature, we appreciate your help.

## Table of Contents

- [Ways to Contribute](#ways-to-contribute)
- [Architecture Overview](#architecture-overview)
- [Contribution Areas](#contribution-areas)
- [Your First PR](#your-first-pr)
- [Development Setup](#development-setup)
- [Pull Request Process](#pull-request-process)
- [Release Process](#release-process)
- [Style Guidelines](#style-guidelines)
- [Community](#community)

## Ways to Contribute

Contributing isn't just about writing code. Here are several ways you can help:

**Report bugs with reproduction files**
Open a .docx in SuperDoc and compare it with Microsoft Word. If something looks different, [open an issue](https://github.com/superdoc-dev/superdoc/issues/new?template=bug-report.yml) with the file attached. Good bug reports with reproduction files are incredibly valuable.

**Improve documentation**
Our docs live in `apps/docs/` ([docs.superdoc.dev](https://docs.superdoc.dev)) and are built with Mintlify. Fix typos, add code examples, improve explanations, or write guides. Run `pnpm run dev:docs` to preview locally. Documentation PRs are always welcome and a great way to get started.

**Add examples and integrations**
Create example projects showing SuperDoc with different frameworks (Next.js, Nuxt, Remix, etc.) in the `examples/` directory.

**Add test coverage**
Write unit tests or visual regression tests for existing features. Better test coverage helps everyone.

**Fix bugs and implement features**
Check our [good first issues](https://github.com/superdoc-dev/superdoc/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) for approachable tasks, or [help wanted](https://github.com/superdoc-dev/superdoc/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) for meatier items.

**Help the community**
Answer questions on [Discord](https://discord.gg/wjMccuygvy).

## Architecture Overview

SuperDoc is a document editing and rendering library for the web. Understanding its architecture will help you find the right place to make changes.

### Rendering Pipeline

SuperDoc uses its own rendering pipeline -- ProseMirror is NOT used for visual output:

```
DOCX File
  → super-converter (parse OOXML into ProseMirror document)
    → pm-adapter (convert PM nodes into FlowBlocks)
      → layout-engine (paginate FlowBlocks into Layouts)
        → DomPainter (render Layouts to DOM)
```

A hidden ProseMirror `Editor` instance manages document state and editing commands, but its DOM is never shown to the user. All visual rendering goes through DomPainter.

### Project Structure

```
packages/
  superdoc/              Main entry point (npm: superdoc)
  react/                 React wrapper (@superdoc-dev/react)
  super-editor/          ProseMirror editor core
    src/
      core/
        super-converter/ DOCX import/export (OOXML ↔ ProseMirror)
      extensions/        Editing behaviors (bold, lists, tables, etc.)
  layout-engine/         Layout & pagination pipeline
    pm-adapter/          ProseMirror → Layout bridge
    layout-engine/       Pagination algorithms
    painters/dom/        DOM rendering (DomPainter)
    style-engine/        OOXML style resolution & cascade
    contracts/           Shared type definitions
  ai/                    AI integration
  collaboration-yjs/     Collaboration server
shared/                  Internal utilities
examples/                Framework integration examples
tests/visual/            Visual regression tests (Playwright)
```

### Where to Make Changes

| What you want to change | Where to look |
|--------------------------|---------------|
| How something looks (visual rendering) | `layout-engine/painters/dom/` |
| Style resolution (fonts, colors, borders) | `layout-engine/style-engine/` |
| Data flowing from editor to renderer | `layout-engine/pm-adapter/` |
| Editing behavior (keyboard, commands) | `super-editor/src/extensions/` |
| DOCX import/export | `super-editor/src/core/super-converter/` |
| React integration | `packages/react/` |
| Main entry point (Vue) | `packages/superdoc/` |
| Visual regression tests | `tests/visual/` |

### Key Design Principle

**The importer stores raw OOXML properties. The style-engine resolves them at render time.**

The converter (`super-converter/`) parses and stores only what is explicitly in the XML. The style-engine (`layout-engine/style-engine/`) handles all cascade logic (defaults -> table style -> conditional formatting -> inline overrides). Don't resolve styles during import -- it bakes them into node attributes and loses the original document intent on export.

## Contribution Areas

These are areas where community contributions are especially welcome. Check [issues labeled `good first issue`](https://github.com/superdoc-dev/superdoc/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) for specific tasks.

| Area | Difficulty | Where to Look | What to Do |
|------|-----------|---------------|------------|
| Documentation | Easy | [docs.superdoc.dev](https://docs.superdoc.dev) | Fix gaps, add code examples, improve explanations |
| Examples | Easy | `examples/` | Create framework integration examples |
| Test coverage | Easy-Medium | `tests/visual/` | Add tests for existing features |
| Rendering parity | Medium | `layout-engine/painters/dom/` | Open a .docx in Word and SuperDoc, fix visual differences |
| Browser compatibility | Medium | `super-editor/`, `layout-engine/` | Fix Firefox/Safari-specific bugs |
| Copy/paste | Medium | `super-editor/src/extensions/` | Fix formatting loss when pasting from Word, Google Docs, browsers |
| DOCX import coverage | Medium-Hard | `super-editor/src/core/super-converter/` | Support additional OOXML tags and elements |

## Your First PR

Here's a step-by-step walkthrough to make your first contribution:

### 1. Find something to work on

- Browse [good first issues](https://github.com/superdoc-dev/superdoc/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
- Or pick from the [contribution areas](#contribution-areas) above
- Comment on the issue to let others know you're working on it

### 2. Fork and set up

```bash
# Fork the repo on GitHub, then:
git clone https://github.com/<your-username>/superdoc.git
cd superdoc

# Install dependencies (pnpm 9+ required)
pnpm install

# Start the dev server
pnpm dev
```

The dev server gives you a live editor to test changes.

### 3. Create a branch

```bash
git checkout -b fix/your-change-description
# or: feat/your-change-description
# or: docs/your-change-description
```

### 4. Find the relevant code

Use the [architecture overview](#architecture-overview) and the "Where to Make Changes" table to locate the right files. When in doubt, search for keywords:

```bash
# Find files by name
find packages/ -name "*.js" | xargs grep -l "your-keyword"

# Search file contents
grep -r "your-keyword" packages/ --include="*.js" -l
```

### 5. Make your change

- Follow existing code patterns in the file you're editing
- Keep changes focused -- one fix or feature per PR
- Add or update tests for your changes

### 6. Test locally

```bash
# Run the full test suite
pnpm test

# Run tests for a specific package
pnpm run test:editor        # super-editor tests
pnpm run test:superdoc      # superdoc package tests

# Check formatting and linting
pnpm run format:check
pnpm run lint
```

### 7. Commit and push

```bash
git add <files>
git commit -m "fix: describe your change"
git push origin fix/your-change-description
```

Follow [Conventional Commits](https://www.conventionalcommits.org/) for your commit message (see [Commit Messages](#commit-messages) below).

### 8. Open a Pull Request

Open a PR against the `main` branch. In the description:
- Describe what you changed and why
- Link to the related issue (e.g., `Closes #123`)
- Include screenshots for visual changes
- Add a test plan if applicable

CI will run automatically. A maintainer will review your PR and provide feedback.

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) 9+ (`npm install -g pnpm`)

### Quick Start

```bash
git clone https://github.com/<your-username>/superdoc.git
cd superdoc
pnpm install
pnpm dev
```

### Useful Commands

```bash
pnpm dev          # Start dev server (from examples/)
pnpm build        # Build all packages
pnpm test         # Run all tests
pnpm run lint     # Run ESLint
pnpm run format   # Run Prettier
```

## Pull Request Process

### Branch Naming

- `feature/description` for new features
- `fix/description` for bug fixes
- `docs/description` for documentation changes
- `perf/description` for performance improvements

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add real-time cursor sharing

- Implement cursor position tracking
- Add websocket connection for updates

Closes #123
```

Your commit type determines the version bump on release:

| Commit Type | Version Bump | Example |
|-------------|-------------|---------|
| `fix:` | Patch (0.0.X) | `fix: resolve cursor positioning bug` |
| `feat:` | Minor (0.X.0) | `feat: add PDF export functionality` |
| `feat!:` or `BREAKING CHANGE:` | Major (X.0.0) | `feat!: redesign document API` |
| `chore:`, `docs:`, `refactor:`, `test:` | No version change | `docs: update README` |

### Automated Checks

When you open a PR, the following checks run automatically:

- Commit message validation
- Code formatting (Prettier)
- Linting (ESLint)
- Unit tests
- Visual regression tests (if UI changes)

### Before Submitting

- [ ] Changes are focused (one fix/feature per PR)
- [ ] Tests added or updated
- [ ] Test suite passes locally (`pnpm test`)
- [ ] Code is formatted (`pnpm run format:check`)
- [ ] Commit messages follow conventional commits
- [ ] PR description links to related issue

## Release Process

SuperDoc uses automated CI/CD with semantic-release. No manual version bumps are needed.

- **`main` branch** -> Pre-release versions (`@next` tag on npm)
- **`stable` branch** -> Stable versions (`@latest` tag on npm)

Every merge to `main` publishes a pre-release automatically. Stable releases are promoted from `main` via a GitHub Actions workflow.

## Style Guidelines

- Use JavaScript with JSDoc type annotations for all new code
- Follow the existing code style (enforced by ESLint and Prettier)
- Use ES6+ features
- Document public APIs using JSDoc
- Keep lines under 100 characters

```bash
# Check formatting
pnpm run format:check

# Auto-fix formatting
pnpm run format

# Run linting
pnpm run lint

# Fix linting issues
pnpm run lint:fix
```

## Community

- **[Discord](https://discord.gg/wjMccuygvy)** -- Chat with the team and other contributors
- **[Docs](https://docs.superdoc.dev)** -- API reference and guides

### Code of Conduct

This project and everyone participating in it are governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to [support@superdoc.dev](mailto:support@superdoc.dev).

### Recognition

We value every contribution. Community contributors are featured in our [README](https://github.com/superdoc-dev/superdoc#community-contributors) and recognized on Discord.

---

Questions? Join our [Discord](https://discord.gg/wjMccuygvy).
