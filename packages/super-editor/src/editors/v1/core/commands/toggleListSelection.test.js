import { describe, expect, it } from 'vitest';

import { computeParagraphContentBounds, computeToggleListSelectionRange } from './toggleListSelection.js';

function createParagraphNode({ nodeSize, firstChildName = 'run', lastChildName = 'run' } = {}) {
  return {
    nodeSize,
    firstChild: firstChildName ? { type: { name: firstChildName } } : null,
    lastChild: lastChildName ? { type: { name: lastChildName } } : null,
  };
}

describe('computeParagraphContentBounds', () => {
  it('targets the text content inside run wrappers', () => {
    const bounds = computeParagraphContentBounds(10, createParagraphNode({ nodeSize: 12 }));

    expect(bounds).toEqual({ from: 12, to: 20 });
  });

  it('falls back to paragraph bounds when there is no run wrapper', () => {
    const bounds = computeParagraphContentBounds(
      20,
      createParagraphNode({
        nodeSize: 6,
        firstChildName: 'text',
        lastChildName: 'text',
      }),
    );

    expect(bounds).toEqual({ from: 21, to: 25 });
  });

  it('collapses empty content to a valid caret position', () => {
    const bounds = computeParagraphContentBounds(5, createParagraphNode({ nodeSize: 2 }));

    expect(bounds).toEqual({ from: 7, to: 7 });
  });
});

describe('computeToggleListSelectionRange', () => {
  it('keeps a collapsed caret collapsed for single-paragraph toggles', () => {
    const range = computeToggleListSelectionRange({
      selectionWasCollapsed: true,
      affectedParagraphCount: 1,
      firstParagraphPos: 0,
      lastParagraphPos: 0,
      firstNode: createParagraphNode({ nodeSize: 12 }),
      lastNode: createParagraphNode({ nodeSize: 12 }),
    });

    expect(range).toEqual({ from: 10, to: 10 });
  });

  it('preserves a range for single-paragraph selection toggles', () => {
    const range = computeToggleListSelectionRange({
      selectionWasCollapsed: false,
      affectedParagraphCount: 1,
      firstParagraphPos: 0,
      lastParagraphPos: 0,
      firstNode: createParagraphNode({ nodeSize: 12 }),
      lastNode: createParagraphNode({ nodeSize: 12 }),
    });

    expect(range).toEqual({ from: 2, to: 10 });
  });

  it('preserves a range across multiple affected paragraphs', () => {
    const range = computeToggleListSelectionRange({
      selectionWasCollapsed: false,
      affectedParagraphCount: 2,
      firstParagraphPos: 0,
      lastParagraphPos: 20,
      firstNode: createParagraphNode({ nodeSize: 12 }),
      lastNode: createParagraphNode({ nodeSize: 14 }),
    });

    expect(range).toEqual({ from: 2, to: 32 });
  });

  it('returns null when it cannot compute valid bounds', () => {
    const range = computeToggleListSelectionRange({
      selectionWasCollapsed: true,
      affectedParagraphCount: 1,
      firstParagraphPos: 0,
      lastParagraphPos: 0,
      firstNode: null,
      lastNode: null,
    });

    expect(range).toBeNull();
  });
});
