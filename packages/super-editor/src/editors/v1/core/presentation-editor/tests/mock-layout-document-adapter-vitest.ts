import { vi } from 'vitest';
import { pmLayoutDocumentAdapter } from '@superdoc/pm-adapter/layout-document-adapter';
type LayoutAdapterVitestOverrides = {
  toFlowBlocks?: (...args: unknown[]) => unknown;
  analyzeSectionRanges?: (...args: unknown[]) => unknown;
  createFlowBlockCache?: () => { clear(): void };
};

export async function buildLayoutDocumentAdapterVitestMock(
  importOriginal: () => Promise<Record<string, unknown>>,
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
