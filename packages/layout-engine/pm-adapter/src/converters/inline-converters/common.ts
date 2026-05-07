import type { RunProperties, ParagraphProperties } from '@superdoc/style-engine/ooxml';
import type {
  FlowBlock,
  RunBidiContext,
  RunScriptContext,
  SdtMetadata,
  TextRun,
  ParagraphAttrs,
} from '@superdoc/contracts';
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
  storyKey?: string;
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
  storyKey?: string;
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

/**
 * Build a RunBidiContext from raw run properties when any direction signal is set.
 * Returns undefined when nothing to preserve, so empty contexts don't bloat the
 * layout tree. Wave 1c will populate `embedding` (w:dir) and `override` (w:bdo).
 */
const buildBidiContext = (runProperties: RunProperties): RunBidiContext | undefined => {
  if (runProperties.rtl == null) return undefined;
  return { rtl: runProperties.rtl === true };
};

/**
 * Build a RunScriptContext from raw run properties when any script signal is set.
 * Per ECMA §17.3.2.20, w:lang carries three independent language tags - default
 * (Latin), bidi (complex-script), eastAsia - mapped here to one structured field.
 */
const buildScriptContext = (runProperties: RunProperties): RunScriptContext | undefined => {
  const cs = runProperties.cs;
  const lang = runProperties.lang;
  const hasLang = lang != null && (lang.val != null || lang.bidi != null || lang.eastAsia != null);
  if (cs == null && !hasLang) return undefined;

  const ctx: RunScriptContext = { complexScript: cs === true };
  if (hasLang) {
    const language: NonNullable<RunScriptContext['language']> = {};
    if (lang.val != null) language.default = lang.val;
    if (lang.bidi != null) language.complexScript = lang.bidi;
    if (lang.eastAsia != null) language.eastAsian = lang.eastAsia;
    ctx.language = language;
  }
  return ctx;
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
  // Merge runAttrs onto run, but skip undefined values to avoid overwriting
  // mark-derived properties (e.g., bold from a mark) with absent runProperties fields.
  const merged = { ...run };
  for (const key of Object.keys(runAttrs) as Array<keyof typeof runAttrs>) {
    if (runAttrs[key] !== undefined) {
      (merged as Record<string, unknown>)[key] = runAttrs[key];
    }
  }
  // SD-2781: preserve run-level bidi/script metadata. Wave 1a stops at preservation;
  // Wave 1b consumes script.complexScript to gate CS formatting, Wave 1c consumes
  // bidi.embedding and bidi.override.
  const bidi = buildBidiContext(runProperties);
  if (bidi) merged.bidi = bidi;
  const script = buildScriptContext(runProperties);
  if (script) merged.script = script;
  return merged;
};
