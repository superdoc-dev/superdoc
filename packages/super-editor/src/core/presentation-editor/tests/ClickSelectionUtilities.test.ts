import { describe, expect, it } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';

import {
  registerPointerClick,
  computeWordSelectionRangeAt,
  computeParagraphSelectionRangeAt,
  getFirstTextPosition,
  type MultiClickState,
} from '../ClickSelectionUtilities.js';

/**
 * Create a basic ProseMirror schema for testing.
 */
const testSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      content: 'inline*',
      group: 'block',
      parseDOM: [{ tag: 'p' }],
      toDOM: () => ['p', 0],
    },
    text: { group: 'inline' },
  },
  marks: {},
});

/**
 * Create a test editor state with the given document content.
 */
function createTestState(content: string): EditorState {
  const doc = testSchema.node('doc', null, [testSchema.node('paragraph', null, testSchema.text(content))]);
  return EditorState.create({ schema: testSchema, doc });
}

describe('ClickSelectionUtilities', () => {
  describe('registerPointerClick', () => {
    it('returns click count 1 for first click', () => {
      const event = { timeStamp: 1000, clientX: 100, clientY: 200 };
      const previous: MultiClickState = {
        clickCount: 0,
        lastClickTime: 0,
        lastClickPosition: { x: 0, y: 0 },
      };
      const options = { timeThresholdMs: 500, distanceThresholdPx: 5, maxClickCount: 3 };

      const result = registerPointerClick(event, previous, options);

      expect(result.clickCount).toBe(1);
      expect(result.lastClickTime).toBe(1000);
      expect(result.lastClickPosition).toEqual({ x: 100, y: 200 });
    });

    it('increments click count for rapid clicks within time threshold', () => {
      const previous: MultiClickState = {
        clickCount: 1,
        lastClickTime: 1000,
        lastClickPosition: { x: 100, y: 200 },
      };

      const event = { timeStamp: 1200, clientX: 102, clientY: 201 };
      const options = { timeThresholdMs: 500, distanceThresholdPx: 5, maxClickCount: 3 };

      const result = registerPointerClick(event, previous, options);

      expect(result.clickCount).toBe(2);
    });

    it('resets click count when time threshold exceeded', () => {
      const previous: MultiClickState = {
        clickCount: 2,
        lastClickTime: 1000,
        lastClickPosition: { x: 100, y: 200 },
      };

      const event = { timeStamp: 2000, clientX: 102, clientY: 201 };
      const options = { timeThresholdMs: 500, distanceThresholdPx: 5, maxClickCount: 3 };

      const result = registerPointerClick(event, previous, options);

      expect(result.clickCount).toBe(1);
    });

    it('resets click count when distance threshold exceeded (X-axis)', () => {
      const previous: MultiClickState = {
        clickCount: 1,
        lastClickTime: 1000,
        lastClickPosition: { x: 100, y: 200 },
      };

      const event = { timeStamp: 1200, clientX: 150, clientY: 200 };
      const options = { timeThresholdMs: 500, distanceThresholdPx: 5, maxClickCount: 3 };

      const result = registerPointerClick(event, previous, options);

      expect(result.clickCount).toBe(1);
    });

    it('resets click count when distance threshold exceeded (Y-axis)', () => {
      const previous: MultiClickState = {
        clickCount: 1,
        lastClickTime: 1000,
        lastClickPosition: { x: 100, y: 200 },
      };

      const event = { timeStamp: 1200, clientX: 100, clientY: 250 };
      const options = { timeThresholdMs: 500, distanceThresholdPx: 5, maxClickCount: 3 };

      const result = registerPointerClick(event, previous, options);

      expect(result.clickCount).toBe(1);
    });

    it('respects maxClickCount limit', () => {
      const previous: MultiClickState = {
        clickCount: 3,
        lastClickTime: 1000,
        lastClickPosition: { x: 100, y: 200 },
      };

      const event = { timeStamp: 1200, clientX: 100, clientY: 200 };
      const options = { timeThresholdMs: 500, distanceThresholdPx: 5, maxClickCount: 3 };

      const result = registerPointerClick(event, previous, options);

      expect(result.clickCount).toBe(3);
    });

    it('handles boundary condition: exactly at time threshold', () => {
      const previous: MultiClickState = {
        clickCount: 1,
        lastClickTime: 1000,
        lastClickPosition: { x: 100, y: 200 },
      };

      const event = { timeStamp: 1500, clientX: 100, clientY: 200 };
      const options = { timeThresholdMs: 500, distanceThresholdPx: 5, maxClickCount: 3 };

      const result = registerPointerClick(event, previous, options);

      expect(result.clickCount).toBe(2);
    });

    it('handles boundary condition: exactly at distance threshold', () => {
      const previous: MultiClickState = {
        clickCount: 1,
        lastClickTime: 1000,
        lastClickPosition: { x: 100, y: 200 },
      };

      const event = { timeStamp: 1200, clientX: 105, clientY: 205 };
      const options = { timeThresholdMs: 500, distanceThresholdPx: 5, maxClickCount: 3 };

      const result = registerPointerClick(event, previous, options);

      expect(result.clickCount).toBe(2);
    });

    it('uses performance.now() when timeStamp is unavailable', () => {
      const previous: MultiClickState = {
        clickCount: 0,
        lastClickTime: 0,
        lastClickPosition: { x: 0, y: 0 },
      };

      const event = { timeStamp: undefined, clientX: 100, clientY: 200 } as unknown as Pick<
        MouseEvent,
        'timeStamp' | 'clientX' | 'clientY'
      >;
      const options = { timeThresholdMs: 500, distanceThresholdPx: 5, maxClickCount: 3 };

      const result = registerPointerClick(event, previous, options);

      expect(result.clickCount).toBe(1);
      expect(result.lastClickTime).toBeGreaterThan(0);
    });
  });

  describe('getFirstTextPosition', () => {
    it('returns 1 when doc is null', () => {
      const result = getFirstTextPosition(null);
      expect(result).toBe(1);
    });

    it('returns 1 when doc has no content', () => {
      const doc = testSchema.node('doc', null, [testSchema.node('paragraph')]);
      const result = getFirstTextPosition(doc);
      expect(result).toBe(1);
    });

    it('finds first textblock position in document', () => {
      const state = createTestState('Hello world');
      const result = getFirstTextPosition(state.doc);
      expect(result).toBe(1);
    });
  });

  describe('computeWordSelectionRangeAt', () => {
    it('returns null when state is null', () => {
      const result = computeWordSelectionRangeAt(null as unknown as EditorState, 5);
      expect(result).toBe(null);
    });

    it('returns null when position is out of bounds (negative)', () => {
      const state = createTestState('Hello world');
      const result = computeWordSelectionRangeAt(state, -1);
      expect(result).toBe(null);
    });

    it('returns null when position is out of bounds (beyond content size)', () => {
      const state = createTestState('Hello world');
      const result = computeWordSelectionRangeAt(state, 1000);
      expect(result).toBe(null);
    });

    it('selects a single word at cursor position', () => {
      const state = createTestState('Hello world');
      // Position 3 is inside "Hello"
      const result = computeWordSelectionRangeAt(state, 3);

      expect(result).not.toBe(null);
      expect(result?.from).toBe(1);
      expect(result?.to).toBe(6);
      expect(state.doc.textBetween(result!.from, result!.to)).toBe('Hello');
    });

    it('selects word at beginning of paragraph', () => {
      const state = createTestState('Hello world');
      const result = computeWordSelectionRangeAt(state, 1);

      expect(result).not.toBe(null);
      expect(result?.from).toBe(1);
      expect(result?.to).toBe(6);
    });

    it('selects word at end of paragraph', () => {
      const state = createTestState('Hello world');
      // Position 9 is inside "world"
      const result = computeWordSelectionRangeAt(state, 9);

      expect(result).not.toBe(null);
      expect(result?.from).toBe(7);
      expect(result?.to).toBe(12);
      expect(state.doc.textBetween(result!.from, result!.to)).toBe('world');
    });

    it('returns null when position is on whitespace between words', () => {
      const state = createTestState('Hello world');
      // Position 6 is the space between words
      const result = computeWordSelectionRangeAt(state, 6);

      expect(result).toBe(null);
    });

    it('handles Unicode word characters correctly', () => {
      const state = createTestState('Café résumé');
      // Position in "Café"
      const result = computeWordSelectionRangeAt(state, 3);

      expect(result).not.toBe(null);
      expect(result?.from).toBe(1);
      expect(result?.to).toBe(5);
      expect(state.doc.textBetween(result!.from, result!.to)).toBe('Café');
    });

    it('handles words with apostrophes', () => {
      const state = createTestState("don't stop");
      // Position in "don't"
      const result = computeWordSelectionRangeAt(state, 3);

      expect(result).not.toBe(null);
      expect(result?.from).toBe(1);
      expect(result?.to).toBe(6);
      expect(state.doc.textBetween(result!.from, result!.to)).toBe("don't");
    });

    it('handles words with hyphens', () => {
      const state = createTestState('mother-in-law');
      // Position in middle of hyphenated word
      const result = computeWordSelectionRangeAt(state, 8);

      expect(result).not.toBe(null);
      expect(state.doc.textBetween(result!.from, result!.to)).toBe('mother-in-law');
    });

    it('stops at paragraph boundaries', () => {
      const doc = testSchema.node('doc', null, [
        testSchema.node('paragraph', null, testSchema.text('First')),
        testSchema.node('paragraph', null, testSchema.text('Second')),
      ]);
      const state = EditorState.create({ schema: testSchema, doc });

      // Position in first paragraph
      const result = computeWordSelectionRangeAt(state, 3);

      expect(result).not.toBe(null);
      expect(result?.from).toBe(1);
      expect(result?.to).toBe(6);
      expect(state.doc.textBetween(result!.from, result!.to)).toBe('First');
    });
  });

  describe('computeParagraphSelectionRangeAt', () => {
    it('returns null when state is null', () => {
      const result = computeParagraphSelectionRangeAt(null as unknown as EditorState, 5);
      expect(result).toBe(null);
    });

    it('selects entire paragraph at cursor position', () => {
      const state = createTestState('Hello world');
      const result = computeParagraphSelectionRangeAt(state, 5);

      expect(result).not.toBe(null);
      expect(result?.from).toBe(1);
      expect(result?.to).toBe(12);
      expect(state.doc.textBetween(result!.from, result!.to)).toBe('Hello world');
    });

    it('selects paragraph at beginning', () => {
      const state = createTestState('Hello world');
      const result = computeParagraphSelectionRangeAt(state, 1);

      expect(result).not.toBe(null);
      expect(result?.from).toBe(1);
      expect(result?.to).toBe(12);
    });

    it('selects paragraph at end', () => {
      const state = createTestState('Hello world');
      const result = computeParagraphSelectionRangeAt(state, 11);

      expect(result).not.toBe(null);
      expect(result?.from).toBe(1);
      expect(result?.to).toBe(12);
    });

    it('selects correct paragraph in multi-paragraph document', () => {
      const doc = testSchema.node('doc', null, [
        testSchema.node('paragraph', null, testSchema.text('First paragraph')),
        testSchema.node('paragraph', null, testSchema.text('Second paragraph')),
      ]);
      const state = EditorState.create({ schema: testSchema, doc });

      // Position in second paragraph (after first paragraph + separator)
      const result = computeParagraphSelectionRangeAt(state, 20);

      expect(result).not.toBe(null);
      expect(state.doc.textBetween(result!.from, result!.to)).toBe('Second paragraph');
    });

    it('handles empty paragraph', () => {
      const doc = testSchema.node('doc', null, [testSchema.node('paragraph', null)]);
      const state = EditorState.create({ schema: testSchema, doc });

      const result = computeParagraphSelectionRangeAt(state, 1);

      expect(result).not.toBe(null);
      expect(result?.from).toBe(1);
      expect(result?.to).toBe(1);
    });
  });
});
