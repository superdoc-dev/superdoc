import { describe, expect, it } from 'vitest';
import {
  isPersistentReviewSidebarItem,
  normalizeFloatingAnchorTop,
  shouldMountFloatingCommentDialog,
} from './floating-comment-positioning.js';

describe('floating comment positioning', () => {
  it('treats tracked-change review cards as persistent sidebar items', () => {
    expect(isPersistentReviewSidebarItem({ trackedChange: true })).toBe(true);
    expect(isPersistentReviewSidebarItem({ trackedChange: false })).toBe(false);
    expect(isPersistentReviewSidebarItem({})).toBe(false);
  });

  it('keeps ordinary comments anchored at their document position', () => {
    expect(normalizeFloatingAnchorTop(-240, { commentId: 'c-1' })).toBe(-240);
    expect(normalizeFloatingAnchorTop(80, { commentId: 'c-1' })).toBe(80);
  });

  it('keeps tracked-change cards scroll-coupled to their document anchor', () => {
    expect(normalizeFloatingAnchorTop(-240, { commentId: 'tc-1', trackedChange: true })).toBe(-240);
    expect(normalizeFloatingAnchorTop(80, { commentId: 'tc-1', trackedChange: true })).toBe(80);
  });

  it('mounts ordinary dialogs only when pending, active, or near the viewport', () => {
    expect(
      shouldMountFloatingCommentDialog({
        id: 'c-1',
        visibleIds: new Set(),
        activeCommentInstanceId: null,
        comment: { commentId: 'c-1' },
      }),
    ).toBe(false);
    expect(
      shouldMountFloatingCommentDialog({
        id: 'c-1',
        visibleIds: new Set(['c-1']),
        activeCommentInstanceId: null,
        comment: { commentId: 'c-1' },
      }),
    ).toBe(true);
    expect(
      shouldMountFloatingCommentDialog({
        id: 'c-1',
        visibleIds: new Set(),
        activeCommentInstanceId: 'c-1',
        comment: { commentId: 'c-1' },
      }),
    ).toBe(true);
    expect(
      shouldMountFloatingCommentDialog({
        id: 'pending',
        visibleIds: new Set(),
        activeCommentInstanceId: null,
        comment: { commentId: 'pending' },
      }),
    ).toBe(true);
  });

  it('keeps tracked-change review cards mounted even when they are outside the observer range', () => {
    expect(
      shouldMountFloatingCommentDialog({
        id: 'tc-1',
        visibleIds: new Set(),
        activeCommentInstanceId: null,
        comment: { commentId: 'tc-1', trackedChange: true },
      }),
    ).toBe(true);
  });
});
