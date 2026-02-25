import { describe, expect, it, vi } from 'vitest';
import { captureRunsInRange } from './style-resolver.js';
import type { Editor } from '../../core/Editor.js';

// ---------------------------------------------------------------------------
// captureRunsInRange — block content offset tests
// ---------------------------------------------------------------------------

describe('captureRunsInRange: block content offset (blockPos + 1)', () => {
  /**
   * ProseMirror block content starts at blockPos + 1 (the +1 skips the
   * block node's opening token). This test verifies that captureRunsInRange
   * correctly uses contentStart = blockPos + 1 when computing absolute
   * positions for doc.nodesBetween.
   */
  it('walks document starting at blockPos + 1, not blockPos', () => {
    const nodesBetween = vi.fn();
    const editor = {
      state: {
        doc: { nodesBetween },
      },
    } as unknown as Editor;

    // Block at position 10, text offsets [2, 5)
    // Content starts at 11 (blockPos + 1)
    // So absolute range should be [13, 16) not [12, 15)
    captureRunsInRange(editor, 10, 2, 5);

    expect(nodesBetween).toHaveBeenCalledTimes(1);
    const [absFrom, absTo] = nodesBetween.mock.calls[0];
    expect(absFrom).toBe(13); // 10 + 1 + 2
    expect(absTo).toBe(16); // 10 + 1 + 5
  });

  it('computes correct absolute positions for blockPos=0', () => {
    const nodesBetween = vi.fn();
    const editor = {
      state: {
        doc: { nodesBetween },
      },
    } as unknown as Editor;

    // Block at position 0, text offsets [0, 3)
    // Content starts at 1 (0 + 1)
    captureRunsInRange(editor, 0, 0, 3);

    const [absFrom, absTo] = nodesBetween.mock.calls[0];
    expect(absFrom).toBe(1); // 0 + 1 + 0
    expect(absTo).toBe(4); // 0 + 1 + 3
  });

  it('returns content-relative offsets in captured runs', () => {
    // Simulate a text node at absolute position 11, size 5
    const textNode = {
      isText: true,
      nodeSize: 5,
      marks: [],
    };

    const nodesBetween = vi.fn((from: number, to: number, cb: Function) => {
      // Call back with a text node starting at absolute position 11
      cb(textNode, 11);
    });

    const editor = {
      state: {
        doc: { nodesBetween },
      },
    } as unknown as Editor;

    // Block at position 10, text offsets [0, 5)
    // contentStart = 11, absFrom = 11, absTo = 16
    const result = captureRunsInRange(editor, 10, 0, 5);

    expect(result.runs).toHaveLength(1);
    // Run offsets should be relative to contentStart (blockPos + 1)
    // nodeStart = max(11, 11) = 11, relFrom = 11 - 11 = 0
    // nodeEnd = min(11 + 5, 16) = 16, relTo = 16 - 11 = 5
    expect(result.runs[0].from).toBe(0);
    expect(result.runs[0].to).toBe(5);
    expect(result.runs[0].charCount).toBe(5);
  });

  it('clamps run offsets to the requested range', () => {
    // Text node extends beyond the requested range
    const textNode = {
      isText: true,
      nodeSize: 10,
      marks: [],
    };

    const nodesBetween = vi.fn((from: number, to: number, cb: Function) => {
      // Text node starts at contentStart (11), extends to 21
      cb(textNode, 11);
    });

    const editor = {
      state: {
        doc: { nodesBetween },
      },
    } as unknown as Editor;

    // Block at position 10, requesting only text offsets [2, 5)
    // contentStart = 11, absFrom = 13, absTo = 16
    const result = captureRunsInRange(editor, 10, 2, 5);

    expect(result.runs).toHaveLength(1);
    // nodeStart = max(11, 13) = 13, relFrom = 13 - 11 = 2
    // nodeEnd = min(21, 16) = 16, relTo = 16 - 11 = 5
    expect(result.runs[0].from).toBe(2);
    expect(result.runs[0].to).toBe(5);
    expect(result.runs[0].charCount).toBe(3);
  });

  it('filters out metadata marks (trackInsert, commentMark, etc.)', () => {
    const boldMark = { type: { name: 'bold' }, attrs: {}, eq: () => true };
    const trackMark = { type: { name: 'trackInsert' }, attrs: {}, eq: () => true };

    const textNode = {
      isText: true,
      nodeSize: 5,
      marks: [boldMark, trackMark],
    };

    const nodesBetween = vi.fn((_from: number, _to: number, cb: Function) => {
      cb(textNode, 1);
    });

    const editor = {
      state: { doc: { nodesBetween } },
    } as unknown as Editor;

    const result = captureRunsInRange(editor, 0, 0, 5);

    expect(result.runs).toHaveLength(1);
    // Only bold should be present, trackInsert filtered out
    expect(result.runs[0].marks).toHaveLength(1);
    expect(result.runs[0].marks[0].type.name).toBe('bold');
  });
});
