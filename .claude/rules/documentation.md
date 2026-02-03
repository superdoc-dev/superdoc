# Documentation Standards

## File Types

| File | Audience | Purpose |
|------|----------|---------|
| `README.md` | Developers | Getting started, API reference, examples |
| `CLAUDE.md` | AI/LLMs | Architecture overview, quick navigation, implementation details |

## README.md Style (for developers)

Follow MDXEditor/Remotion documentation patterns:

1. **Structure**: Installation → Quick Start → Core Concepts → API Reference → Examples → Troubleshooting
2. **Tone**: Pragmatic, encouraging, concise
3. **Code Examples**:
   - Include runnable snippets
   - Add context comments
   - Progress from simple to complex
4. **Tables**: Use for props, methods, options
5. **Tips/Notes**: Use blockquotes for important callouts

### Example Section Format

```markdown
## Section Name

Brief explanation of the concept.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `prop` | `string` | `'default'` | What it does |

\`\`\`tsx
// Minimal working example
<Component prop="value" />
\`\`\`

> **Tip:** Helpful advice for common use cases.
```

## CLAUDE.md Style (for AI/LLMs)

Optimized for AI assistant comprehension:

1. **Quick Navigation Table**: File paths and purposes upfront
2. **Architecture Diagrams**: ASCII art showing data flow
3. **Implementation Details**: How things work internally
4. **Common Tasks Table**: "If you want to X, look at Y"
5. **Code Patterns**: Show the patterns used in the codebase

### Example CLAUDE.md Structure

```markdown
# Package Name

One-line description. Published as `package-name` on npm.

## Quick Navigation

| Area | Path | Purpose |
|------|------|---------|
| Main | `src/index.ts` | Entry point |

## Architecture

[ASCII diagram or brief explanation]

## Common Tasks

| Task | How |
|------|-----|
| Add feature | Modify X, update Y |
```

## Package Documentation Checklist

- [ ] README.md with installation, quick start, full API
- [ ] CLAUDE.md with architecture, navigation, patterns
- [ ] Update root CLAUDE.md if adding new package
- [ ] Update root README.md quick start section
