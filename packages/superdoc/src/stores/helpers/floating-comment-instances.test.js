import { describe, expect, it } from 'vitest';
import { buildFloatingCommentInstances } from './floating-comment-instances.js';

describe('buildFloatingCommentInstances', () => {
  it('returns no instances when neither position key nor fallback id is available', () => {
    expect(
      buildFloatingCommentInstances({
        comment: { commentId: null },
        positionKey: null,
        positionEntry: null,
        fallbackId: null,
      }),
    ).toEqual([]);
  });

  it('builds a single primary instance for non-repeated threads', () => {
    expect(
      buildFloatingCommentInstances({
        comment: { commentId: 'thread-1', trackedChange: false },
        positionKey: 'comment-position-1',
        positionEntry: {
          pageIndex: 4,
          bounds: { top: 80, left: 12, right: 64, bottom: 100, width: 52, height: 20 },
        },
        fallbackId: 'fallback-thread-1',
      }),
    ).toEqual([
      {
        id: 'comment-position-1',
        threadId: 'thread-1',
        comment: { commentId: 'thread-1', trackedChange: false },
        positionKey: 'comment-position-1',
        positionEntry: {
          pageIndex: 4,
          bounds: { top: 80, left: 12, right: 64, bottom: 100, width: 52, height: 20 },
        },
        pageIndex: 4,
        isPrimary: true,
      },
    ]);
  });

  it('uses the fallback id when building a single instance without a position key', () => {
    expect(
      buildFloatingCommentInstances({
        comment: { commentId: null, trackedChange: false },
        positionKey: null,
        positionEntry: null,
        fallbackId: 'fallback-thread-id',
      }),
    ).toEqual([
      {
        id: 'fallback-thread-id',
        threadId: 'fallback-thread-id',
        comment: { commentId: null, trackedChange: false },
        positionKey: null,
        positionEntry: null,
        pageIndex: null,
        isPrimary: true,
      },
    ]);
  });

  it('fans repeated header/footer tracked changes into one instance per page', () => {
    const comment = {
      commentId: 'tracked-change-repeat',
      trackedChange: true,
      trackedChangeStory: { kind: 'story', storyType: 'headerFooterPart', refId: 'rId-footer' },
    };
    const positionEntry = {
      pageIndex: 2,
      rects: [
        { pageIndex: 0, top: 20, left: 12, right: 50, bottom: 40 },
        { pageIndex: 1, top: 120, left: 8, right: 32, bottom: 136 },
        { pageIndex: 1, top: 122, left: 32, right: 72, bottom: 142 },
        { pageIndex: 2, top: 240, left: 16, right: 80, bottom: 266 },
      ],
      bounds: { top: 240, left: 16, right: 80, bottom: 266, width: 64, height: 26 },
    };

    expect(
      buildFloatingCommentInstances({
        comment,
        positionKey: 'tc::hf:part:rId-footer::tracked-change-repeat',
        positionEntry,
        fallbackId: 'fallback-thread-id',
      }),
    ).toEqual([
      {
        id: 'tc::hf:part:rId-footer::tracked-change-repeat::page:0',
        threadId: 'tracked-change-repeat',
        comment,
        positionKey: 'tc::hf:part:rId-footer::tracked-change-repeat',
        pageIndex: 0,
        isPrimary: false,
        positionEntry: {
          ...positionEntry,
          pageIndex: 0,
          rects: [{ pageIndex: 0, top: 20, left: 12, right: 50, bottom: 40 }],
          bounds: { top: 20, left: 12, right: 50, bottom: 40, width: 38, height: 20 },
        },
      },
      {
        id: 'tc::hf:part:rId-footer::tracked-change-repeat::page:1',
        threadId: 'tracked-change-repeat',
        comment,
        positionKey: 'tc::hf:part:rId-footer::tracked-change-repeat',
        pageIndex: 1,
        isPrimary: false,
        positionEntry: {
          ...positionEntry,
          pageIndex: 1,
          rects: [
            { pageIndex: 1, top: 120, left: 8, right: 32, bottom: 136 },
            { pageIndex: 1, top: 122, left: 32, right: 72, bottom: 142 },
          ],
          bounds: { top: 120, left: 8, right: 72, bottom: 142, width: 64, height: 22 },
        },
      },
      {
        id: 'tc::hf:part:rId-footer::tracked-change-repeat::page:2',
        threadId: 'tracked-change-repeat',
        comment,
        positionKey: 'tc::hf:part:rId-footer::tracked-change-repeat',
        pageIndex: 2,
        isPrimary: true,
        positionEntry: {
          ...positionEntry,
          pageIndex: 2,
          rects: [{ pageIndex: 2, top: 240, left: 16, right: 80, bottom: 266 }],
          bounds: { top: 240, left: 16, right: 80, bottom: 266, width: 64, height: 26 },
        },
      },
    ]);
  });

  it('falls back to a single instance when repeated-page geometry cannot be aggregated', () => {
    const comment = {
      commentId: 'tracked-change-invalid-repeat',
      trackedChange: true,
      trackedChangeStory: { kind: 'story', storyType: 'headerFooterPart', refId: 'rId-footer' },
    };

    expect(
      buildFloatingCommentInstances({
        comment,
        positionKey: 'tc::hf:part:rId-footer::tracked-change-invalid-repeat',
        positionEntry: {
          pageIndex: 1,
          rects: [
            { pageIndex: 0, top: 20, left: null, right: 60, bottom: 40 },
            { pageIndex: 1, top: 120, left: undefined, right: 72, bottom: 142 },
          ],
          bounds: { top: 120, left: 16, right: 80, bottom: 146, width: 64, height: 26 },
        },
        fallbackId: 'fallback-thread-id',
      }),
    ).toEqual([
      {
        id: 'tc::hf:part:rId-footer::tracked-change-invalid-repeat',
        threadId: 'tracked-change-invalid-repeat',
        comment,
        positionKey: 'tc::hf:part:rId-footer::tracked-change-invalid-repeat',
        positionEntry: {
          pageIndex: 1,
          rects: [
            { pageIndex: 0, top: 20, left: null, right: 60, bottom: 40 },
            { pageIndex: 1, top: 120, left: undefined, right: 72, bottom: 142 },
          ],
          bounds: { top: 120, left: 16, right: 80, bottom: 146, width: 64, height: 26 },
        },
        pageIndex: 1,
        isPrimary: true,
      },
    ]);
  });

  it('does not duplicate threads that are not repeated header/footer tracked changes', () => {
    expect(
      buildFloatingCommentInstances({
        comment: {
          commentId: 'tracked-change-body',
          trackedChange: true,
          trackedChangeStory: { kind: 'story', storyType: 'body' },
        },
        positionKey: 'tc::body::tracked-change-body',
        positionEntry: {
          pageIndex: 0,
          rects: [
            { pageIndex: 0, top: 20, left: 12, right: 50, bottom: 40 },
            { pageIndex: 1, top: 120, left: 12, right: 50, bottom: 140 },
          ],
          bounds: { top: 20, left: 12, right: 50, bottom: 40, width: 38, height: 20 },
        },
        fallbackId: 'fallback-thread-id',
      }),
    ).toEqual([
      expect.objectContaining({
        id: 'tc::body::tracked-change-body',
        pageIndex: 0,
        isPrimary: true,
      }),
    ]);
  });
});
