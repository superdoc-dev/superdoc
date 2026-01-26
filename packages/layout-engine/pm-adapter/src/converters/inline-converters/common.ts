import type { RunProperties, ParagraphProperties } from '@superdoc/style-engine/ooxml';
import type { SdtMetadata, TextRun } from '@superdoc/contracts';
import { HyperlinkConfig, PMMark, PMNode, PositionMap, ThemeColorPalette } from '../../types';
import { ConverterContext } from '../../converter-context';
import { computeRunAttrs } from '../../attributes/paragraph';

type VisitNodeFn = (
  node: PMNode,
  inheritedMarks: PMMark[],
  activeSdt: SdtMetadata | undefined,
  activeRunProperties: RunProperties | undefined,
  activeHidden?: boolean,
) => void;

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
