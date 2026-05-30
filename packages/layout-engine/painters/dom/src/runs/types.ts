import type { ImageHyperlink, ParagraphBlock, Run, SdtMetadata, TrackedChangesMode } from '@superdoc/contracts';
import type { FragmentRenderContext } from '../renderer.js';

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
  contentControlsChrome: 'default' | 'none';
  pendingTooltips: WeakMap<HTMLElement, string>;
  getNextLinkId: () => string;
  applySdtDataset: (el: HTMLElement | null, metadata?: SdtMetadata | null) => void;
  buildImageHyperlinkAnchor: (
    child: HTMLElement,
    hyperlink: ImageHyperlink | undefined,
    display: string,
  ) => HTMLElement;
  resolveTrackedChangesConfig: (block: ParagraphBlock) => TrackedChangesRenderConfig;
  applyTrackedChangeDecorations: (elem: HTMLElement, run: Run, config: TrackedChangesRenderConfig) => void;
  resolveRunSdtId: (run: Run) => { sdtId: string; sdt: SdtMetadata } | null;
  createInlineSdtWrapper: (sdt: SdtMetadata) => HTMLElement;
  syncInlineSdtWrapperTypography: (wrapper: HTMLElement, runForSizing?: Run) => void;
  expandSdtWrapperPmRange: (wrapper: HTMLElement, pmStart?: number | null, pmEnd?: number | null) => void;
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
