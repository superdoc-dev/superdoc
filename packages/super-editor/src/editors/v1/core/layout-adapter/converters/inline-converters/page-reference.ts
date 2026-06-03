import type { FieldResultFormat, NumericPictureFormat, PageNumberFieldFormat, TextRun } from '@superdoc/contracts';
import { type InlineConverterParams } from './common';
import { getNodeInstruction } from '../../sdt/index.js';
import type { PMNode, PMMark } from '../../types.js';
import { textNodeToRun } from './text-run.js';
import { buildFlowRunLink } from '../../marks/links.js';
import { type RunProperties, resolveRunProperties } from '@superdoc/style-engine/ooxml';
import { parsePageRefInstruction } from '../../../super-converter/field-references/shared/pageref-instruction.js';

export function pageReferenceNodeToBlock(params: InlineConverterParams): TextRun | void {
  const {
    node,
    inheritedMarks,
    visitNode,
    sdtMetadata,
    positions,
    converterContext,
    paragraphProperties,
    inlineRunProperties: parentInlineRunProperties,
  } = params;
  // Create pageReference token run for dynamic resolution
  const instruction = getNodeInstruction(node) || '';
  const nodeAttrs =
    typeof node.attrs === 'object' && node.attrs !== null ? (node.attrs as Record<string, unknown>) : {};
  const refMarks = Array.isArray(nodeAttrs.marksAsAttrs) ? (nodeAttrs.marksAsAttrs as PMMark[]) : [];
  const mergedMarks = [...refMarks, ...(inheritedMarks ?? [])];

  const parsed = parsePageRefInstruction(instruction);
  const bookmarkId = readStringAttr(nodeAttrs.bookmarkId) || parsed.bookmarkId;
  const hasHyperlinkSwitch = readBooleanAttr(nodeAttrs.hasHyperlinkSwitch) || parsed.hasHyperlinkSwitch;
  const hasRelativePositionSwitch =
    readBooleanAttr(nodeAttrs.hasRelativePositionSwitch) || parsed.hasRelativePositionSwitch;
  const pageNumberFieldFormat =
    readObjectAttr<PageNumberFieldFormat>(nodeAttrs.pageNumberFieldFormat) ??
    (parsed.pageNumberFieldFormat as PageNumberFieldFormat | undefined);
  const numericPictureFormat =
    readObjectAttr<NumericPictureFormat>(nodeAttrs.numericPictureFormat) ?? parsed.numericPictureFormat;
  const attrFieldResultFormat = readStringAttr(nodeAttrs.fieldResultFormat);
  const fieldResultFormat: FieldResultFormat | undefined =
    attrFieldResultFormat === 'charformat' || attrFieldResultFormat === 'mergeformat'
      ? attrFieldResultFormat
      : parsed.fieldResultFormat;

  // If we have a bookmark ID, create a token run for dynamic resolution
  let runProperties: RunProperties = {};
  if (bookmarkId) {
    const fieldRunProperties = readObjectAttr<RunProperties>(nodeAttrs.fieldRunProperties);
    // Check if there's materialized content (pre-baked page number from Word)
    let fallbackText = '??'; // Default placeholder if resolution fails
    if (Array.isArray(node.content) && node.content.length > 0) {
      // Extract text from children as fallback
      const extractText = (n: PMNode): string => {
        if (n.type === 'run') {
          runProperties = n.attrs?.runProperties ?? {};
        }
        if (n.type === 'text' && n.text) return n.text;
        if (Array.isArray(n.content)) {
          return n.content.map(extractText).join('');
        }
        return '';
      };
      fallbackText = node.content.map(extractText).join('').trim() || '??';
    }
    if (fieldResultFormat === 'charformat' && fieldRunProperties) {
      runProperties = fieldRunProperties;
    } else if (Object.keys(runProperties).length === 0 && fieldRunProperties) {
      runProperties = fieldRunProperties;
    }

    // Create token run with pageReference metadata
    // Get PM positions from the parent pageReference node (not the synthetic text node)
    const pageRefPos = positions.get(node);

    const resolvedRunProperties = resolveRunProperties(
      converterContext,
      runProperties,
      paragraphProperties,
      null,
      false,
      false,
    );
    const tokenRun = textNodeToRun({
      ...params,
      node: { type: 'text', text: fallbackText } as PMNode,
      inheritedMarks: mergedMarks,
      runProperties: resolvedRunProperties,
      // SD-2781: pass the raw inline runProperties scanned from the <run> child
      // above (not the cascade-resolved version) so the token run preserves
      // bidi/script only when the source explicitly carried those signals.
      inlineRunProperties: runProperties,
    });

    // Copy PM positions from parent pageReference node
    if (pageRefPos) {
      tokenRun.pmStart = pageRefPos.start;
      tokenRun.pmEnd = pageRefPos.end;
    }
    tokenRun.token = 'pageReference';
    tokenRun.pageRefMetadata = {
      bookmarkId,
      instruction,
      ...(hasRelativePositionSwitch ? { relativePosition: true } : {}),
      ...(pageNumberFieldFormat ? { pageNumberFieldFormat } : {}),
      ...(numericPictureFormat ? { numericPictureFormat } : {}),
      ...(fieldResultFormat ? { fieldResultFormat } : {}),
    };

    // \h switch - case-insensitive per ECMA-376 §17.16.1.
    if (hasHyperlinkSwitch) {
      const synthesized = buildFlowRunLink({ anchor: bookmarkId });
      if (synthesized) {
        tokenRun.link = tokenRun.link ? { ...tokenRun.link, ...synthesized, anchor: bookmarkId } : synthesized;
      }
    }

    if (sdtMetadata) {
      tokenRun.sdt = sdtMetadata;
    }
    return tokenRun;
  } else if (Array.isArray(node.content)) {
    // No bookmark found, fall back to treating as transparent container.
    // SD-2781: forward the parent's inlineRunProperties (this node didn't introduce
    // a new run boundary), and pass the locally-collected runProperties as the
    // resolved/active properties for children.
    node.content.forEach((child) =>
      visitNode(child, mergedMarks, sdtMetadata, runProperties, false, parentInlineRunProperties),
    );
  }
}

function readStringAttr(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readBooleanAttr(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function readObjectAttr<T extends object>(value: unknown): T | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as T) : undefined;
}
