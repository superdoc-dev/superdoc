import type { Schema, Node as ProseMirrorNode } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import type { PageNumberFieldFormat } from '@superdoc/contracts';
import type { ParagraphProperties } from '@superdoc/style-engine/ooxml';
import type { ConverterContext } from '../../core/layout-adapter/converter-context.js';
import { resolveParagraphHeadingLevel } from '../../core/layout-adapter/attributes/paragraph.js';
import { SequenceFieldEvaluator } from '../../core/super-converter/field-references/shared/seq-evaluator.js';
import {
  normalizeSeqIdentifier,
  parseSeqInstruction,
  sequenceFieldAttrsFromParsed,
} from '../../core/super-converter/field-references/shared/seq-instruction.js';

export type SequenceFieldUpdateScope =
  | { kind: 'all' }
  | { kind: 'range'; from: number; to: number }
  | { kind: 'identifier'; identifier: string };

type SequenceFieldAttrs = Record<string, unknown> & {
  instruction: string;
  identifier: string;
  fieldArgument: string;
  sequenceMode: 'next' | 'current';
  hideResult: boolean;
  restartNumber: number | null;
  restartLevel: number | null;
  format: string;
  hasGeneralFormat: boolean;
  pageNumberFieldFormat: PageNumberFieldFormat | null;
  numericPictureFormat: { picture: string } | null;
  resolvedNumber?: string;
  resolvedNumberIsCurrent?: boolean;
};

export function updateSequenceFieldsInTransaction(args: {
  tr: Transaction;
  schema: Schema;
  scope?: SequenceFieldUpdateScope;
  converterContext?: ConverterContext;
}): { changed: boolean; updated: number } {
  const { tr, scope = { kind: 'all' }, converterContext } = args;
  const sequenceFieldType = args.schema.nodes.sequenceField;
  if (!sequenceFieldType) return { changed: false, updated: 0 };

  const evaluator = new SequenceFieldEvaluator();
  let changed = false;
  let updated = 0;

  // Body-only by design: tr.doc is the main story document. Header/footer and
  // note editors render correctly via layout, but are not rewritten by this API path.
  tr.doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph') {
      evaluator.enterParagraph({
        paragraphHeadingLevel: resolveNodeHeadingLevel(node, converterContext),
      });
      return true;
    }

    if (node.type !== sequenceFieldType) return true;

    const nextAttrs = buildEvaluatedSequenceAttrs(node);
    const evaluation = evaluator.evaluateField({
      identifier: nextAttrs.identifier,
      instruction: nextAttrs.instruction,
      fieldArgument: nextAttrs.fieldArgument,
      sequenceMode: nextAttrs.sequenceMode,
      hideResult: nextAttrs.hideResult,
      restartNumber: nextAttrs.restartNumber,
      restartLevel: nextAttrs.restartLevel,
      format: nextAttrs.format,
      hasGeneralFormat: nextAttrs.hasGeneralFormat,
      pageNumberFieldFormat: nextAttrs.pageNumberFieldFormat,
      numericPictureFormat: nextAttrs.numericPictureFormat,
      cachedText: typeof node.attrs.resolvedNumber === 'string' ? node.attrs.resolvedNumber : '',
    });

    if (!shouldWriteSequenceField(node, pos, scope, nextAttrs.identifier)) return true;

    nextAttrs.resolvedNumber = evaluation.text;
    nextAttrs.resolvedNumberIsCurrent = true;

    if (!attrsEqual(node.attrs, nextAttrs)) {
      tr.setNodeMarkup(resolveCurrentTransactionPos(tr, pos, node), undefined, nextAttrs);
      changed = true;
    }
    updated += 1;
    return true;
  });

  return { changed, updated };
}

export function getSequenceFieldUpdaterConverterContext(editor: unknown): ConverterContext | undefined {
  const converter = (editor as { converter?: Partial<ConverterContext> } | null | undefined)?.converter;
  if (!converter?.translatedLinkedStyles) return undefined;

  return {
    translatedLinkedStyles: converter.translatedLinkedStyles,
    translatedNumbering: converter.translatedNumbering ?? {},
    docx: converter.docx,
  } as ConverterContext;
}

function resolveNodeHeadingLevel(node: ProseMirrorNode, converterContext?: ConverterContext): number | undefined {
  const paragraphProperties = node.attrs?.paragraphProperties;
  if (converterContext) {
    return resolveParagraphHeadingLevel(
      isRecord(paragraphProperties) ? (paragraphProperties as ParagraphProperties) : undefined,
      converterContext,
    );
  }

  // Without style data, skip SEQ \s heading resets rather than applying a
  // partial heuristic that can diverge from the rendered layout.
  return undefined;
}

function buildEvaluatedSequenceAttrs(node: ProseMirrorNode): SequenceFieldAttrs {
  const instruction = typeof node.attrs.instruction === 'string' ? node.attrs.instruction : '';
  const parsed = parseSeqInstruction(instruction);
  const parsedAttrs = sequenceFieldAttrsFromParsed(parsed);

  return {
    ...node.attrs,
    instruction,
    ...parsedAttrs,
    identifier: parsedAttrs.identifier || readStringAttr(node, 'identifier'),
  };
}

function shouldWriteSequenceField(
  node: ProseMirrorNode,
  pos: number,
  scope: SequenceFieldUpdateScope,
  identifier: string,
): boolean {
  if (scope.kind === 'all') return true;
  if (scope.kind === 'range') {
    const end = pos + node.nodeSize;
    return pos < scope.to && end > scope.from;
  }

  return normalizeSeqIdentifier(identifier) === normalizeSeqIdentifier(scope.identifier);
}

function readStringAttr(node: ProseMirrorNode, key: string): string {
  const value = node.attrs?.[key];
  return typeof value === 'string' ? value : '';
}

function attrsEqual(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (!valuesEqual(left[key], right[key])) return false;
  }
  return true;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!isRecord(left) || !isRecord(right)) return false;

  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (!valuesEqual(left[key], right[key])) return false;
  }
  return true;
}

function resolveCurrentTransactionPos(tr: Transaction, pos: number, node: ProseMirrorNode): number {
  // This helper walks tr.doc, so positions are usually already current. When a
  // caller provides a transaction with prior steps (for example fields.insert),
  // mapping those current positions again can point inside text nodes.
  const currentNode = tr.doc.nodeAt(pos);
  if (currentNode?.type === node.type) return pos;
  return tr.mapping.map(pos);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
