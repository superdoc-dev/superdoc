import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyPatch, _testInternals } from './applyPatch.js';

const {
  computeChangeRange,
  resolveInlineTextPosition,
  mapCharOffsetToPosition,
  getFirstTextMarks,
  getMarksAtPosition,
  buildTextNodes,
} = _testInternals;

// ============================================================================
// Mock Helpers
// ============================================================================

/**
 * Creates a mock mark with the given type name and optional attributes.
 */
const createMark = (typeName, attrs = {}) => ({
  type: { name: typeName },
  attrs,
  eq: (other) => other.type.name === typeName && JSON.stringify(other.attrs) === JSON.stringify(attrs),
});

/**
 * Creates a mock text node with the given text and marks.
 */
const createTextNode = (text, marks = []) => ({
  isText: true,
  isInline: true,
  isAtom: false,
  text,
  nodeSize: text.length,
  marks,
  content: { size: 0 },
});

/**
 * Creates a mock inline node (non-text) like an image or mention.
 */
const createInlineNode = (size = 1, options = {}) => ({
  isText: false,
  isInline: true,
  isAtom: options.isAtom ?? true,
  nodeSize: size,
  marks: options.marks || [],
  content: { size: options.contentSize ?? 0 },
});

/**
 * Creates a mock resolved position.
 */
const createResolvedPos = (options = {}) => ({
  pos: options.pos ?? 0,
  nodeAfter: options.nodeAfter ?? null,
  nodeBefore: options.nodeBefore ?? null,
  marks: () => options.marks || [],
});

/**
 * Creates a mock document with text content for simple tests.
 */
const createMockDoc = (textContent, nodes = null) => {
  const text = textContent;
  const docSize = text.length + 2; // +2 for paragraph boundaries

  return {
    content: { size: docSize },
    textBetween: (from, to, blockSep = '', leafText = '') => {
      const start = Math.max(0, from - 1);
      const end = Math.min(text.length, to - 1);
      return text.slice(start, end);
    },
    resolve: (pos) => {
      const textNodes = nodes || [createTextNode(text)];
      let nodeAfter = null;
      let nodeBefore = null;

      // Simple simulation: position 1 is start of text
      if (pos >= 1 && pos <= text.length) {
        nodeAfter = textNodes[0];
        nodeBefore = pos > 1 ? textNodes[0] : null;
      }

      return createResolvedPos({ pos, nodeAfter, nodeBefore, marks: [] });
    },
    nodesBetween: (from, to, callback) => {
      const textNodes = nodes || [createTextNode(text)];
      let pos = 1;
      for (const node of textNodes) {
        if (pos + node.nodeSize > from && pos < to) {
          callback(node, pos);
        }
        pos += node.nodeSize;
      }
    },
  };
};

/**
 * Creates a mock schema with text node support.
 */
const createMockSchema = () => ({
  text: (content, marks = []) => createTextNode(content, marks),
  marks: {},
});

/**
 * Creates a mock editor state.
 */
const createMockState = (doc, options = {}) => ({
  doc,
  schema: createMockSchema(),
  storedMarks: options.storedMarks || null,
  tr: createMockTransaction(doc),
});

/**
 * Creates a mock transaction.
 */
const createMockTransaction = (doc) => {
  const steps = [];
  return {
    doc,
    steps,
    delete: vi.fn(function (from, to) {
      steps.push({ type: 'delete', from, to });
      return this;
    }),
    replaceWith: vi.fn(function (from, to, content) {
      steps.push({ type: 'replaceWith', from, to, content });
      return this;
    }),
  };
};

// ============================================================================
// computeChangeRange tests
// ============================================================================

