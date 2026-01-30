/**
 * Tests for TrackChangesHandler
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { TrackChangesHandler, type TrackChangeSpan } from '../src/track-changes-handler';

describe('TrackChangesHandler', () => {
  let handler: TrackChangesHandler;

  beforeEach(() => {
    handler = new TrackChangesHandler();
  });

  describe('getVisualPosition', () => {
    it('should return same position with no deletions', () => {
      const spans: TrackChangeSpan[] = [];
      const visualPos = handler.getVisualPosition(10, spans);

      expect(visualPos).toBe(10);
    });

    it('should subtract deletion length for positions after deletion', () => {
      const spans: TrackChangeSpan[] = [{ pmStart: 5, pmEnd: 10, type: 'deletion', author: 'user1' }];
      const visualPos = handler.getVisualPosition(15, spans);

      expect(visualPos).toBe(10); // 15 - 5 (deletion length)
    });

    it('should clamp position within deletion to deletion start', () => {
      const spans: TrackChangeSpan[] = [{ pmStart: 5, pmEnd: 10, type: 'deletion', author: 'user1' }];
      const visualPos = handler.getVisualPosition(7, spans);

      expect(visualPos).toBe(5);
    });

    it('should handle multiple deletions', () => {
      const spans: TrackChangeSpan[] = [
        { pmStart: 5, pmEnd: 10, type: 'deletion', author: 'user1' },
        { pmStart: 15, pmEnd: 20, type: 'deletion', author: 'user1' },
      ];
      const visualPos = handler.getVisualPosition(25, spans);

      expect(visualPos).toBe(15); // 25 - 5 - 5
    });

    it('should ignore insertions', () => {
      const spans: TrackChangeSpan[] = [{ pmStart: 5, pmEnd: 10, type: 'insertion', author: 'user1' }];
      const visualPos = handler.getVisualPosition(15, spans);

      expect(visualPos).toBe(15);
    });
  });

  describe('getCursorAdjustment', () => {
    it('should return negative adjustment for deletions', () => {
      const spans: TrackChangeSpan[] = [{ pmStart: 5, pmEnd: 10, type: 'deletion', author: 'user1' }];
      const adjustment = handler.getCursorAdjustment(15, spans);

      expect(adjustment).toBe(-5);
    });

    it('should return 0 for positions before deletions', () => {
      const spans: TrackChangeSpan[] = [{ pmStart: 10, pmEnd: 15, type: 'deletion', author: 'user1' }];
      const adjustment = handler.getCursorAdjustment(5, spans);

      expect(adjustment).toBe(0);
    });
  });

  describe('isInDeletion', () => {
    it('should return true for positions in deletion', () => {
      const spans: TrackChangeSpan[] = [{ pmStart: 5, pmEnd: 10, type: 'deletion', author: 'user1' }];

      expect(handler.isInDeletion(7, spans)).toBe(true);
      expect(handler.isInDeletion(5, spans)).toBe(true);
      expect(handler.isInDeletion(9, spans)).toBe(true);
    });

    it('should return false for positions outside deletion', () => {
      const spans: TrackChangeSpan[] = [{ pmStart: 5, pmEnd: 10, type: 'deletion', author: 'user1' }];

      expect(handler.isInDeletion(4, spans)).toBe(false);
      expect(handler.isInDeletion(10, spans)).toBe(false);
    });
  });

  describe('getDeletionsInRange', () => {
    it('should return deletions intersecting range', () => {
      const spans: TrackChangeSpan[] = [
        { pmStart: 5, pmEnd: 10, type: 'deletion', author: 'user1' },
        { pmStart: 15, pmEnd: 20, type: 'deletion', author: 'user1' },
        { pmStart: 25, pmEnd: 30, type: 'deletion', author: 'user1' },
      ];

      const deletions = handler.getDeletionsInRange(8, 18, spans);

      expect(deletions).toHaveLength(2);
      expect(deletions[0].pmStart).toBe(5);
      expect(deletions[1].pmStart).toBe(15);
    });
  });
});
