/**
 * Caption plan-engine wrappers — bridge captions.* operations.
 */

import type { Editor } from '../../core/Editor.js';
import type {
  CaptionListInput,
  CaptionGetInput,
  CaptionInsertInput,
  CaptionUpdateInput,
  CaptionRemoveInput,
  CaptionConfigureInput,
  CaptionInfo,
  CaptionMutationResult,
  CaptionConfigResult,
  CaptionAddress,
  MutationOptions,
  ReceiptFailureCode,
} from '@superdoc/document-api';
import { buildDiscoveryResult } from '@superdoc/document-api';
import {
  findAllCaptions,
  resolveCaptionTarget,
  extractCaptionInfo,
  buildCaptionDiscoveryItem,
} from '../helpers/caption-resolver.js';
import { paginate, resolveBlockCreatePosition } from '../helpers/adapter-utils.js';
import { getRevision } from './revision-tracker.js';
import { executeDomainCommand } from './plan-wrappers.js';
import { rejectTrackedMode } from '../helpers/mutation-helpers.js';
import { clearIndexCache } from '../helpers/index-cache.js';
import { DocumentApiAdapterError } from '../errors.js';

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

function captionSuccess(address: CaptionAddress): CaptionMutationResult {
  return { success: true, caption: address };
}

function captionFailure(code: ReceiptFailureCode, message: string): CaptionMutationResult {
  return { success: false, failure: { code, message } };
}

function configSuccess(): CaptionConfigResult {
  return { success: true };
}

function configFailure(code: ReceiptFailureCode, message: string): CaptionConfigResult {
  return { success: false, failure: { code, message } };
}

function receiptApplied(receipt: ReturnType<typeof executeDomainCommand>): boolean {
  return receipt.steps[0]?.effect === 'changed';
}

const CAPTION_PARAGRAPH_STYLE_ID = 'Caption';

