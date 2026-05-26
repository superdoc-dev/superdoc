import type { ImageHyperlink, ParagraphBlock, Run, SdtMetadata, TrackedChangesMode } from '@superdoc/contracts';
import type { FragmentRenderContext } from '../fragment-context.js';

export type RenderedLineInfo = {
  el: HTMLElement;
  top: number;
  height: number;
};

export type TrackedChangesRenderConfig = {
  mode: TrackedChangesMode;
  enabled: boolean;
};

export type LinkRenderData = {
  href?: string;
  target?: string;
  rel?: string;
  tooltip?: string | null;
  dataset?: Record<string, string>;
  blocked: boolean;
};

export type RunRenderContext = {
  doc: Document;
  layoutEpoch: number;
  showFormattingMarks: boolean;
  pendingTooltips: WeakMap<HTMLElement, string>;
  getNextLinkId: () => string;
  applySdtDataset: (el: HTMLElement | null, metadata?: SdtMetadata | null) => void;
  buildImageHyperlinkAnchor: (
    child: HTMLElement,
    hyperlink: ImageHyperlink | undefined,
    display: string,
  ) => HTMLElement;
  createInlineSdtWrapper: (sdt: SdtMetadata) => HTMLElement;
};

export type RenderLineParams = {
  block: ParagraphBlock;
  line: import('@superdoc/contracts').Line;
  context: FragmentRenderContext;
  availableWidthOverride?: number;
  lineIndex?: number;
  skipJustify?: boolean;
  preExpandedRuns?: Run[];
  resolvedListTextStartPx?: number;
  indentOffsetOverride?: number;
  paragraphMarkLeftOffsetOverride?: number;
  runContext: RunRenderContext;
};
