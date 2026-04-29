/**
 * Viewport-scroll helper for `superdoc/ui`. Drives
 * `presentation.navigateTo()` for entity targets (comment /
 * tracked-change ids — story-aware) and
 * `presentation.scrollToPositionAsync()` for text targets (body-only
 * today). Used by `ui.viewport.scrollIntoView`, `ui.comments.scrollTo`,
 * and `ui.review.scrollTo`.
 */

import type { ScrollIntoViewInput, ScrollIntoViewOutput } from '@superdoc/document-api';
import type { Editor } from '../editors/v1/core/Editor.js';
import { resolveTextTarget } from '../editors/v1/document-api-adapters/helpers/adapter-utils.js';

/**
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
 *   targets that reference non-body stories are out of scope.
 *
 * Both paths honor the `{ success: boolean }` contract: thrown errors
 * from resolvers (e.g. ambiguous block IDs) and rejected scroll
 * promises are caught and converted into `{ success: false }` rather
 * than propagating.
 *
 * Known limitation: for a tracked change that lives in a non-body
 * story (header, footer, footnote, endnote) on a page that is not
 * currently mounted in the DOM (virtualized),
 * `presentation.navigateTo` returns `false` — the non-body navigation
 * path activates the story surface via rendered DOM candidates, and
 * offscreen pages have none. Returns `{ success: false }` in that case.
 */
export async function scrollRangeIntoView(editor: Editor, input: ScrollIntoViewInput): Promise<ScrollIntoViewOutput> {
  const presentation = editor.presentationEditor;
  if (!presentation) {
    return { success: false };
  }

  // Narrow to the entity branch via discriminated-union check on
  // `kind`. `TextAddress`, `TextTarget`, and `EntityAddress` all have
  // a `kind` field, so the equality check narrows `target` directly
  // without a cast — `target` is `EntityAddress` inside the block and
  // `TextAddress | TextTarget` after the early return.
  const target = input.target;
  if (target.kind === 'entity') {
    if (typeof presentation.navigateTo !== 'function') {
      return { success: false };
    }
    try {
      const ok = await presentation.navigateTo(target);
      return { success: Boolean(ok) };
    } catch {
      return { success: false };
    }
  }

  if (typeof presentation.scrollToPositionAsync !== 'function') {
    return { success: false };
  }

  try {
    // After the entity early-return, `target` narrows to
    // `TextAddress | TextTarget`. Discriminate by checking for a
    // non-empty `segments` array — a bare `'segments' in target`
    // type-guard would mis-classify a hybrid payload that happens to
    // carry both `segments` (empty) and `blockId`/`range` because
    // `'segments' in {}` answers shape, not content.
    const isMultiSegmentTarget =
      Array.isArray((target as { segments?: unknown }).segments) &&
      ((target as { segments: unknown[] }).segments.length ?? 0) > 0;
    const firstSegment = isMultiSegmentTarget
      ? (target as { segments: Array<{ blockId: string; range: { start: number; end: number } }> }).segments[0]
      : {
          blockId: (target as { blockId: string }).blockId,
          range: (target as { range: { start: number; end: number } }).range,
        };
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
    return { success: Boolean(ok) };
  } catch {
    return { success: false };
  }
}
