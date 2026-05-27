import type { FlowBlock, SectionMetadata, TrackedChangesMode } from '@superdoc/contracts';

import type { SectionRange } from './sections.js';

/** Opaque document input for a concrete adapter (e.g. PM JSON). */
export type DocumentAdapterInput = unknown;

export type FlowBlocksResult = {
  blocks: FlowBlock[];
  bookmarks: Map<string, number>;
};

export interface FlowBlockCacheLike {
  clear(): void;
  setHasExternalChanges?(value: boolean): void;
}

export interface DocumentAdapterConvertOptions {
  defaultFont?: string;
  defaultSize?: number;
  blockIdPrefix?: string;
  storyKey?: string;
  atomNodeTypes?: Iterable<string>;
  positions?: unknown;
  mediaFiles?: Record<string, string>;
  emitSectionBreaks?: boolean;
  showBookmarks?: boolean;
  trackedChangesMode?: TrackedChangesMode;
  enableTrackedChanges?: boolean;
  enableRichHyperlinks?: boolean;
  enableComments?: boolean;
  themeColors?: Record<string, string>;
  sectionMetadata?: SectionMetadata[];
  /** Adapter-specific style/converter payload (e.g. PM ConverterContext). */
  converterContext?: unknown;
  flowBlockCache?: FlowBlockCacheLike;
}

export interface DocumentAdapter {
  readonly id: string;
  toFlowBlocks(input: DocumentAdapterInput, options?: DocumentAdapterConvertOptions): FlowBlocksResult;
  createFlowBlockCache?(): FlowBlockCacheLike;
}

export interface SectionAnalysisAdapter {
  analyzeSectionRanges(doc: DocumentAdapterInput, bodySectPr?: unknown): SectionRange[];
}

export interface LayoutDocumentAdapter extends DocumentAdapter, SectionAnalysisAdapter {}
