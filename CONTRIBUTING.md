# Contributing to SuperDoc

Thank you for your interest in contributing to SuperDoc! We're excited to have you join our community. This document provides guidelines and information about contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Pull Request Process](#pull-request-process)
- [Release Process](#release-process)
- [Style Guidelines](#style-guidelines)
- [Community](#community)

## Code of Conduct

This project and everyone participating in it are governed by our Code of Conduct. By participating, you are expected to uphold this code. Please report unacceptable behavior to [support@harbourshare.com](mailto:support@harbourshare.com).

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check [existing issues](https://github.com/superdoc-dev/superdoc/issues) as you might find that the issue has already been reported. When creating a bug report, include as many details as possible:

- A clear and descriptive title
- Steps to reproduce the issue
- Expected behavior vs actual behavior
- Screenshots if applicable
- Your environment (browser, OS, SuperDoc version)
- Code samples demonstrating the issue
- Any relevant error messages

### Suggesting Features

Feature suggestions are tracked as GitHub issues. When creating a feature suggestion:

- Use a clear and descriptive title
- Provide a detailed description of the proposed feature
- Explain why this feature would be useful
- Include mockups or examples if applicable

### Documentation Improvements

Documentation is crucial for our project. You can help by:

- Fixing typos and grammar
- Adding code examples
- Improving explanations
- Adding new sections
- Translating documentation

### Code Contributions

#### Types of Contributions

1. **Bug fixes**: Resolve existing issues
2. **Features**: Implement new functionality
3. **Performance improvements**: Optimize existing code
4. **Tests**: Add or improve test coverage
5. **Framework integrations**: Create examples for different frameworks
6. **Documentation**: Improve SuperDoc documentation

## Development Setup

1. **Fork and Clone**:

   ```bash
   git clone https://github.com/superdoc-dev/superdoc.git
   cd SuperDoc
   ```

2. **Install Dependencies** (pnpm required):

   ```bash
   pnpm install
   ```

3. **Set Up Development Environment**:

   ```bash
   pnpm run dev
   ```

4. **Run Tests**:
   ```bash
   pnpm test
   ```

## Pull Request Process

1. **Branch Naming**:

   - `feature/description` for new features
   - `fix/description` for bug fixes
   - `docs/description` for documentation changes
   - `perf/description` for performance improvements

2. **Commit Messages**:

   Follow [Conventional Commits](https://www.conventionalcommits.org/):

   ```
   feat: add real-time cursor sharing

   - Implement cursor position tracking
   - Add websocket connection for updates
   - Include user identification

   Closes #123
   ```

3. **Automated Checks**:

   When you open a PR, the following checks run automatically:

   - Commit message validation
   - Code formatting (Prettier)
   - Linting (ESLint)
   - Unit tests
   - Visual regression tests (if UI changes)
   - E2E tests (for PRs to main)

4. **Before Submitting**:

   - Update documentation if needed
   - Add or update tests
   - Run the test suite locally
   - Ensure all CI checks pass

5. **Pull Request Description**:
   - Describe the changes
   - Link to related issues
   - Include screenshots for UI changes
   - List any breaking changes
   - Mention dependencies added/removed

## Release Process

SuperDoc uses a fully automated CI/CD pipeline with semantic-release. **No manual version bumps are needed.**

### How It Works

#### Branch Strategy

- **`main` branch** → Pre-release versions (`@next` tag on npm)
- **`stable` branch** → Stable versions (`@latest` tag on npm)
- **`X.x` branches** → Maintenance versions (`@X.x` tags on npm)

#### Version Control Through Commits

Your commit messages automatically determine version changes:

| Commit Type                                       | Version Bump      | Example                               | Result        |
| ------------------------------------------------- | ----------------- | ------------------------------------- | ------------- |
| `fix:`                                            | Patch (0.0.X)     | `fix: resolve cursor positioning bug` | 1.2.3 → 1.2.4 |
| `feat:`                                           | Minor (0.X.0)     | `feat: add PDF export functionality`  | 1.2.3 → 1.3.0 |
| `feat!:` or `BREAKING CHANGE:`                    | Major (X.0.0)     | `feat!: redesign document API`        | 1.2.3 → 2.0.0 |
| `chore:`, `docs:`, `style:`, `refactor:`, `test:` | No version change | `docs: update README`                 | 1.2.3 → 1.2.3 |

### Commit Message Format

```bash
# Feature with scope
feat(editor): add table support

# Bug fix with detailed description
fix: resolve memory leak in collaboration module

- Clear event listeners on disconnect
- Add cleanup in useEffect
- Fix WebSocket connection disposal

Fixes #456

# Breaking change (two ways)
feat!: change document format to support annotations

# Or with footer
feat: redesign plugin API

BREAKING CHANGE: Plugins must now export a default function
```

### Release Workflow

#### Automatic Releases

1. **Pre-release from main**:

   - Every merge to `main` triggers tests
   - If tests pass, publishes `X.Y.Z-next.N` to npm
   - Example: `1.0.0-next.1`, `1.0.0-next.2`

2. **Stable release (promoting from main)**:

   - Use GitHub Actions "Promote to Stable" workflow
   - Merges main to stable branch
   - Publishes stable version (e.g., `1.0.0`)
   - Automatically syncs back to main

3. **Hotfix to current stable**:

   - Create fix branch from `stable`
   - Push fix commits
   - Merge PR → publishes patch version
   - Auto-syncs to main

4. **Patch old versions**:
   - Use "Create Patch Branch" workflow
   - Input version (e.g., `1.0`)
   - Creates `1.0.x` branch
   - Apply fixes → publishes `1.0.1`, `1.0.2`, etc.

#### Manual Testing

Preview what will be released:

```bash
pnpx semantic-release --dry-run --no-ci
```

### CI/CD Pipeline Details

For comprehensive information about our CI/CD workflows, automated testing, and release pipelines, see [cicd.md](cicd.md).

## Style Guidelines

### JavaScript

- Use JavaScript for all new code
- Follow the existing code style (enforced by ESLint)
- Use ES6+ features when appropriate
- Document public APIs using JSDoc
- Maximum line length of 100 characters
- Use meaningful variable names

### Code Quality

```bash
# Check formatting
npm run format:check

# Auto-fix formatting
npm run format

# Run linting
npm run lint

# Fix linting issues
npm run lint:fix
```

### Documentation

- Use JSDoc for all public APIs
- Include code examples when relevant
- Keep explanations clear and concise
- Use proper Markdown formatting

### Testing

- Write tests for new features
- Update tests for bug fixes
- Aim for high coverage of critical paths
- Include both unit and integration tests
- Test edge cases and error conditions

## Community

- Join our [Discord server](https://discord.gg/wjMccuygvy) for discussions
- Participate in [GitHub Discussions](https://github.com/superdoc-dev/superdoc/discussions)
- Follow development updates on our [roadmap](https://github.com/superdoc-dev/superdoc/wiki/🎯️-SuperDoc-Roadmap)

### Recognition

We recognize contributions in several ways:

- Featured in our [contributors page](https://github.com/superdoc-dev/superdoc#contributors)
- Mentioned in release notes
- Community contributor badge in Discord
- Opportunities to join the core team

## Questions?

If you have questions, feel free to:

- Start a [GitHub Discussion](https://github.com/superdoc-dev/superdoc/discussions)
- Join our [Discord server](https://discord.gg/wjMccuygvy)
- Email us at [support@harbourshare.com](mailto:support@harbourshare.com)

---

Thank you for contributing to SuperDoc! Your efforts help make document editing on the web better for everyone.
