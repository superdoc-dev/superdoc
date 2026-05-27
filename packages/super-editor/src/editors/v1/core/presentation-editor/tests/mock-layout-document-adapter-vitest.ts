import { vi } from 'vitest';
import { pmLayoutDocumentAdapter } from '@superdoc/pm-adapter/layout-document-adapter';
import type { LayoutDocumentAdapter } from '@superdoc/layout-adapter';

export type LayoutAdapterVitestOverrides = {
  toFlowBlocks?: LayoutDocumentAdapter['toFlowBlocks'];
  analyzeSectionRanges?: LayoutDocumentAdapter['analyzeSectionRanges'];
  createFlowBlockCache?: NonNullable<LayoutDocumentAdapter['createFlowBlockCache']>;
};

export async function buildLayoutDocumentAdapterVitestMock(
  importOriginal: () => Promise<typeof import('@superdoc/layout-adapter')>,
  overrides: LayoutAdapterVitestOverrides = {},
) {
  const actual = await importOriginal();
  const base = pmLayoutDocumentAdapter;
  return {
    ...actual,
    getLayoutDocumentAdapter: () => ({
      ...base,
      toFlowBlocks: overrides.toFlowBlocks ?? base.toFlowBlocks.bind(base),
      analyzeSectionRanges: overrides.analyzeSectionRanges ?? base.analyzeSectionRanges.bind(base),
      createFlowBlockCache:
        overrides.createFlowBlockCache ?? (() => base.createFlowBlockCache?.() ?? { clear: vi.fn() }),
    }),
  };
}
