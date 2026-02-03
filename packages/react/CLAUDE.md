# @superdoc/react

React wrapper for SuperDoc.

## Files

| File | Purpose |
|------|---------|
| `src/SuperDocEditor.tsx` | Main component |
| `src/types.ts` | TypeScript types |
| `src/utils.ts` | ID generation |
| `src/index.ts` | Exports |

## Type System

Types are extracted from `superdoc` to avoid duplication:

```typescript
type SuperDocConstructorConfig = ConstructorParameters<typeof SuperDoc>[0];

export type DocumentMode = NonNullable<SuperDocConstructorConfig['documentMode']>;
export type SuperDocUser = NonNullable<SuperDocConstructorConfig['user']>;
// etc.

// Props extend SuperDocConfig + React-specific props
export interface SuperDocEditorProps
  extends Omit<SuperDocConfig, 'selector' | 'documentMode'>,
    Partial<Pick<SuperDocConfig, 'documentMode'>>,
    ReactProps {}
```

## React-Specific Props

| Prop | Description |
|------|-------------|
| `renderLoading` | Loading UI |
| `hideToolbar` | Hide toolbar |
| `className` | Wrapper class |
| `style` | Wrapper styles |

## Ref API

```typescript
ref.current?.getInstance()?.setDocumentMode('viewing');
ref.current?.getInstance()?.export({ triggerDownload: true });
```

## Commands

```bash
pnpm --filter @superdoc/react build
pnpm --filter @superdoc/react test
```
