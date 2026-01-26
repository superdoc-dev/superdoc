import type { RunProperties } from '@superdoc/style-engine/ooxml';
import type { SdtMetadata, TextRun } from '@superdoc/contracts';
import { HyperlinkConfig, PMMark, PMNode, PositionMap, ThemeColorPalette } from '../../types';
import { ConverterContext } from '../../converter-context';
import { computeRunAttrs } from '../../attributes/paragraph';

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
  converterContext: ConverterContext;
  enableComments: boolean;
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
