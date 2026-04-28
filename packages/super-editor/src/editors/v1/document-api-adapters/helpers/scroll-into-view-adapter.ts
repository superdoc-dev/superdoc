import type { ScrollIntoViewInput, ScrollIntoViewOutput } from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';
import { resolveTextTarget } from './adapter-utils.js';

/**
 * Implementation of `editor.doc.ranges.scrollIntoView`.
 *
 * Two paths:
 * - EntityAddress (comment / tracked change by id) → delegates to
 *   `presentation.navigateTo(target)`, which handles paginated layouts,
 *   virtualized page mounting, AND story activation for entities in
 *   header/footer/footnote/endnote stories. `block` and `behavior`
 *   options are not applied here — `navigateTo` picks sensible viewport
 *   alignment per entity type.
 * - TextAddress / TextTarget → resolves the first segment to a PM
 *   position and calls `scrollToPositionAsync` with caller-provided
 *   `block` / `behavior` options. This path is body-only today; text
 *   targets that reference non-body stories are out of scope for this
 *   operation.
 *
 * Both paths honor the `{ success: boolean }` contract:
 * thrown errors from resolvers (e.g. ambiguous block IDs) and rejected
 * scroll promises are caught and converted into `{ success: false }`
 * rather than propagating to the caller.
 *
 * Known limitation: for a tracked change that lives in a non-body story
 * (header, footer, footnote, endnote) on a page that is not currently
 * mounted in the DOM (virtualized), `presentation.navigateTo` returns
 * `false` — the non-body navigation path activates the story surface via
 * rendered DOM candidates, and offscreen pages have none. This returns
 * `{ success: false }`. A fix needs body-side reference resolution so the
 * containing page can be pre-mounted; tracked as a follow-up.
 */
export async function scrollRangeIntoView(editor: Editor, input: ScrollIntoViewInput): Promise<ScrollIntoViewOutput> {
  const presentation = editor.presentationEditor;
  if (!presentation) {
    return { success: false };
  }

  // EntityAddress path — hand off to the presentation editor so it can
  // activate the right story (footnotes, header/footer) before scrolling.
  if ('kind' in input.target && input.target.kind === 'entity') {
    if (typeof presentation.navigateTo !== 'function') {
      return { success: false };
    }
    try {
      const ok = await presentation.navigateTo(input.target);
      return { success: ok };
    } catch {
      return { success: false };
    }
  }

  // TextAddress / TextTarget path — resolve to a PM position in the body
  // and scroll directly. TextTarget resolves the FIRST segment, so a
  // multi-block selection scrolls to where the selection begins.
  if (typeof presentation.scrollToPositionAsync !== 'function') {
    return { success: false };
  }

  try {
    const firstSegment =
      'segments' in input.target
        ? input.target.segments[0]
        : { blockId: input.target.blockId, range: input.target.range };
    if (!firstSegment) return { success: false };

    const resolved = resolveTextTarget(editor, {
      kind: 'text',
      blockId: firstSegment.blockId,
      range: firstSegment.range,
    });
    if (!resolved) return { success: false };

    const ok = await presentation.scrollToPositionAsync(resolved.from, {
      block: input.block ?? 'center',
      behavior: input.behavior ?? 'smooth',
    });
    return { success: ok };
  } catch {
    // `resolveTextTarget` throws `DocumentApiAdapterError` for ambiguous
    // block IDs; `scrollToPositionAsync` can reject on layout or mount
    // failures. Convert either into `{ success: false }` so the caller
    // sees a single predictable result type.
    return { success: false };
  }
}
