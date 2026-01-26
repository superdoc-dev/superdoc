# SuperDoc Documentation

A unified documentation site for both the SuperDoc JavaScript SDK and REST API, built with Mintlify.

## Quick Start

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Visit http://localhost:3000
```

## Project Structure

```
├── introduction.mdx          # Landing page
├── quickstart.mdx           # Quick start guide
├── setup/                   # Installation and configuration
├── extensions/              # Extension docs [auto-generated]
│   ├── field-annotation.mdx
│   ├── track-changes.mdx
│   ├── comments.mdx
│   └── document-section.mdx
├── collaboration/           # Collaboration features
├── customization/          # Customization guides
├── framework/              # Framework integrations
├── advanced/               # Advanced topics
├── api-reference/          # API documentation [auto-generated]
└── scripts/                # Sync scripts
    ├── sync-api-docs.js
    └── sync-sdk-docs.js
```

## Development

### Available Scripts

- `pnpm dev` - Start Mintlify development server
- `pnpm build` - Build documentation for production
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