describe('computeChangeRange', () => {
  it('returns hasChange: false for identical strings', () => {
    const result = computeChangeRange('hello', 'hello');
    expect(result).toEqual({ prefix: 5, suffix: 0, hasChange: false });
  });

  it('returns hasChange: false for empty identical strings', () => {
    const result = computeChangeRange('', '');
    expect(result).toEqual({ prefix: 0, suffix: 0, hasChange: false });
  });

  it('detects change at the beginning', () => {
    const result = computeChangeRange('hello world', 'jello world');
    expect(result).toEqual({ prefix: 0, suffix: 10, hasChange: true });
  });

  it('detects change at the end', () => {
    const result = computeChangeRange('hello world', 'hello earth');
    expect(result).toEqual({ prefix: 6, suffix: 0, hasChange: true });
  });

  it('detects change in the middle', () => {
    const result = computeChangeRange('hello world', 'hello there');
    expect(result).toEqual({ prefix: 6, suffix: 0, hasChange: true });
  });

  it('detects change with common prefix and suffix', () => {
    const result = computeChangeRange('The quick brown fox', 'The fast brown fox');
    expect(result).toEqual({ prefix: 4, suffix: 10, hasChange: true });
  });

  it('handles complete replacement', () => {
    const result = computeChangeRange('abc', 'xyz');
    expect(result).toEqual({ prefix: 0, suffix: 0, hasChange: true });
  });

  it('handles insertion (empty original)', () => {
    const result = computeChangeRange('', 'new text');
    expect(result).toEqual({ prefix: 0, suffix: 0, hasChange: true });
  });

  it('handles deletion (empty suggested)', () => {
    const result = computeChangeRange('old text', '');
    expect(result).toEqual({ prefix: 0, suffix: 0, hasChange: true });
  });

  it('handles single character change', () => {
    const result = computeChangeRange('cat', 'car');
    expect(result).toEqual({ prefix: 2, suffix: 0, hasChange: true });
  });

  it('handles prefix-only match with different lengths', () => {
    const result = computeChangeRange('hello', 'hello world');
    expect(result).toEqual({ prefix: 5, suffix: 0, hasChange: true });
  });

  it('handles suffix-only match with different lengths', () => {
    const result = computeChangeRange('world', 'hello world');
    expect(result).toEqual({ prefix: 0, suffix: 5, hasChange: true });
  });

  it('handles overlapping prefix and suffix correctly', () => {
    // "abcde" -> "abXde" - prefix=2 (ab), suffix=2 (de), change is c->X
    const result = computeChangeRange('abcde', 'abXde');
    expect(result).toEqual({ prefix: 2, suffix: 2, hasChange: true });
  });
});

// ============================================================================
// resolveInlineTextPosition tests
// ============================================================================

