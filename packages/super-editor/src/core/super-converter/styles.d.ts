import type { ParagraphProperties, ParagraphSpacing, RunProperties } from '@superdoc/style-engine/ooxml';

export { combineRunProperties, resolveParagraphProperties, resolveRunProperties } from '@superdoc/style-engine/ooxml';

export interface ConverterMarkLike {
  attrs: Record<string, unknown>;
  type: string | { name?: string };
}

export interface ConverterMarkDefinition {
  attrs: Record<string, unknown>;
  type: string;
}

export function encodeMarksFromRPr(
  runProperties: RunProperties,
  docx: Record<string, unknown> | null | undefined,
): ConverterMarkDefinition[];

export function encodeCSSFromPPr(
  paragraphProperties: ParagraphProperties | null | undefined,
  hasPreviousParagraph?: boolean,
  nextParagraphProps?: ParagraphProperties | null,
): Record<string, string>;

export function encodeCSSFromRPr(
  runProperties: RunProperties | null | undefined,
  docx: Record<string, unknown> | null | undefined,
): Record<string, string>;

export function decodeRPrFromMarks(marks: ConverterMarkLike[] | null | undefined): RunProperties;

export function getSpacingStyle(spacing: ParagraphSpacing, isListItem?: boolean): Record<string, string>;
