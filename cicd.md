# CI/CD Pipeline Documentation

> Comprehensive guide to SuperDoc's continuous integration and deployment workflows.
> For contribution guidelines, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Overview

SuperDoc implements a streamlined dual-track release strategy with fully automated versioning:

- **@next channel**: Pre-release versions from `main` while we build toward v1
- **@latest channel**: Stable versions from `stable` branch
- **@X.x channels**: Patch releases for maintenance branches

All releases are automated through semantic-release based on conventional commits.

## Workflow Architecture

```
main (next) → stable (latest) → X.x (maintenance)
     ↓             ↓                ↓
  pre-releases  stable releases  patch releases
```

## Branch Strategy

- **`main`**: Development branch, releases to @next
- **`stable`**: Production branch, releases to @latest
- **`X.x`**: Maintenance branches for patching old versions

## GitHub Actions Workflows

### Core Workflows

#### 1. PR Validation (`pr-validation.yml`)

**Triggers**: All pull requests

**Checks**:

- Conventional commit validation
- Code formatting (Prettier)
- Linting (ESLint)
- Unit tests
- Visual regression tests
- E2E tests (main branch only)

**Required to pass before merge**.

#### 2. Release (`release.yml`)

**Triggers**:

- Push to `main`, `stable`, or `*.x` branches
- Manual workflow dispatch

**Process**:

1. Run full test suite
2. Build packages
3. Semantic-release publishes:
   - From `main`: X.Y.Z-next.N to @next
   - From `stable`: X.Y.Z to @latest
   - From `X.x`: X.x.Y to @X.x

**Post-release**:

- Stable releases auto-sync to main
- Version bump commit added to main

#### 3. Promote to Stable (`promote-stable.yml`)

**Trigger**: Manual workflow dispatch

**Input**: Optional tag to promote (defaults to latest from main)

**Actions**:

- Merges specified version to stable branch
- Triggers automatic stable release
- Updates npm @latest tag

#### 4. Create Patch Branch (`create-patch.yml`)

**Trigger**: Manual workflow dispatch

**Input**: Major.minor version (e.g., `1.2`)

**Actions**:

- Creates `X.x` branch from last stable tag
- Enables patching of old versions

#### 5. Forward Port (`forward-port.yml`)

**Triggers**:

- New version tags on maintenance branches
- Manual workflow dispatch

**Actions**:

- Cherry-picks fixes from maintenance branches to main
- Creates PR for review
- Labels with `forward-port`

### Support Workflows

#### 6. Test Suite (`test-suite.yml`)

**Type**: Reusable workflow

**Components**:

- Code quality checks (format, lint)
- Unit tests (Vitest)
- Visual regression tests (Playwright)
- E2E tests (external service)

#### 7. Visual Tests (`test-example-apps.yml`)

**Triggers**:

- Changes to `examples/**` or `packages/**/src/**`
- Manual dispatch for screenshot updates

## Release Strategy

### Version Progression

```
main (1.0.0-next.1) → merge to stable → 1.0.0 (@latest)
         ↓                                    ↓
    1.1.0-next.1                         (if needed)
         ↓                               create 1.0.x
    continues...                         → 1.0.1, 1.0.2...
```

### Semantic Versioning

Version bumps are automatic based on commit messages:

| Commit Prefix                  | Version Change | Example                    | Result        |
| ------------------------------ | -------------- | -------------------------- | ------------- |
| `fix:`                         | Patch          | `fix: resolve memory leak` | 1.2.3 → 1.2.4 |
| `feat:`                        | Minor          | `feat: add PDF export`     | 1.2.3 → 1.3.0 |
| `feat!:` or `BREAKING CHANGE:` | Major          | `feat!: new API format`    | 1.2.3 → 2.0.0 |
| `chore:`, `docs:`, `style:`    | None           | `docs: update README`      | No change     |

### NPM Distribution Tags

- **@next**: Latest pre-release from main
  - Install: `npm install superdoc@next`
  - Format: `X.Y.Z-next.N`
- **@latest**: Current stable release
  - Install: `npm install superdoc`
  - Format: `X.Y.Z`
- **@X.x**: Maintenance releases
  - Install: `npm install superdoc@1.2.x`
  - Format: `X.x.Y`

> ℹ️ The legacy scoped package `@harbour-enterprises/superdoc` is mirrored with the same version and dist-tag for every release channel above.

## Workflow Scenarios

### Scenario 1: Feature Development

1. Create feature branch from main
2. Open PR → triggers validation
3. Merge to main → releases `1.1.0-beta.1`

### Scenario 2: Creating Stable Release

1. Run "Promote to Stable" workflow
2. Merges main to stable
3. Automatically publishes `1.1.0` as @latest
4. Syncs back to main with version bump

### Scenario 3: Hotfix to Current Stable

1. Create fix branch from stable
2. Commit: `fix: resolve critical bug`
3. Merge PR → releases `1.1.1`
4. Auto-syncs to main

### Scenario 4: Patch Old Version

1. Run "Create Patch Branch" for version `1.0`
2. Creates `1.0.x` branch
3. Apply fix → releases `1.0.1`
4. Forward-port creates PR to main

## Branch Protection Rules

### Main Branch

- Require pull request before merging
- Require status checks to pass
- Require branches to be up to date
- No force pushes

### Stable Branch

- Same as main
- Allow direct merge from main for promotion

### Maintenance Branches (`*.x`)

- Require pull request
- Allow maintainer fixes
- No force pushes

## Monitoring & Debugging

### Check Release Status

```bash
# View latest releases
pnpm view superdoc versions --json

# Check current tags
pnpm view superdoc dist-tags

# Dry run to preview release
pnpx semantic-release --dry-run --no-ci
```

### Common Issues

**Version not incrementing on main:**

- After stable release, main needs a feat/fix commit to bump version
- Automatic version bump commit handles this

**Maintenance branch conflicts:**

- Only create X.x branches AFTER moving past that version on stable
- Example: Create 1.0.x only after stable is at 1.1.0+

---

For contribution guidelines and development setup, see [CONTRIBUTING.md](CONTRIBUTING.md).  
For questions about CI/CD, reach out on [Discord](https://discord.gg/wjMccuygvy) or [GitHub Discussions](https://github.com/superdoc-dev/superdoc/discussions).
