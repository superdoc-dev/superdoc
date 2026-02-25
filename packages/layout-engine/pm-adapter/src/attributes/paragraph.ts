/**
 * Paragraph Attributes Computation Module
 *
 * Functions for computing, merging, and normalizing paragraph attributes,
 * including style resolution, boolean attributes, and Word layout integration.
 */

import { toCssFontFamily } from '@superdoc/font-utils';
import type {
  ParagraphAttrs,
  ParagraphIndent,
  DropCapDescriptor,
  DropCapRun,
  ParagraphFrame,
} from '@superdoc/contracts';
import type { PMNode } from '../types.js';
import type { ResolvedRunProperties } from '@superdoc/word-layout';
import { computeWordParagraphLayout } from '@superdoc/word-layout';
import { pickNumber, twipsToPx, isFiniteNumber, ptToPx } from '../utilities.js';
import { normalizeAlignment, normalizeParagraphSpacing } from './spacing-indent.js';
import { normalizeOoxmlTabs } from './tabs.js';
import { normalizeParagraphBorders, normalizeParagraphShading } from './borders.js';
import type { ConverterContext } from '../converter-context.js';

import {
  resolveParagraphProperties,
  resolveRunProperties,
  resolveDocxFontFamily,
  type ParagraphFrameProperties,
  type ParagraphProperties,
  type RunProperties,
} from '@superdoc/style-engine/ooxml';

const DEFAULT_DECIMAL_SEPARATOR = '.';
const DEFAULT_TAB_INTERVAL_TWIPS = 720; // 0.5 inch

const normalizeColor = (value?: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'auto') return undefined;
  const upper = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
  return `#${upper.toUpperCase()}`;
};

export const deepClone = <T>(obj: T): T => {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => deepClone(item)) as unknown as T;
  }
  const clone: Record<string, unknown> = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      clone[key] = deepClone((obj as Record<string, unknown>)[key]);
    }
  }
  return clone as T;
};

/**
 * Convert indent from twips to pixels.
 */
const normalizeIndentTwipsToPx = (indent?: ParagraphIndent | null): ParagraphIndent | undefined => {
  if (!indent) return undefined;
  const result: ParagraphIndent = {};
  const toNum = (v: unknown): number | undefined => {
    if (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v))) return Number(v);
    if (isFiniteNumber(v)) return Number(v);
    return undefined;
  };

  const left = toNum(indent.left);
  const right = toNum(indent.right);
  const firstLine = toNum(indent.firstLine);
  const hanging = toNum(indent.hanging);

  if (left != null) result.left = twipsToPx(left);
  if (right != null) result.right = twipsToPx(right);
  if (firstLine != null) result.firstLine = twipsToPx(firstLine);
  if (hanging != null) result.hanging = twipsToPx(hanging);
  return Object.keys(result).length > 0 ? result : undefined;
};

export const normalizeFramePr = (value: ParagraphFrameProperties | undefined): ParagraphFrame | undefined => {
  if (!value) return undefined;

  const frame: Record<string, unknown> = {};
  if (value.wrap) {
    frame.wrap = value.wrap;
  }
  if (value.x != null) {
    frame.x = twipsToPx(value.x);
  }
  if (value.y != null) {
    frame.y = twipsToPx(value.y);
  }
  if (value.xAlign) {
    frame.xAlign = value.xAlign as 'left' | 'right' | 'center';
  }
  if (value.yAlign) {
    frame.yAlign = value.yAlign as 'top' | 'center' | 'bottom';
  }
  if (value.hAnchor) {
    frame.hAnchor = value.hAnchor;
  }
  if (value.vAnchor) {
    frame.vAnchor = value.vAnchor;
  }
  return Object.keys(frame).length > 0 ? (frame as ParagraphFrame) : undefined;
};

