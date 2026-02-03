---
paths:
  - "packages/react/**/*"
  - "examples/react-wrapper/**/*"
---

# React Wrapper Development

## Package: @superdoc/react

Location: `packages/react/`

### Key Files

| File | Purpose |
|------|---------|
| `src/SuperDocEditor.tsx` | Main component with forwardRef |
| `src/types.ts` | Props and ref interfaces |
| `src/utils.ts` | `useStableId` hook |
| `src/index.ts` | Public exports |

### Architecture Patterns

1. **SSR Safety**: Use dynamic `import()` for superdoc to prevent server-side errors
2. **Stable IDs**: Use `useRef` counter instead of `useId` for React 16.8+ compatibility
3. **Ref Methods**: All ref methods delegate to SuperDoc instance, return `undefined` before ready
4. **Document Changes**: Rebuild on document prop change (include in useEffect dependencies)
5. **Mode Changes**: Prefer ref method `setDocumentMode()` over prop changes to avoid rebuild

### Adding New Props

1. Add type to `SuperDocEditorProps` in `types.ts`
2. Pass to SuperDoc config in `SuperDocEditor.tsx`
3. Document in README.md

### Adding New Ref Methods

1. Add to `SuperDocRef` interface in `types.ts`
2. Implement in `useImperativeHandle` in `SuperDocEditor.tsx`
3. Document in README.md

### Testing

```bash
pnpm --filter @superdoc/react test
```

Tests use real superdoc (no mocks) for integration testing.

### Example App

Location: `examples/react-wrapper/`

Run: `pnpm --filter react-wrapper-example dev`

The example app demonstrates:
- File upload and document switching
- Mode switching (editing/suggesting/viewing)
- Events logging panel
- HTML export panel
- Responsive layout with CSS flexbox
