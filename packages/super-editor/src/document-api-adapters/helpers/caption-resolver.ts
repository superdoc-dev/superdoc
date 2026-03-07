/**
 * Caption resolver — identifies caption paragraphs by the presence of
 * a "Caption" style and a SEQ field (sequenceField node).
 *
 * Captions are NOT a distinct node type — they are paragraphs with a
 * "Caption" style containing label text + SEQ field + user text.
 */

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Editor } from '../../core/Editor.js';
import type { CaptionAddress, CaptionDomain, CaptionInfo, DiscoveryItem } from '@superdoc/document-api';
import { buildDiscoveryItem, buildResolvedHandle } from '@superdoc/document-api';
import { DocumentApiAdapterError } from '../errors.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResolvedCaption {
  node: ProseMirrorNode;
  pos: number;
  nodeId: string;
  label: string;
  number: string;
  text: string;
  instruction: string;
}

// ---------------------------------------------------------------------------
// Caption identification
// ---------------------------------------------------------------------------

const CAPTION_STYLE_NAMES = new Set(['Caption', 'caption']);

function hasCaptionStyle(node: ProseMirrorNode): boolean {
  const paragraphProperties =
    (node.attrs?.paragraphProperties as { styleName?: string; styleId?: string } | undefined) ?? {};
  const styleCandidates = [
    node.attrs?.styleName,
    node.attrs?.styleId,
    paragraphProperties.styleName,
    paragraphProperties.styleId,
  ];

  return styleCandidates.some((candidate) => typeof candidate === 'string' && CAPTION_STYLE_NAMES.has(candidate));
}

function isCaptionParagraph(node: ProseMirrorNode): boolean {
  if (node.type.name !== 'paragraph') return false;
  if (hasCaptionStyle(node)) return true;

  // Fallback for schemas/configurations that drop style attrs:
  // treat paragraphs containing a SEQ field as captions.
  const seqField = findSeqField(node);
  if (!seqField) return false;
  const instruction = (seqField.attrs?.instruction as string) ?? '';
  return instruction.trim().startsWith('SEQ ');
}

function findSeqField(node: ProseMirrorNode): ProseMirrorNode | null {
  let seqNode: ProseMirrorNode | null = null;
  node.descendants((child) => {
    if (child.type.name === 'sequenceField' && !seqNode) {
      seqNode = child;
      return false;
    }
    return true;
  });
  return seqNode;
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

export function findAllCaptions(doc: ProseMirrorNode): ResolvedCaption[] {
  const results: ResolvedCaption[] = [];

  doc.descendants((node, pos) => {
    if (!isCaptionParagraph(node)) return true;

    const seqField = findSeqField(node);
    const nodeId = (node.attrs?.sdBlockId as string) ?? `caption-${pos}`;
    const label = seqField ? ((seqField.attrs?.identifier as string) ?? '') : '';
    const number = seqField ? ((seqField.attrs?.resolvedNumber as string) ?? '') : '';
    const instruction = seqField ? ((seqField.attrs?.instruction as string) ?? '') : '';

    // Extract user text (everything after the SEQ field)
    let text = '';
    try {
      text = node.textContent ?? '';
    } catch {
      text = '';
    }

    results.push({ node, pos, nodeId, label, number, text, instruction });
    return false; // don't descend into caption paragraphs
  });

  return results;
}

export function resolveCaptionTarget(doc: ProseMirrorNode, target: CaptionAddress): ResolvedCaption {
  const all = findAllCaptions(doc);
  const found = all.find((c) => c.nodeId === target.nodeId);
  if (!found) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', `Caption with nodeId "${target.nodeId}" not found.`);
  }
  return found;
}

// ---------------------------------------------------------------------------
// Info extraction
// ---------------------------------------------------------------------------

export function extractCaptionInfo(resolved: ResolvedCaption): CaptionInfo {
  return {
    address: { kind: 'block', nodeType: 'paragraph', nodeId: resolved.nodeId },
    label: resolved.label,
    number: parseInt(resolved.number, 10) || 0,
    text: resolved.text,
    instruction: resolved.instruction,
  };
}

// ---------------------------------------------------------------------------
// Discovery item builder
// ---------------------------------------------------------------------------

export function buildCaptionDiscoveryItem(
  resolved: ResolvedCaption,
  evaluatedRevision: string,
): DiscoveryItem<CaptionDomain> {
  const address: CaptionAddress = { kind: 'block', nodeType: 'paragraph', nodeId: resolved.nodeId };
  const domain: CaptionDomain = {
    address,
    label: resolved.label,
    number: parseInt(resolved.number, 10) || 0,
    text: resolved.text,
    instruction: resolved.instruction,
  };

  const handle = buildResolvedHandle(resolved.nodeId, 'stable', 'node');
  const id = `caption:${resolved.nodeId}:${evaluatedRevision}`;
  return buildDiscoveryItem(id, handle, domain);
}