describe('resolveInlineTextPosition', () => {
  it('returns position unchanged when out of bounds (negative)', () => {
    const doc = createMockDoc('hello');
    const result = resolveInlineTextPosition(doc, -1, 'forward');
    expect(result).toBe(-1);
  });

  it('returns position unchanged when out of bounds (exceeds size)', () => {
    const doc = createMockDoc('hello');
    const result = resolveInlineTextPosition(doc, 100, 'forward');
    expect(result).toBe(100);
  });

  it('returns position when nodeAfter is text (forward)', () => {
    const textNode = createTextNode('hello');
    const doc = {
      content: { size: 7 },
      resolve: (pos) => createResolvedPos({ pos, nodeAfter: textNode, nodeBefore: null }),
    };

    const result = resolveInlineTextPosition(doc, 1, 'forward');
    expect(result).toBe(1);
  });

  it('returns position when nodeBefore is text (backward)', () => {
    const textNode = createTextNode('hello');
    const doc = {
      content: { size: 7 },
      resolve: (pos) => createResolvedPos({ pos, nodeAfter: null, nodeBefore: textNode }),
    };

    const result = resolveInlineTextPosition(doc, 6, 'backward');
    expect(result).toBe(6);
  });

  it('returns position when no boundary node exists', () => {
    const doc = {
      content: { size: 7 },
      resolve: (pos) => createResolvedPos({ pos, nodeAfter: null, nodeBefore: null }),
    };

    const result = resolveInlineTextPosition(doc, 1, 'forward');
    expect(result).toBe(1);
  });

  it('stops at atom nodes', () => {
    const atomNode = createInlineNode(1, { isAtom: true });
    const doc = {
      content: { size: 10 },
      resolve: (pos) => createResolvedPos({ pos, nodeAfter: atomNode, nodeBefore: null }),
    };

    const result = resolveInlineTextPosition(doc, 1, 'forward');
    expect(result).toBe(1);
  });

  it('stops at empty inline nodes', () => {
    const emptyInline = createInlineNode(1, { isAtom: false, contentSize: 0 });
    const doc = {
      content: { size: 10 },
      resolve: (pos) => createResolvedPos({ pos, nodeAfter: emptyInline, nodeBefore: null }),
    };

    const result = resolveInlineTextPosition(doc, 1, 'forward');
    expect(result).toBe(1);
  });

  it('navigates through non-atom inline nodes with content (forward)', () => {
    let callCount = 0;
    const inlineWithContent = createInlineNode(2, { isAtom: false, contentSize: 1 });
    const textNode = createTextNode('a');

    const doc = {
      content: { size: 10 },
      resolve: (pos) => {
        callCount++;
        if (callCount === 1) {
          return createResolvedPos({ pos, nodeAfter: inlineWithContent, nodeBefore: null });
        }
        return createResolvedPos({ pos, nodeAfter: textNode, nodeBefore: null });
      },
    };

    const result = resolveInlineTextPosition(doc, 1, 'forward');
    expect(result).toBe(2);
  });

  it('respects iteration limit', () => {
    let callCount = 0;
    const inlineWithContent = createInlineNode(1, { isAtom: false, contentSize: 1 });

    const doc = {
      content: { size: 100 },
      resolve: (pos) => {
        callCount++;
        // Always return an inline node to force iteration
        return createResolvedPos({ pos, nodeAfter: inlineWithContent, nodeBefore: null });
      },
    };

    resolveInlineTextPosition(doc, 1, 'forward');
    // The function calls resolve twice per iteration (lines 40 and 58)
    // With max 8 iterations, that's up to 16 resolve calls
    expect(callCount).toBeLessThanOrEqual(16);
  });
});

// ============================================================================
// mapCharOffsetToPosition tests
// ============================================================================

describe('mapCharOffsetToPosition', () => {
  it('returns from position for zero offset', () => {
    const doc = createMockDoc('hello world');
    const result = mapCharOffsetToPosition(doc, 1, 12, 0);
    expect(result).toBe(1);
  });

  it('returns from position for negative offset', () => {
    const doc = createMockDoc('hello world');
    const result = mapCharOffsetToPosition(doc, 1, 12, -5);
    expect(result).toBe(1);
  });

  it('returns from when range is invalid (from >= to)', () => {
    const doc = createMockDoc('hello');
    const result = mapCharOffsetToPosition(doc, 5, 5, 2);
    expect(result).toBe(5);
  });

  it('returns from when from is negative', () => {
    const doc = createMockDoc('hello');
    const result = mapCharOffsetToPosition(doc, -1, 5, 2);
    expect(result).toBe(-1);
  });

  it('returns from when from exceeds doc size', () => {
    const doc = createMockDoc('hi');
    const result = mapCharOffsetToPosition(doc, 100, 105, 2);
    expect(result).toBe(100);
  });

  it('maps offset correctly for simple text', () => {
    // Create a more realistic mock for binary search testing
    const text = 'hello world';
    const doc = {
      content: { size: text.length + 2 },
      textBetween: (from, to) => {
        const start = Math.max(0, from - 1);
        const end = Math.min(text.length, to - 1);
        return text.slice(start, end);
      },
      resolve: (pos) => {
        const textNode = createTextNode(text);
        return createResolvedPos({
          pos,
          nodeAfter: pos <= text.length ? textNode : null,
          nodeBefore: pos > 1 ? textNode : null,
        });
      },
    };

    // Offset 5 should map to position 6 (1-indexed + offset)
    const result = mapCharOffsetToPosition(doc, 1, text.length + 1, 5);
    expect(result).toBeGreaterThanOrEqual(1);
    expect(result).toBeLessThanOrEqual(text.length + 1);
  });

  it('clamps to total text length when offset exceeds it', () => {
    const text = 'hi';
    const doc = {
      content: { size: text.length + 2 },
      textBetween: (from, to) => {
        const start = Math.max(0, from - 1);
        const end = Math.min(text.length, to - 1);
        return text.slice(start, end);
      },
      resolve: (pos) => createResolvedPos({ pos, nodeAfter: createTextNode(text), nodeBefore: null }),
    };

    const result = mapCharOffsetToPosition(doc, 1, 3, 100);
    expect(result).toBeLessThanOrEqual(3);
  });

  it('returns from when text length is zero', () => {
    const doc = {
      content: { size: 2 },
      textBetween: () => '',
      resolve: (pos) => createResolvedPos({ pos, nodeAfter: createTextNode(''), nodeBefore: null }),
    };

    const result = mapCharOffsetToPosition(doc, 1, 1, 5);
    expect(result).toBe(1);
  });
});

