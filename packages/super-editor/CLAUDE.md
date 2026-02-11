# Super Editor

ProseMirror-based document editor for SuperDoc.

## Quick Navigation

| Area | Path | Purpose |
|------|------|---------|
| Extensions | `src/extensions/` | Feature modules (bold, table, comment, etc.) |
| Core | `src/core/Editor.ts` | Main editor class and lifecycle |
| Commands | `src/core/commands/` | Low-level transformation operations |
| Converter | `src/core/super-converter/` | DOCX import/export |
| Helpers | `src/core/helpers/` | DOM/schema utilities |
| Schema | `src/schema/` | Document schema definitions |

## Extension Pattern

Extensions use a fluent builder pattern:

```javascript
export const MyExtension = Mark.create({
  name: 'my-extension',
  addOptions() { return { /* config */ }; },
  addAttributes() { /* DOM mappings */ },
  parseHTML() { /* HTML → PM */ },
  renderHTML() { /* PM → HTML */ },
  addCommands() { return { /* editor.commands.* */ }; },
  addPmPlugins() { /* state/behavior */ },
});
```

**Example to follow**: `src/extensions/bold/` for marks, `src/extensions/paragraph/` for nodes

## Key Concepts

| Concept | Description | Stored in Document? |
|---------|-------------|---------------------|
| **Mark** | Inline formatting (bold, color) | Yes |
| **Node** | Block or inline element (paragraph, image) | Yes |
| **Decoration** | Visual-only overlay (highlights, selections) | No |
| **Plugin** | State and transaction handlers | N/A |

## Common Tasks

| Task | Where to look |
|------|---------------|
| Add inline formatting | Create mark extension in `src/extensions/` |
| Add block element | Create node extension in `src/extensions/` |
| Add keyboard shortcut | Use `addShortcuts()` in extension |
| Add visual decoration | Use `addPmPlugins()` with DecorationSet |
| Support new DOCX element | Add handler in `super-converter/v3/handlers/w/` |

## Converter Rules (super-converter)

The converter is a **parser**, not a style resolver.

- **DO**: Parse XML elements and store their raw properties on node attributes
- **DO**: Store style references (e.g., `tableStyleId`) so the style-engine can resolve them later
- **DON'T**: Resolve style cascades (e.g., looking up table style conditional formatting to compute cell backgrounds)
- **DON'T**: Merge inherited properties into inline attributes

Style cascade resolution belongs in `layout-engine/style-engine/`. See root CLAUDE.md "Style Resolution Boundary".

## Entry Points

- `src/extensions/index.js` - All registered extensions
- `src/core/Editor.ts` - Main editor class
- `src/core/CommandService.js` - Command execution
- `src/core/super-converter/SuperConverter.js` - DOCX conversion

## Testing

Tests are co-located: `feature.test.js` next to `feature.js`

Run: `pnpm test` from package root
