import { describe, expect, it } from 'vitest';
import {
  isAnchorOutsideFloatingViewport,
  isPersistentReviewSidebarItem,
  normalizeFloatingAnchorTop,
  resolvePersistentReviewCardTop,
  shouldKeepPersistentReviewCardAtAnchor,
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

  it('detects anchors outside the floating viewport', () => {
    expect(isAnchorOutsideFloatingViewport(-20, 0, 620, -1)).toBe(true);
    expect(isAnchorOutsideFloatingViewport(-20, 0, 620, 10)).toBe(false);
    expect(isAnchorOutsideFloatingViewport(621, 0, 620)).toBe(true);
    expect(isAnchorOutsideFloatingViewport(0, 0, 620)).toBe(false);
    expect(isAnchorOutsideFloatingViewport(620, 0, 620)).toBe(false);
    expect(isAnchorOutsideFloatingViewport(Number.NaN, 0, 620)).toBe(false);
  });

  it('keeps persistent review cards at offscreen anchors instead of collision-packing them into view', () => {
    expect(
      shouldKeepPersistentReviewCardAtAnchor({
        comment: { commentId: 'tc-1', trackedChange: true },
        anchorTop: -24,
        anchorBottom: -4,
        viewportTop: 0,
        viewportBottom: 620,
      }),
    ).toBe(true);
    expect(
      shouldKeepPersistentReviewCardAtAnchor({
        comment: { commentId: 'tc-1', trackedChange: true },
        anchorTop: 120,
        anchorBottom: 140,
        viewportTop: 0,
        viewportBottom: 620,
      }),
    ).toBe(false);
    expect(
      shouldKeepPersistentReviewCardAtAnchor({
        comment: { commentId: 'c-1' },
        anchorTop: -24,
        anchorBottom: -4,
        viewportTop: 0,
        viewportBottom: 620,
      }),
    ).toBe(false);
  });

  it('positions persistent review cards outside the viewport once their anchors are fully offscreen', () => {
    expect(
      resolvePersistentReviewCardTop({
        comment: { commentId: 'tc-1', trackedChange: true },
        anchorTop: -26,
        anchorBottom: -8,
        cardHeight: 92,
        viewportTop: 0,
        viewportBottom: 620,
      }),
    ).toBe(-93);
    expect(
      resolvePersistentReviewCardTop({
        comment: { commentId: 'tc-1', trackedChange: true },
        anchorTop: 621,
        anchorBottom: 640,
        cardHeight: 92,
        viewportTop: 0,
        viewportBottom: 620,
      }),
    ).toBe(621);
    expect(
      resolvePersistentReviewCardTop({
        comment: { commentId: 'tc-1', trackedChange: true },
        anchorTop: -10,
        anchorBottom: 8,
        cardHeight: 92,
        viewportTop: 0,
        viewportBottom: 620,
      }),
    ).toBeNull();
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