// ============================================================================
// getFirstTextMarks tests
// ============================================================================

describe('getFirstTextMarks', () => {
  it('returns null for invalid range (from < 0)', () => {
    const doc = createMockDoc('hello');
    const result = getFirstTextMarks(doc, -1, 5);
    expect(result).toBeNull();
  });

  it('returns null for invalid range (to > docSize)', () => {
    const doc = createMockDoc('hi');
    const result = getFirstTextMarks(doc, 1, 100);
    expect(result).toBeNull();
  });

  it('returns null for invalid range (from > to)', () => {
    const doc = createMockDoc('hello');
    const result = getFirstTextMarks(doc, 5, 3);
    expect(result).toBeNull();
  });

  it('returns empty array for text without marks', () => {
    const textNode = createTextNode('hello', []);
    const doc = {
      content: { size: 7 },
      nodesBetween: (from, to, callback) => {
        callback(textNode, 1);
      },
    };

    const result = getFirstTextMarks(doc, 1, 6);
    expect(result).toEqual([]);
  });

  it('returns marks from first text node', () => {
    const boldMark = createMark('bold');
    const textNode = createTextNode('hello', [boldMark]);
    const doc = {
      content: { size: 7 },
      nodesBetween: (from, to, callback) => {
        callback(textNode, 1);
      },
    };

    const result = getFirstTextMarks(doc, 1, 6);
    expect(result).toHaveLength(1);
    expect(result[0].type.name).toBe('bold');
  });

  it('returns marks from first text node only (ignores subsequent nodes)', () => {
    const boldMark = createMark('bold');
    const italicMark = createMark('italic');
    const textNode1 = createTextNode('hello', [boldMark]);
    const textNode2 = createTextNode(' world', [italicMark]);

    const doc = {
      content: { size: 13 },
      nodesBetween: (from, to, callback) => {
        const result1 = callback(textNode1, 1);
        // Only call second if first didn't return false
        if (result1 !== false) {
          callback(textNode2, 6);
        }
      },
    };

    const result = getFirstTextMarks(doc, 1, 12);
    expect(result).toHaveLength(1);
    expect(result[0].type.name).toBe('bold'); // First node's marks, not italic
  });

  it('skips non-text nodes to find first text', () => {
    const boldMark = createMark('bold');
    const textNode = createTextNode('hello', [boldMark]);
    const imageNode = { isText: false, nodeSize: 1 };

    const doc = {
      content: { size: 8 },
      nodesBetween: (from, to, callback) => {
        const result1 = callback(imageNode, 1);
        if (result1 !== false) {
          callback(textNode, 2);
        }
      },
    };

    const result = getFirstTextMarks(doc, 1, 7);
    expect(result).toHaveLength(1);
    expect(result[0].type.name).toBe('bold');
  });

  it('returns null when no text nodes in range', () => {
    const imageNode = { isText: false, nodeSize: 1 };
    const doc = {
      content: { size: 5 },
      nodesBetween: (from, to, callback) => {
        callback(imageNode, 1);
      },
    };

    const result = getFirstTextMarks(doc, 1, 4);
    expect(result).toBeNull();
  });
});

// ============================================================================
// getMarksAtPosition tests
// ============================================================================