function buildCaptionParagraphAttrs(nodeId: string): {
  sdBlockId: string;
  paragraphProperties: { styleId: string };
} {
  return {
    sdBlockId: nodeId,
    paragraphProperties: { styleId: CAPTION_PARAGRAPH_STYLE_ID },
  };
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

export function captionsListWrapper(editor: Editor, query?: CaptionListInput) {
  const doc = editor.state.doc;
  const revision = getRevision(editor);
  const captions = findAllCaptions(doc);

  const allItems = captions.map((c) => buildCaptionDiscoveryItem(c, revision));
  const { total, items: paged } = paginate(allItems, query?.offset, query?.limit);
  const effectiveLimit = query?.limit ?? total;

  return buildDiscoveryResult({
    evaluatedRevision: revision,
    total,
    items: paged,
    page: { limit: effectiveLimit, offset: query?.offset ?? 0, returned: paged.length },
  });
}

export function captionsGetWrapper(editor: Editor, input: CaptionGetInput): CaptionInfo {
  const resolved = resolveCaptionTarget(editor.state.doc, input.target);
  return extractCaptionInfo(resolved);
}

// ---------------------------------------------------------------------------
// Mutation operations
// ---------------------------------------------------------------------------

export function captionsInsertWrapper(
  editor: Editor,
  input: CaptionInsertInput,
  options?: MutationOptions,
): CaptionMutationResult {
  rejectTrackedMode('captions.insert', options);

  const nodeId = `caption-${Date.now()}`;
  const address: CaptionAddress = { kind: 'block', nodeType: 'paragraph', nodeId };

  if (options?.dryRun) return captionSuccess(address);

  // Resolve the position relative to the target block
  const at =
    input.position === 'above'
      ? { kind: 'before' as const, target: input.adjacentTo }
      : { kind: 'after' as const, target: input.adjacentTo };
  const pos = resolveBlockCreatePosition(editor, at);

  // Caption insertion creates a paragraph with "Caption" style + SEQ field + text.
  const receipt = executeDomainCommand(
    editor,
    () => {
      const label = input.label;
      const children: import('prosemirror-model').Node[] = [];
      const schema = editor.schema;

      // Add label text
      children.push(schema.text(`${label} `));

      // Add SEQ field if the node type exists
      if (schema.nodes.sequenceField) {
        children.push(
          schema.nodes.sequenceField.create({
            instruction: `SEQ ${label} \\* ARABIC`,
            identifier: label,
            format: 'ARABIC',
            resolvedNumber: '',
            sdBlockId: `seq-${Date.now()}`,
          }),
        );
      }

      // Add separator and user text
      if (input.text) {
        children.push(schema.text(`: ${input.text}`));
      }

      const captionParagraph = schema.nodes.paragraph.create(buildCaptionParagraphAttrs(nodeId), children);

      const { tr } = editor.state;
      tr.insert(pos, captionParagraph);
      editor.dispatch(tr);
      clearIndexCache(editor);
      return true;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (!receiptApplied(receipt)) return captionFailure('NO_OP', 'Insert produced no change.');
  return captionSuccess(address);
}

export function captionsUpdateWrapper(
  editor: Editor,
  input: CaptionUpdateInput,
  options?: MutationOptions,
): CaptionMutationResult {
  rejectTrackedMode('captions.update', options);

  const resolved = resolveCaptionTarget(editor.state.doc, input.target);
  const address: CaptionAddress = { kind: 'block', nodeType: 'paragraph', nodeId: resolved.nodeId };

  if (options?.dryRun) return captionSuccess(address);

  if (input.patch.text === undefined) {
    return captionFailure('NO_OP', 'No patch fields provided.');
  }

  const receipt = executeDomainCommand(
    editor,
    () => {
      const { tr } = editor.state;
      const captionNode = tr.doc.nodeAt(resolved.pos);
      if (!captionNode) return false;

      // Find the position after the last non-text child (label + SEQ field)
      let trailingTextStart = resolved.pos + 1;
      captionNode.forEach((child, offset) => {
        if (child.type.name !== 'text') {
          trailingTextStart = resolved.pos + 1 + offset + child.nodeSize;
        }
      });

      const contentEnd = resolved.pos + captionNode.nodeSize - 1;
      const newText = input.patch.text ? `: ${input.patch.text}` : '';

      if (newText) {
        tr.replaceWith(trailingTextStart, contentEnd, editor.schema.text(newText));
      } else {
        tr.delete(trailingTextStart, contentEnd);
      }

      editor.dispatch(tr);
      clearIndexCache(editor);
      return true;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (!receiptApplied(receipt)) return captionFailure('NO_OP', 'Update produced no change.');
  return captionSuccess(address);
}

export function captionsRemoveWrapper(
  editor: Editor,
  input: CaptionRemoveInput,
  options?: MutationOptions,
): CaptionMutationResult {
  rejectTrackedMode('captions.remove', options);

  const resolved = resolveCaptionTarget(editor.state.doc, input.target);
  const address: CaptionAddress = { kind: 'block', nodeType: 'paragraph', nodeId: resolved.nodeId };

  if (options?.dryRun) return captionSuccess(address);

  const receipt = executeDomainCommand(
    editor,
    () => {
      const { tr } = editor.state;
      tr.delete(resolved.pos, resolved.pos + resolved.node.nodeSize);
      editor.dispatch(tr);
      clearIndexCache(editor);
      return true;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (!receiptApplied(receipt)) return captionFailure('NO_OP', 'Remove produced no change.');
  return captionSuccess(address);
}

export function captionsConfigureWrapper(
  editor: Editor,
  input: CaptionConfigureInput,
  options?: MutationOptions,
): CaptionConfigResult {
  rejectTrackedMode('captions.configure', options);

  // Update all SEQ fields matching the label with the new format settings.
  // This is a PM mutation — we walk the document and update sequenceField attrs.
  const receipt = executeDomainCommand(
    editor,
    () => {
      const { tr } = editor.state;
      let changed = false;

      tr.doc.descendants((node, pos) => {
        if (node.type.name !== 'sequenceField') return true;
        if ((node.attrs.identifier as string) !== input.label) return true;

        const format = CAPTION_FORMAT_TO_OOXML[input.format ?? 'decimal'] ?? 'ARABIC';
        const newInstruction = `SEQ ${input.label} \\* ${format}`;
        if (node.attrs.instruction === newInstruction && node.attrs.format === format) return true;

        tr.setNodeMarkup(tr.mapping.map(pos), undefined, {
          ...node.attrs,
          instruction: newInstruction,
          format,
        });
        changed = true;
        return true;
      });

      if (!changed) return false;
      editor.dispatch(tr);
      clearIndexCache(editor);
      return true;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (!receiptApplied(receipt)) return configFailure('NO_OP', 'Configure produced no change.');
  return configSuccess();
}

const CAPTION_FORMAT_TO_OOXML: Record<string, string> = {
  decimal: 'ARABIC',
  lowerRoman: 'roman',
  upperRoman: 'ROMAN',
  lowerLetter: 'alphabetic',
  upperLetter: 'ALPHABETIC',
};
