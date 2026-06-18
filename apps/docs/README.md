# SuperDoc Documentation

Unified documentation site for both the SuperDoc JavaScript SDK and REST API, built with Mintlify.

Admin console: https://app.mintlify.com/superdoc/superdoc

## Quick start

```bash
# Install Mintlify CLI
# Ref: https://www.mintlify.com/docs/cli/install
# Note: mint login enables search capabilities locally (and more)
npm i -g mint
mint login

# Go to docs directory
cd  superdoc/public/apps/docs

# Install dependencies
pnpm install

# Start development server
mint dev

# Visit localhost
open http://localhost:3000
```

## Project structure

`docs.json` is the source of truth for navigation. File paths should mirror the nav structure.

```text
├── docs.json                         # Mintlify config, navigation, redirects
├── getting-started/                  # Installation, quickstart, frameworks
├── editor/                           # SuperDoc, React, custom UI, modules, collaboration
├── document-engine/                  # Engine, SDK, CLI, diffing
├── document-api/                     # Manual docs plus generated reference pages
│   ├── reference/                    # Generated and committed
│   └── available-operations.mdx      # Manual except generated operations block
├── ai/                               # MCP, agents, skills, evals
├── solutions/                        # eSign and template builder docs
├── api-reference/                    # Backend services docs from OpenAPI
├── extensions/                       # Extension docs generated from JSDoc
├── snippets/                         # Reusable MDX snippets
├── public/                           # Images and icons
├── scripts/                          # Generation and validation scripts
└── __tests__/                        # Docs example tests
```

## Development

### Developing with local SuperDoc changes

To preview docs with your local SuperDoc source (instead of the published npm version), run from the **repo root**:

```bash
pnpm dev:docs
```

This starts three processes:

- **Vite dev server** (port 9094) — serves the built CDN bundle at `/dist`
- **CDN watcher** — rebuilds `dist/superdoc.min.js` automatically when source files change
- **Mintlify** (port 3001) — the docs dev server

The `<SuperDocEditor>` widget detects `localhost` and loads SuperDoc from the local Vite server instead of jsDelivr. After saving a source file, the CDN watcher rebuilds automatically — refresh the docs page to see the changes.

### Available Scripts

- `pnpm dev` - Start Mintlify development server (uses unpkg, no local changes)
- `pnpm dev:docs` - Start full local dev environment (**run from repo root**)
- `pnpm sync:api` - Sync API documentation from OpenAPI spec
- `pnpm sync:sdk` - Sync SDK documentation from TypeDoc
- `pnpm sync:all` - Sync both API and SDK documentation
- `pnpm test:local` - Test the documentation locally

### Testing Documentation Locally

```bash
# Test the sync process locally
pnpm test:local
```

### Manual Sync from Local Repositories

```bash
# Sync from a local SuperDoc repository
node scripts/sync-sdk-docs.js ../SuperDoc/packages/super-editor/src/extensions

# Sync API documentation
pnpm sync:api
```

## Writing Documentation

### Manual Pages

Create MDX files in the appropriate directories:

```mdx
---
title: Page Title
description: Page description
---

# Content here

<Note>
  Use Mintlify components for rich content
</Note>
```
More info on MDX: https://mintlify.com/docs/text

### Extension Documentation (Auto-generated)

Extension docs are **auto-generated** from JSDoc comments in the SuperDoc repository.

**Do not edit files in `/extensions` directly** - they will be overwritten.

To update extension documentation:
1. Edit JSDoc comments in SuperDoc repo
2. Push to main branch
3. Documentation updates automatically

#### JSDoc Format

```javascript
/**
 * Extension description
 * @since 1.0.0
 * @module ExtensionName
 */
export const ExtensionName = Extension.create({
  addCommands() {
    return {
      /**
       * Command description
       * @param {string} param - Parameter description
       * @returns {boolean} Success status
       * @example
       * editor.commands.myCommand('value')
       */
      myCommand: (param) => {},
    };
  },
});
```

## Versioning

Documentation follows [Semantic Versioning](https://semver.org/) with automated releases via [semantic-release](https://github.com/semantic-release/semantic-release).

### Conventional Commits

Use conventional commit format to trigger automatic version bumps:

- `docs: fix typo in API guide` → patch (0.0.1 → 0.0.2)
- `feat: add webhooks section` → minor (0.0.1 → 0.1.0)
- `feat!: restructure navigation` → major (0.0.1 → 1.0.0)
- `chore: update workflow` → no release

Releases are created automatically on push to `main`, updating `CHANGELOG.md`, `package.json`, and creating GitHub releases.

## Automatic Updates & CI/CD

The documentation automatically syncs with upstream repositories:

1. **Changes in SuperDoc repo** - When extension files change in the main repository
2. **Manual trigger** - Via GitHub Actions UI
3. **API updates** - When OpenAPI spec changes

### GitHub Secrets Required

- `MINTLIFY_API_KEY` - From Mintlify dashboard
- `GH_PAT` - Personal access token for releases and commits
