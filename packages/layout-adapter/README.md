# @superdoc/layout-adapter

Adapter-agnostic contract between document sources (ProseMirror today, custom transaction models later) and the SuperDoc layout pipeline.

## SD-3222 acceptance checklist

- [x] `@superdoc/pm-adapter` lives outside `packages/layout-engine/` (`packages/pm-adapter/`)
- [x] Layout runtime packages (`layout-engine`, `layout-bridge`, `painters/dom`, `contracts`) do not import concrete adapters at runtime (Guard H)
- [x] Super-editor presentation path uses `@superdoc/layout-adapter` registry instead of direct `toFlowBlocks` imports
- [x] Default ProseMirror adapter registers via `@superdoc/pm-adapter/register`
- [x] Layout integration tests convert documents through the adapter contract helper

## Usage

Register the default PM adapter once at application startup:

```ts
import '@superdoc/pm-adapter/register';
```

Convert documents through the contract:

```ts
import { getLayoutDocumentAdapter } from '@superdoc/layout-adapter';

const { blocks, bookmarks } = getLayoutDocumentAdapter().toFlowBlocks(docJson, {
  emitSectionBreaks: true,
  converterContext,
});
```

Implement a new adapter by satisfying `LayoutDocumentAdapter` and calling `registerLayoutDocumentAdapter`.