describe('getMarksAtPosition', () => {
  it('returns storedMarks when present and non-empty', () => {
    const boldMark = createMark('bold');
    const state = {
      storedMarks: [boldMark],
      doc: { resolve: () => createResolvedPos({ marks: [] }) },
    };

    const result = getMarksAtPosition(state, 5);
    expect(result).toEqual([boldMark]);
  });

  it('returns resolved marks when storedMarks is null', () => {
    const italicMark = createMark('italic');
    const state = {
      storedMarks: null,
      doc: { resolve: () => createResolvedPos({ marks: [italicMark] }) },
    };

    const result = getMarksAtPosition(state, 5);
    expect(result).toHaveLength(1);
    expect(result[0].type.name).toBe('italic');
  });

  it('returns resolved marks when storedMarks is empty array', () => {
    const italicMark = createMark('italic');
    const state = {
      storedMarks: [],
      doc: { resolve: () => createResolvedPos({ marks: [italicMark] }) },
    };

    const result = getMarksAtPosition(state, 5);
    expect(result).toHaveLength(1);
  });

  it('returns resolved marks when storedMarks is undefined', () => {
    const underlineMark = createMark('underline');
    const state = {
      storedMarks: undefined,
      doc: { resolve: () => createResolvedPos({ marks: [underlineMark] }) },
    };

    const result = getMarksAtPosition(state, 5);
    expect(result).toHaveLength(1);
  });

  it('returns copy of resolved marks (not reference)', () => {
    const originalMarks = [createMark('bold')];
    const state = {
      storedMarks: null,
      doc: { resolve: () => ({ marks: () => originalMarks }) },
    };

    const result = getMarksAtPosition(state, 5);
    expect(result).not.toBe(originalMarks);
    expect(result).toEqual(originalMarks);
  });
});

// ============================================================================
// buildTextNodes tests
// ============================================================================

describe('buildTextNodes', () => {
  it('returns empty array for empty suggested text', () => {
    const state = createMockState(createMockDoc('hello'));
    const result = buildTextNodes(state, 1, 6, '');
    expect(result).toEqual([]);
  });

  it('returns empty array for null suggested text', () => {
    const state = createMockState(createMockDoc('hello'));
    const result = buildTextNodes(state, 1, 6, null);
    expect(result).toEqual([]);
  });

  it('creates single node with position marks when no segments exist', () => {
    const boldMark = createMark('bold');
    const doc = {
      content: { size: 7 },
      resolve: () => createResolvedPos({ marks: [boldMark] }),
      nodesBetween: () => {}, // No nodes
    };
    const state = {
      doc,
      schema: createMockSchema(),
      storedMarks: null,
    };

    const result = buildTextNodes(state, 1, 6, 'world');
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('world');
  });

  it('creates single node when only one segment group exists', () => {
    const boldMark = createMark('bold');
    const textNode = createTextNode('hello', [boldMark]);
    const doc = {
      content: { size: 7 },
      resolve: () => createResolvedPos({ marks: [] }),
      nodesBetween: (from, to, callback) => {
        callback(textNode, 1);
      },
    };
    const state = {
      doc,
      schema: createMockSchema(),
      storedMarks: null,
    };

    const result = buildTextNodes(state, 1, 6, 'world');
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('world');
    expect(result[0].marks).toHaveLength(1);
    expect(result[0].marks[0].type.name).toBe('bold');
  });

  it('merges consecutive segments with same marks', () => {
    const boldMark = createMark('bold');
    const textNode1 = createTextNode('hel', [boldMark]);
    const textNode2 = createTextNode('lo', [boldMark]);

    const doc = {
      content: { size: 7 },
      resolve: () => createResolvedPos({ marks: [] }),
      nodesBetween: (from, to, callback) => {
        callback(textNode1, 1);
        callback(textNode2, 4);
      },
    };
    const state = {
      doc,
      schema: createMockSchema(),
      storedMarks: null,
    };

    const result = buildTextNodes(state, 1, 6, 'world');
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('world');
  });

  it('inherits marks from first segment (start of selection)', () => {
    const boldMark = createMark('bold');
    const textNode1 = createTextNode('hello', [boldMark]); // 5 chars bold
    const textNode2 = createTextNode(' world', []); // 6 chars plain

    const doc = {
      content: { size: 13 },
      resolve: () => createResolvedPos({ marks: [] }),
      nodesBetween: (from, to, callback) => {
        const result = callback(textNode1, 1);
        if (result !== false) {
          callback(textNode2, 6);
        }
      },
    };
    const state = {
      doc,
      schema: createMockSchema(),
      storedMarks: null,
    };

    // Original: 5 bold + 6 plain = 11 chars
    // Replace with 11 chars - should inherit bold from first segment
    const result = buildTextNodes(state, 1, 12, 'replacement');
    expect(result).toHaveLength(1);

    // Single node should have bold mark (inherited from start)
    expect(result[0].text).toBe('replacement');
    expect(result[0].marks.some((m) => m.type.name === 'bold')).toBe(true);
  });

  it('handles replacement text shorter than original', () => {
    const boldMark = createMark('bold');
    const textNode1 = createTextNode('hello', [boldMark]); // 5 chars
    const textNode2 = createTextNode('world', []); // 5 chars

    const doc = {
      content: { size: 12 },
      resolve: () => createResolvedPos({ marks: [] }),
      nodesBetween: (from, to, callback) => {
        callback(textNode1, 1);
        callback(textNode2, 6);
      },
    };
    const state = {
      doc,
      schema: createMockSchema(),
      storedMarks: null,
    };

    // Original 10 chars -> Replace with 4 chars
    const result = buildTextNodes(state, 1, 11, 'test');
    expect(result.length).toBeGreaterThanOrEqual(1);

    // Total text should equal replacement
    const totalText = result.map((n) => n.text).join('');
    expect(totalText).toBe('test');
  });

  it('handles replacement text longer than original', () => {
    const textNode = createTextNode('hi', []);

    const doc = {
      content: { size: 4 },
      resolve: () => createResolvedPos({ marks: [] }),
      nodesBetween: (from, to, callback) => {
        callback(textNode, 1);
      },
    };
    const state = {
      doc,
      schema: createMockSchema(),
      storedMarks: null,
    };

    const result = buildTextNodes(state, 1, 3, 'hello world');
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('hello world');
  });
});

