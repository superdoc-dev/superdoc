import type { RunProperties, ParagraphProperties } from '@superdoc/style-engine/ooxml';
import type { FlowBlock, SdtMetadata, TextRun, ParagraphAttrs } from '@superdoc/contracts';
import {
  HyperlinkConfig,
  NodeHandlerContext,
  PMMark,
  PMNode,
  PositionMap,
  ThemeColorPalette,
  BlockIdGenerator,
  Position,
} from '../../types';
import { ConverterContext } from '../../converter-context';
import { computeRunAttrs } from '../../attributes/paragraph';

type VisitNodeFn = (
  node: PMNode,
  inheritedMarks: PMMark[],
  activeSdt: SdtMetadata | undefined,
  activeRunProperties: RunProperties | undefined,
  activeHidden?: boolean,
) => void;

export class HiddenByVanishError extends Error {
  constructor() {
    super('Node is hidden by vanish property');
    this.name = 'HiddenByVanishError';
  }
}

export class NotInlineNodeError extends Error {
  constructor() {
    super('Node is not an inline node');
    this.name = 'NotInlineNodeError';
  }
}

export type InlineConverterParams = {
  node: PMNode;
  positions: PositionMap;
  inheritedMarks: PMMark[];
  defaultFont: string;
  defaultSize: number;
  sdtMetadata: SdtMetadata | undefined;
  hyperlinkConfig: HyperlinkConfig;
  themeColors: ThemeColorPalette | undefined;
  runProperties: RunProperties | undefined;
  paragraphProperties: ParagraphProperties | undefined;
  converterContext: ConverterContext;
  enableComments: boolean;
  visitNode: VisitNodeFn;
  bookmarks: Map<string, number> | undefined;
  tabOrdinal: number;
  paragraphAttrs: ParagraphAttrs;
  nextBlockId: BlockIdGenerator;
};

export type BlockConverterOptions = {
  blocks: FlowBlock[];
  nextBlockId: BlockIdGenerator;
  nextId: () => string;
  positions: WeakMap<PMNode, Position>;
  trackedChangesConfig: NodeHandlerContext['trackedChangesConfig'];
  defaultFont: string;
  defaultSize: number;
  converterContext: ConverterContext;
  hyperlinkConfig: NodeHandlerContext['hyperlinkConfig'];
  enableComments: boolean;
  bookmarks: Map<string, number>;
  converters: NodeHandlerContext['converters'];
  paragraphAttrs: ParagraphAttrs;
};

export const applyInlineRunProperties = (
  run: TextRun,
  runProperties: RunProperties | undefined,
  converterContext?: ConverterContext,
): TextRun => {
  if (!runProperties) {
    return run;
  }
  const runAttrs = computeRunAttrs(runProperties, converterContext);
  return { ...run, ...runAttrs };
};
