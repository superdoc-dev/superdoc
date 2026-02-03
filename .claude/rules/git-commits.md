# Git Commit Rules

## Commit Messages

- Follow conventional commits: `type(scope): description`
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ci`
- Scope should match the package name when applicable (e.g., `react`, `super-editor`, `layout-engine`)

## AI Tool Attribution

**Never mention AI tools in commits or PRs:**
- No `Co-Authored-By: Claude` lines
- No "Generated with Claude Code" footers
- No AI assistant references in commit messages or PR descriptions

## Commit Message Format

Use HEREDOC for multiline commit messages to ensure proper formatting:

```bash
git commit -m "$(cat <<'EOF'
feat(scope): short description

Longer explanation of the change if needed.
- Bullet points for multiple changes
- Another change
EOF
)"
```

## Pull Request Descriptions

- Use markdown formatting with clear sections (## Summary, ## Changes, ## Test Plan)
- Include tables for structured information when helpful
- Reference related issues with `Closes #123` or `Fixes #123`
- Do not include AI attribution footers