export const normalizeNumberingProperties = (
  value: ParagraphProperties['numberingProperties'] | undefined,
): ParagraphProperties['numberingProperties'] | undefined => {
  if (value?.numId === 0) {
    return undefined;
  }
  return value;
};
export const normalizeDropCap = (
  framePr: ParagraphFrameProperties | undefined,
  para: PMNode,
  converterContext?: ConverterContext,
): DropCapDescriptor | undefined => {
  if (!framePr || !framePr.dropCap || framePr.dropCap === 'none') return undefined;

  const dropCap = framePr.dropCap;

  // Build structured DropCapDescriptor for enhanced drop cap support
  const dropCapMode = typeof dropCap === 'string' ? dropCap.toLowerCase() : 'drop';
  const linesValue = pickNumber(framePr.lines);

  // Extract the drop cap text and run styling from paragraph content
  const dropCapRunInfo = extractDropCapRunFromParagraph(para, converterContext);

  if (dropCapRunInfo) {
    const descriptor: DropCapDescriptor = {
      mode: dropCapMode === 'margin' ? 'margin' : 'drop',
      lines: linesValue != null && linesValue > 0 ? linesValue : 3,
      run: dropCapRunInfo,
    };

    // Map wrap value to the expected types
    if (framePr.wrap) {
      descriptor.wrap = (framePr.wrap === 'auto' ? undefined : framePr.wrap) as
        | 'around'
        | 'notBeside'
        | 'none'
        | 'tight';
    }

    return descriptor;
  }
};

/**
 * Default drop cap font size in pixels.
 * Corresponds to roughly 48pt which is a common drop cap size.
 */
const DEFAULT_DROP_CAP_FONT_SIZE_PX = 64;

/**
 * Default font family for drop cap when none is specified.
 */
const DEFAULT_DROP_CAP_FONT_FAMILY = 'Times New Roman';

/**
 * Extract drop cap run information from a paragraph node.
 *
 * Drop cap paragraphs in DOCX typically contain just the drop cap letter(s)
 * with specific font styling (large font size, vertical position offset, etc.).
 * This function extracts the text and run properties from the first text node.
 *
 * @param para - The paragraph PM node to extract drop cap info from
 * @returns DropCapRun with text and styling, or null if extraction fails
 */
const extractDropCapRunFromParagraph = (para: PMNode, converterContext?: ConverterContext): DropCapRun | null => {
  const content = para.content;
  if (!Array.isArray(content) || content.length === 0) {
    return null;
  }

  const firstRun = content.find((node) => node?.type === 'run');
  if (!firstRun || !Array.isArray(firstRun.content)) {
    return null;
  }
  const textNode = firstRun.content.find(
    (node) => node?.type === 'text' && typeof node.text === 'string' && node.text.length > 0,
  );
  if (!textNode || !textNode.text) {
    return null;
  }

  const text = textNode.text;
  const runProperties = (firstRun.attrs?.runProperties ?? {}) as RunProperties;
  let resolvedRunProperties;
  if (converterContext) {
    resolvedRunProperties = resolveRunProperties(converterContext, runProperties, {}, null, false, false);
  } else {
    resolvedRunProperties = runProperties as RunProperties;
  }

  const runAttrs = computeRunAttrs(
    resolvedRunProperties,
    converterContext,
    DEFAULT_DROP_CAP_FONT_SIZE_PX,
    DEFAULT_DROP_CAP_FONT_FAMILY,
  );

  // Build the drop cap run
  const dropCapRun: DropCapRun = {
    text,
    fontFamily: runAttrs.fontFamily,
    fontSize: runAttrs.fontSize,
    bold: runAttrs.bold,
    italic: runAttrs.italic,
    color: runAttrs.color,
    position: resolvedRunProperties.position != null ? ptToPx(resolvedRunProperties.position / 2) : undefined,
  };

  return dropCapRun;
};

/**
 * Compute paragraph attributes from PM node, resolving styles and handling BiDi text.
 * This is the main function for converting PM paragraph attributes to layout engine format.
 */
