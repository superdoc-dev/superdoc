/**
 * Builds a vitest module mock for the v1 layout adapter (`@core/layout-adapter`).
 *
 * The presentation/header-footer/notes paths now import `toFlowBlocks`,
 * `analyzeSectionRanges`, and `FlowBlockCache` directly from the moved v1
 * adapter instead of resolving a process-global registry. Tests mock the
 * module surface and override only the functions they care about, preserving
 * every other real export via `importOriginal()`.
 */
type LayoutAdapterVitestOverrides = {
  toFlowBlocks?: (...args: unknown[]) => unknown;
  analyzeSectionRanges?: (...args: unknown[]) => unknown;
  FlowBlockCache?: new (...args: unknown[]) => { clear(): void };
};

export async function buildLayoutDocumentAdapterVitestMock(
  importOriginal: () => Promise<Record<string, unknown>>,
  overrides: LayoutAdapterVitestOverrides = {},
) {
  const actual = await importOriginal();
  return {
    ...actual,
    ...(overrides.toFlowBlocks ? { toFlowBlocks: overrides.toFlowBlocks } : {}),
    ...(overrides.analyzeSectionRanges ? { analyzeSectionRanges: overrides.analyzeSectionRanges } : {}),
    ...(overrides.FlowBlockCache ? { FlowBlockCache: overrides.FlowBlockCache } : {}),
  };
}
