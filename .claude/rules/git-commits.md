# Git Commit Guidelines

## AI Tool Attribution

- **Never mention AI tools** (Claude, Claude Code, GPT, Copilot, etc.) in commit messages, PR descriptions, or code comments
- Do not include "Co-Authored-By" lines referencing AI assistants
- Commits should appear as if written entirely by the human developer

## Commit Message Format

- Follow conventional commits: `type(scope): description`
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`
- Keep the first line under 72 characters
- Use imperative mood: "Add feature" not "Added feature"

## Examples

Good:
```
feat(react): add callback type definitions
fix(editor): resolve memory leak on unmount
```

Bad:
```
feat(react): add callback types

Co-Authored-By: Claude <noreply@anthropic.com>
```
