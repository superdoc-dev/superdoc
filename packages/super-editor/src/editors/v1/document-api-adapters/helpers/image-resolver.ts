import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Editor } from '../../core/Editor.js';
import { DocumentApiAdapterError } from '../errors.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ImagePlacement = 'inline' | 'floating';

export interface ImageCandidate {
  pos: number;
  node: ProseMirrorNode;
  sdImageId: string;
  placement: ImagePlacement;
}

// ---------------------------------------------------------------------------
// Document scan
// ---------------------------------------------------------------------------

/**
 * Walks the document tree and collects every image node that has a stable
 * `sdImageId` attribute. Images without an `sdImageId` are skipped — they
 * cannot be targeted by the Document API.
 */
export function collectImages(doc: ProseMirrorNode): ImageCandidate[] {
  const results: ImageCandidate[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== 'image') return;

    const sdImageId = node.attrs.sdImageId;
    if (typeof sdImageId !== 'string' || sdImageId.length === 0) return;

    results.push({
      pos,
      node,
      sdImageId,
      placement: node.attrs.isAnchor ? 'floating' : 'inline',
    });
  });

  return results;
}

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/**
 * Finds a single image by `sdImageId`.
 *
 * @throws {DocumentApiAdapterError} `TARGET_NOT_FOUND` when no image has the given ID.
 * @throws {DocumentApiAdapterError} `AMBIGUOUS_TARGET` when multiple images share the same ID.
 */
export function findImageById(editor: Editor, sdImageId: string): ImageCandidate {
  const candidates = collectImages(editor.state.doc);
  const matches = candidates.filter((c) => c.sdImageId === sdImageId);

  if (matches.length === 0) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', `Image with sdImageId "${sdImageId}" was not found.`, {
      sdImageId,
    });
  }

  if (matches.length > 1) {
    throw new DocumentApiAdapterError(
      'AMBIGUOUS_TARGET',
      `Multiple images share sdImageId "${sdImageId}" (${matches.length} found).`,
      { sdImageId, count: matches.length },
    );
  }

  return matches[0];
}

/**
 * Requires that the targeted image has floating placement.
 *
 * @throws {DocumentApiAdapterError} `INVALID_TARGET` when the image is inline.
 */
export function requireFloatingPlacement(image: ImageCandidate, operation: string): void {
  if (image.placement === 'floating') return;
  throw new DocumentApiAdapterError(
    'INVALID_TARGET',
    `${operation} requires a floating image, but image "${image.sdImageId}" has inline placement.`,
    { sdImageId: image.sdImageId, placement: image.placement },
  );
}
