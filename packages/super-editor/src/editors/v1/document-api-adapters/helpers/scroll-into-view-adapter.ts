import type { ScrollIntoViewInput, ScrollIntoViewOutput } from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';
import { resolveTextTarget } from './adapter-utils.js';
import { resolveTrackedChange } from './tracked-change-resolver.js';
import { listCommentAnchors } from './comment-target-resolver.js';

/**
 * Implementation of `editor.doc.ranges.scrollIntoView` — resolves the
 * target to PM positions, then delegates to the presentation editor's
 * `scrollToPositionAsync`, which handles paginated / virtualized layouts
 * by mounting the target page if it isn't yet in the DOM.
 */
export async function scrollRangeIntoView(editor: Editor, input: ScrollIntoViewInput): Promise<ScrollIntoViewOutput> {
  const pmPosition = resolveTargetToPmPosition(editor, input.target);
  if (pmPosition == null) return { success: false };

  const presentation = editor.presentationEditor;
  if (!presentation || typeof presentation.scrollToPositionAsync !== 'function') {
    return { success: false };
  }

  const ok = await presentation.scrollToPositionAsync(pmPosition, {
    block: input.block ?? 'center',
    behavior: input.behavior ?? 'smooth',
  });

  return { success: ok };
}

function resolveTargetToPmPosition(editor: Editor, target: ScrollIntoViewInput['target']): number | null {
  // EntityAddress — comment or tracked change by id
  if ('kind' in target && target.kind === 'entity') {
    if (target.entityType === 'trackedChange') {
      const tc = resolveTrackedChange(editor, target.entityId);
      return tc?.from ?? null;
    }
    if (target.entityType === 'comment') {
      try {
        const anchors = listCommentAnchors(editor);
        const anchor = anchors.find((a) => a.commentId === target.entityId || a.importedId === target.entityId);
        return anchor?.pos ?? null;
      } catch {
        return null;
      }
    }
    return null;
  }

  // TextTarget (multi-segment) — resolve the first segment
  // TextAddress (single-block) — resolve directly
  const firstSegment = 'segments' in target ? target.segments[0] : { blockId: target.blockId, range: target.range };
  if (!firstSegment) return null;
  const resolved = resolveTextTarget(editor, {
    kind: 'text',
    blockId: firstSegment.blockId,
    range: firstSegment.range,
  });
  return resolved?.from ?? null;
}
