import type { Layout, FlowMode, ResolvedLayout, ResolvedPage } from '@superdoc/contracts';

export type ResolveLayoutInput = {
  layout: Layout;
  flowMode: FlowMode;
};

export function resolveLayout(input: ResolveLayoutInput): ResolvedLayout {
  const { layout, flowMode } = input;
  const pages: ResolvedPage[] = layout.pages.map((page, index) => ({
    id: `page-${index}`,
    index,
    number: page.number,
    width: page.size?.w ?? layout.pageSize.w,
    height: page.size?.h ?? layout.pageSize.h,
    items: [],
  }));

  return {
    version: 1,
    flowMode,
    pageGap: layout.pageGap ?? 0,
    pages,
  };
}
