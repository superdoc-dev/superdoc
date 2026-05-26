import type { LayoutStoryLocator } from '@superdoc/contracts';

export type FragmentRenderContext = {
  pageNumber: number;
  totalPages: number;
  section: 'body' | 'header' | 'footer';
  story?: LayoutStoryLocator;
  pageNumberText?: string;
  pageIndex?: number;
};
