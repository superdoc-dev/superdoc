import { describe, it, expect } from 'vitest';
import { TrackInsertMarkName, TrackDeleteMarkName } from '@extensions/track-changes/constants.js';
import { ensureTrackedWrapper, prepareRunTrackingContext } from './track-change-helpers.js';

describe('track-change-helpers', () => {
  describe('prepareRunTrackingContext', () => {
    it('returns original run and empty tracking map when no tracking marks are present', () => {
      const originalRun = {
        type: 'run',
        marks: [{ type: 'bold' }],
        content: [{ type: 'text', marks: [{ type: 'bold' }] }],
      };

      const { runNode, trackingMarksByType } = prepareRunTrackingContext(originalRun);

      expect(runNode).toBe(originalRun);
      expect(trackingMarksByType).toBeInstanceOf(Map);
      expect(trackingMarksByType.size).toBe(0);
    });

    it('copies tracking marks and propagates them to child nodes', () => {
      const trackingMark = { type: TrackInsertMarkName, attrs: { id: 'track-1', author: 'Alice' } };
      const child = { type: 'text', marks: [{ type: 'bold' }] };
      const originalRun = {
        type: 'run',
        marks: [trackingMark, { type: 'italic' }],
        content: [child],
      };

      const { runNode, trackingMarksByType } = prepareRunTrackingContext(originalRun);

      expect(runNode).not.toBe(originalRun);
      expect(runNode.marks).toEqual([{ type: 'italic' }]);
      expect(runNode.content[0]).not.toBe(child);
      expect(runNode.content[0].marks).toHaveLength(2);
      expect(runNode.content[0].marks[0]).toEqual({ type: 'bold' });
      expect(runNode.content[0].marks[1]).toEqual(trackingMark);
      expect(runNode.content[0].marks[1]).not.toBe(trackingMark);

      expect(child.marks).toEqual([{ type: 'bold' }]);

      expect(trackingMarksByType).toBeInstanceOf(Map);
      expect(trackingMarksByType.size).toBe(1);
      const propagated = trackingMarksByType.get(TrackInsertMarkName);
      expect(propagated).toEqual(trackingMark);
      expect(propagated).not.toBe(trackingMark);
    });
  });

  describe('ensureTrackedWrapper', () => {
    it('returns the original runs when a tracked wrapper already exists', () => {
      const trackedRun = [{ name: 'w:ins', elements: [] }];
      const result = ensureTrackedWrapper(trackedRun, new Map());
      expect(result).toBe(trackedRun);
    });

    it('returns the original runs when no tracking marks are provided', () => {
      const plainRuns = [{ name: 'w:r', elements: [] }];
      const result = ensureTrackedWrapper(plainRuns, new Map());
      expect(result).toBe(plainRuns);
    });

    it('wraps runs in <w:ins> when an insert tracking mark is present', () => {
      const run = {
        name: 'w:r',
        elements: [
          {
            name: 'w:t',
            elements: [{ text: 'Inserted text', type: 'text' }],
          },
        ],
      };
      const runs = [run];
      const mark = {
        type: TrackInsertMarkName,
        attrs: { id: 'track-2', author: 'Bob', authorEmail: 'bob@example.com', date: '2024-01-01T00:00:00Z' },
      };
      const trackingMap = new Map([[TrackInsertMarkName, mark]]);

      const result = ensureTrackedWrapper(runs, trackingMap);

      expect(result).not.toBe(runs);
      expect(result).toHaveLength(1);
      const wrapper = result[0];
      expect(wrapper.name).toBe('w:ins');
      expect(wrapper.attributes).toMatchObject({
        'w:id': 'track-2',
        'w:author': 'Bob',
        'w:authorEmail': 'bob@example.com',
        'w:date': '2024-01-01T00:00:00Z',
      });
      expect(wrapper.elements).toHaveLength(1);
      expect(wrapper.elements[0]).not.toBe(run);
      expect(wrapper.elements[0].name).toBe('w:r');
      expect(run.elements[0].name).toBe('w:t');
    });

    it('wraps runs in <w:del> and renames text nodes for deletions', () => {
      const run = {
        name: 'w:r',
        elements: [
          {
            name: 'w:t',
            elements: [{ text: 'Removed text', type: 'text' }],
          },
        ],
      };
      const mark = { type: TrackDeleteMarkName, attrs: { id: 'track-3' } };
      const trackingMap = new Map([[TrackDeleteMarkName, mark]]);

      const result = ensureTrackedWrapper([run], trackingMap);

      expect(result).toHaveLength(1);
      const wrapper = result[0];
      expect(wrapper.name).toBe('w:del');
      expect(wrapper.attributes['w:id']).toBe('track-3');
      expect(wrapper.elements[0].elements[0].name).toBe('w:delText');
      expect(run.elements[0].name).toBe('w:t');
    });
  });
});