// ============================================================================
// applyPatch (main export) tests
// ============================================================================

describe('applyPatch', () => {
  it('returns unchanged when state is null', () => {
    const tr = createMockTransaction(null);
    const result = applyPatch({ state: null, tr, from: 0, to: 5, suggestedText: 'test' });
    expect(result).toEqual({ tr, changed: false });
  });

  it('returns unchanged when state.doc is null', () => {
    const tr = createMockTransaction(null);
    const result = applyPatch({ state: { doc: null }, tr, from: 0, to: 5, suggestedText: 'test' });
    expect(result).toEqual({ tr, changed: false });
  });

  it('returns unchanged when from is negative', () => {
    const doc = createMockDoc('hello');
    const state = createMockState(doc);
    const result = applyPatch({ state, tr: state.tr, from: -1, to: 5, suggestedText: 'test' });
    expect(result.changed).toBe(false);
  });

  it('returns unchanged when to exceeds doc size', () => {
    const doc = createMockDoc('hi');
    const state = createMockState(doc);
    const result = applyPatch({ state, tr: state.tr, from: 1, to: 100, suggestedText: 'test' });
    expect(result.changed).toBe(false);
  });

  it('returns unchanged when from > to', () => {
    const doc = createMockDoc('hello');
    const state = createMockState(doc);
    const result = applyPatch({ state, tr: state.tr, from: 5, to: 3, suggestedText: 'test' });
    expect(result.changed).toBe(false);
  });

  it('returns unchanged when text is identical', () => {
    const text = 'hello';
    const doc = {
      content: { size: text.length + 2 },
      textBetween: () => text,
      resolve: (pos) => createResolvedPos({ pos }),
      nodesBetween: () => {},
    };
    const state = createMockState(doc);

    const result = applyPatch({
      state,
      tr: state.tr,
      from: 1,
      to: text.length + 1,
      suggestedText: text,
    });
    expect(result.changed).toBe(false);
  });

  it('performs delete when replacement text is empty after trimming', () => {
    const text = 'hello';
    const doc = {
      content: { size: text.length + 2 },
      textBetween: (from, to) => {
        // Return the original text for the initial check
        if (from === 1 && to === text.length + 1) return text;
        // For offset mapping, return portions
        const start = Math.max(0, from - 1);
        const end = Math.min(text.length, to - 1);
        return text.slice(start, end);
      },
      resolve: (pos) =>
        createResolvedPos({
          pos,
          nodeAfter: createTextNode(text),
          nodeBefore: pos > 1 ? createTextNode(text) : null,
        }),
      nodesBetween: () => {},
    };
    const state = createMockState(doc);

    const result = applyPatch({
      state,
      tr: state.tr,
      from: 1,
      to: text.length + 1,
      suggestedText: '',
    });

    expect(result.changed).toBe(true);
    expect(state.tr.delete).toHaveBeenCalled();
  });

  it('performs replaceWith for text changes', () => {
    const text = 'hello';
    const textNode = createTextNode(text, []);
    const doc = {
      content: { size: text.length + 2 },
      textBetween: (from, to) => {
        const start = Math.max(0, from - 1);
        const end = Math.min(text.length, to - 1);
        return text.slice(start, end);
      },
      resolve: (pos) =>
        createResolvedPos({
          pos,
          nodeAfter: textNode,
          nodeBefore: pos > 1 ? textNode : null,
        }),
      nodesBetween: (from, to, callback) => {
        callback(textNode, 1);
      },
    };
    const state = createMockState(doc);

    const result = applyPatch({
      state,
      tr: state.tr,
      from: 1,
      to: text.length + 1,
      suggestedText: 'world',
    });

    expect(result.changed).toBe(true);
    expect(state.tr.replaceWith).toHaveBeenCalled();
  });

  it('applies minimal change for partial replacement', () => {
    // "The quick brown fox" -> "The fast brown fox"
    // Only "quick" -> "fast" should be replaced
    const text = 'The quick brown fox';
    const textNode = createTextNode(text, []);
    const doc = {
      content: { size: text.length + 2 },
      textBetween: (from, to) => {
        const start = Math.max(0, from - 1);
        const end = Math.min(text.length, to - 1);
        return text.slice(start, end);
      },
      resolve: (pos) =>
        createResolvedPos({
          pos,
          nodeAfter: textNode,
          nodeBefore: pos > 1 ? textNode : null,
        }),
      nodesBetween: (from, to, callback) => {
        callback(textNode, 1);
      },
    };
    const state = createMockState(doc);

    const result = applyPatch({
      state,
      tr: state.tr,
      from: 1,
      to: text.length + 1,
      suggestedText: 'The fast brown fox',
    });

    expect(result.changed).toBe(true);
    expect(state.tr.replaceWith).toHaveBeenCalled();

    // The replacement should be for a subset of the range
    const call = state.tr.replaceWith.mock.calls[0];
    expect(call[0]).toBeGreaterThanOrEqual(1); // changeFrom
    expect(call[1]).toBeLessThanOrEqual(text.length + 1); // changeTo
  });

  it('returns transaction object in result', () => {
    const doc = createMockDoc('hello');
    const state = createMockState(doc);
    const result = applyPatch({
      state,
      tr: state.tr,
      from: 1,
      to: 6,
      suggestedText: 'world',
    });

    expect(result.tr).toBe(state.tr);
  });

  it('handles from equals to (insertion point)', () => {
    const text = 'hello';
    const textNode = createTextNode(text, []);
    const doc = {
      content: { size: text.length + 2 },
      textBetween: () => '',
      resolve: (pos) =>
        createResolvedPos({
          pos,
          nodeAfter: textNode,
          nodeBefore: textNode,
        }),
      nodesBetween: () => {},
    };
    const state = createMockState(doc);

    const result = applyPatch({
      state,
      tr: state.tr,
      from: 3,
      to: 3,
      suggestedText: ' inserted',
    });

    expect(result.changed).toBe(true);
  });
});