export const computeParagraphAttrs = (
  para: PMNode,
  converterContext?: ConverterContext,
): { paragraphAttrs: ParagraphAttrs; resolvedParagraphProperties: ParagraphProperties } => {
  const attrs = para.attrs ?? {};
  const paragraphProperties = (attrs.paragraphProperties ?? {}) as ParagraphProperties;
  let resolvedParagraphProperties;
  if (!converterContext) {
    resolvedParagraphProperties = paragraphProperties;
  } else {
    resolvedParagraphProperties = resolveParagraphProperties(
      converterContext,
      paragraphProperties,
      converterContext.tableInfo,
    );
  }

  const normalizedSpacing = normalizeParagraphSpacing(
    resolvedParagraphProperties.spacing,
    Boolean(resolvedParagraphProperties.numberingProperties),
  );
  const normalizedIndent = normalizeIndentTwipsToPx(resolvedParagraphProperties.indent as ParagraphIndent);
  const normalizedTabStops = normalizeOoxmlTabs(resolvedParagraphProperties.tabStops);
  const normalizedAlignment = normalizeAlignment(resolvedParagraphProperties.justification);
  const normalizedBorders = normalizeParagraphBorders(resolvedParagraphProperties.borders);
  const normalizedShading = normalizeParagraphShading(resolvedParagraphProperties.shading);
  const paragraphDecimalSeparator = DEFAULT_DECIMAL_SEPARATOR;
  const tabIntervalTwips = DEFAULT_TAB_INTERVAL_TWIPS;
  const normalizedFramePr = normalizeFramePr(resolvedParagraphProperties.framePr);
  const floatAlignment = normalizedFramePr?.xAlign;
  const normalizedNumberingProperties = normalizeNumberingProperties(resolvedParagraphProperties.numberingProperties);
  const dropCapDescriptor = normalizeDropCap(resolvedParagraphProperties.framePr, para, converterContext);
  const normalizedListRendering = attrs.listRendering as {
    markerText: string;
    justification: 'left' | 'center' | 'right';
    path: number[];
    numberingType: string;
    suffix: 'tab' | 'space' | 'nothing';
  };

  const paragraphAttrs: ParagraphAttrs = {
    styleId: resolvedParagraphProperties.styleId,
    alignment: normalizedAlignment,
    spacing: normalizedSpacing,
    contextualSpacing: resolvedParagraphProperties.contextualSpacing,
    indent: normalizedIndent,
    dropCapDescriptor: dropCapDescriptor,
    frame: normalizedFramePr,
    numberingProperties: normalizedNumberingProperties,
    borders: normalizedBorders,
    shading: normalizedShading,
    tabs: normalizedTabStops,
    decimalSeparator: paragraphDecimalSeparator,
    tabIntervalTwips,
    keepNext: resolvedParagraphProperties.keepNext,
    keepLines: resolvedParagraphProperties.keepLines,
    floatAlignment: floatAlignment,
    pageBreakBefore: resolvedParagraphProperties.pageBreakBefore,
  };

  if (normalizedNumberingProperties && normalizedListRendering) {
    const markerRunProperties = resolveRunProperties(
      converterContext!,
      resolvedParagraphProperties.runProperties,
      resolvedParagraphProperties,
      converterContext!.tableInfo,
      true,
      Boolean(paragraphProperties.numberingProperties),
    );
    paragraphAttrs.wordLayout = computeWordParagraphLayout({
      paragraph: paragraphAttrs,
      listRenderingAttrs: normalizedListRendering,
      markerRun: computeRunAttrs(markerRunProperties, converterContext),
    });
  }

  return { paragraphAttrs, resolvedParagraphProperties };
};

export const computeRunAttrs = (
  runProps: RunProperties,
  converterContext?: ConverterContext,
  defaultFontSizePx = 12,
  defaultFontFamily = 'Times New Roman',
): ResolvedRunProperties => {
  let fontFamily;
  if (converterContext) {
    fontFamily =
      resolveDocxFontFamily(runProps.fontFamily as Record<string, unknown>, converterContext.docx) || defaultFontFamily;
  } else {
    fontFamily =
      runProps.fontFamily?.ascii || runProps.fontFamily?.hAnsi || runProps.fontFamily?.eastAsia || defaultFontFamily;
  }
  return {
    fontFamily: toCssFontFamily(fontFamily)!,
    fontSize: runProps.fontSize ? ptToPx(runProps.fontSize / 2)! : defaultFontSizePx,
    bold: runProps.bold,
    italic: runProps.italic,
    underline:
      runProps.underline && runProps.underline!['w:val'] && runProps.underline!['w:val'] !== 'none'
        ? {
            style: (runProps.underline!['w:val'] as 'single' | 'double' | 'dotted' | 'dashed' | 'wavy') || 'single',
            color: runProps.underline!['w:color'] || undefined,
          }
        : null,
    strike: runProps.strike,
    color: normalizeColor(runProps.color?.val),
    highlight: runProps.highlight?.['w:val'] || undefined,
    smallCaps: runProps.smallCaps,
    allCaps: runProps?.textTransform === 'uppercase',
    letterSpacing: runProps.letterSpacing ? twipsToPx(runProps.letterSpacing) : undefined,
    lang: runProps.lang?.val || undefined,
    vanish: runProps.vanish,
  };
};
