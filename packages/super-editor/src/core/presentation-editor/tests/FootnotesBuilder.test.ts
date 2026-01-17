import { describe, it, expect, vi } from 'vitest';
import type { EditorState } from 'prosemirror-state';
import { buildFootnotesInput, type ConverterLike } from '../layout/FootnotesBuilder.js';
import type { ConverterContext } from '@superdoc/pm-adapter';

// Mock toFlowBlocks
vi.mock('@superdoc/pm-adapter', () => ({
  toFlowBlocks: vi.fn((_doc: unknown, opts?: { blockIdPrefix?: string }) => {
    // Return mock blocks based on blockIdPrefix
    if (typeof opts?.blockIdPrefix === 'string') {
      const id = opts.blockIdPrefix.replace('footnote-', '').replace('-', '');
      return {
        blocks: [
          {
            kind: 'paragraph',
            runs: [{ kind: 'text', text: `Footnote ${id} text`, pmStart: 0, pmEnd: 10 }],
          },
        ],
        bookmarks: new Map(),
      };
    }
    return { blocks: [], bookmarks: new Map() };
  }),
}));

// =============================================================================
// Test Helpers
// =============================================================================

function createMockEditorState(refs: Array<{ id: string; pos: number }>): EditorState {
  return {
    doc: {
      content: { size: 1000 },
      descendants: (callback: (node: unknown, pos: number) => boolean | void) => {
        refs.forEach(({ id, pos }) => {
          callback({ type: { name: 'footnoteReference' }, attrs: { id } }, pos);
        });
        return false;
      },
    },
  } as unknown as EditorState;
}

function createMockConverter(footnotes: Array<{ id: string; content: unknown[] }>): ConverterLike {
  return { footnotes };
}

function createMockConverterContext(footnoteNumberById: Record<string, number>): ConverterContext {
  return { footnoteNumberById } as ConverterContext;
}

// =============================================================================
// Tests
// =============================================================================

describe('buildFootnotesInput', () => {
  describe('null/undefined inputs', () => {
    it('returns null when editorState is null', () => {
      const converter = createMockConverter([{ id: '1', content: [{ type: 'paragraph' }] }]);
      const result = buildFootnotesInput(null, converter, undefined, undefined);
      expect(result).toBeNull();
    });

    it('returns null when editorState is undefined', () => {
      const converter = createMockConverter([{ id: '1', content: [{ type: 'paragraph' }] }]);
      const result = buildFootnotesInput(undefined, converter, undefined, undefined);
      expect(result).toBeNull();
    });

    it('returns null when converter is null', () => {
      const editorState = createMockEditorState([{ id: '1', pos: 10 }]);
      const result = buildFootnotesInput(editorState, null, undefined, undefined);
      expect(result).toBeNull();
    });

    it('returns null when converter is undefined', () => {
      const editorState = createMockEditorState([{ id: '1', pos: 10 }]);
      const result = buildFootnotesInput(editorState, undefined, undefined, undefined);
      expect(result).toBeNull();
    });
  });

  describe('empty footnotes', () => {
    it('returns null when converter has no footnotes', () => {
      const editorState = createMockEditorState([{ id: '1', pos: 10 }]);
      const converter = createMockConverter([]);
      const result = buildFootnotesInput(editorState, converter, undefined, undefined);
      expect(result).toBeNull();
    });

    it('returns null when converter.footnotes is not an array', () => {
      const editorState = createMockEditorState([{ id: '1', pos: 10 }]);
      const converter = { footnotes: 'not an array' } as unknown as ConverterLike;
      const result = buildFootnotesInput(editorState, converter, undefined, undefined);
      expect(result).toBeNull();
    });

    it('returns null when document has no footnote references', () => {
      const editorState = createMockEditorState([]);
      const converter = createMockConverter([{ id: '1', content: [{ type: 'paragraph' }] }]);
      const result = buildFootnotesInput(editorState, converter, undefined, undefined);
      expect(result).toBeNull();
    });
  });

  describe('successful builds', () => {
    it('builds input with refs and blocks when footnotes exist', () => {
      const editorState = createMockEditorState([
        { id: '1', pos: 10 },
        { id: '2', pos: 20 },
      ]);
      const converter = createMockConverter([
        { id: '1', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Note 1' }] }] },
        { id: '2', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Note 2' }] }] },
      ]);

      const result = buildFootnotesInput(editorState, converter, undefined, undefined);

      expect(result).not.toBeNull();
      expect(result?.refs).toHaveLength(2);
      expect(result?.refs[0]).toEqual({ id: '1', pos: 11 }); // pos + 1
      expect(result?.refs[1]).toEqual({ id: '2', pos: 21 }); // pos + 1
      expect(result?.blocksById.size).toBe(2);
      expect(result?.blocksById.has('1')).toBe(true);
      expect(result?.blocksById.has('2')).toBe(true);
    });

    it('returns correct default spacing values', () => {
      const editorState = createMockEditorState([{ id: '1', pos: 10 }]);
      const converter = createMockConverter([
        { id: '1', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Note' }] }] },
      ]);

      const result = buildFootnotesInput(editorState, converter, undefined, undefined);

      expect(result?.gap).toBe(2);
      expect(result?.topPadding).toBe(4);
      expect(result?.dividerHeight).toBe(1);
    });

    it('only includes footnotes that are referenced in the document', () => {
      const editorState = createMockEditorState([{ id: '1', pos: 10 }]); // Only ref 1 in doc
      const converter = createMockConverter([
        { id: '1', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Note 1' }] }] },
        { id: '2', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Note 2' }] }] },
        { id: '3', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Note 3' }] }] },
      ]);

      const result = buildFootnotesInput(editorState, converter, undefined, undefined);

      expect(result?.blocksById.size).toBe(1);
      expect(result?.blocksById.has('1')).toBe(true);
      expect(result?.blocksById.has('2')).toBe(false);
      expect(result?.blocksById.has('3')).toBe(false);
    });
  });

  describe('footnote marker insertion', () => {
    it('adds superscript marker to footnote content', () => {
      const editorState = createMockEditorState([{ id: '1', pos: 10 }]);
      const converter = createMockConverter([
        { id: '1', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Note' }] }] },
      ]);
      const context = createMockConverterContext({ '1': 1 });

      const result = buildFootnotesInput(editorState, converter, context, undefined);

      const blocks = result?.blocksById.get('1');
      expect(blocks).toBeDefined();
      expect(blocks?.[0]?.kind).toBe('paragraph');

      const firstRun = (blocks?.[0] as { runs?: Array<{ text?: string; dataAttrs?: Record<string, string> }> })
        ?.runs?.[0];
      expect(firstRun?.text).toBe('¹');
      expect(firstRun?.dataAttrs?.['data-sd-footnote-number']).toBe('true');
    });

    it('uses correct display number from context', () => {
      const editorState = createMockEditorState([{ id: '5', pos: 10 }]);
      const converter = createMockConverter([
        { id: '5', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Note' }] }] },
      ]);
      const context = createMockConverterContext({ '5': 3 }); // Display as 3rd footnote

      const result = buildFootnotesInput(editorState, converter, context, undefined);

      const blocks = result?.blocksById.get('5');
      const firstRun = (blocks?.[0] as { runs?: Array<{ text?: string }> })?.runs?.[0];
      expect(firstRun?.text).toBe('³');
    });

    it('handles multi-digit display numbers', () => {
      const editorState = createMockEditorState([{ id: '1', pos: 10 }]);
      const converter = createMockConverter([
        { id: '1', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Note' }] }] },
      ]);
      const context = createMockConverterContext({ '1': 123 });

      const result = buildFootnotesInput(editorState, converter, context, undefined);

      const blocks = result?.blocksById.get('1');
      const firstRun = (blocks?.[0] as { runs?: Array<{ text?: string }> })?.runs?.[0];
      expect(firstRun?.text).toBe('¹²³');
    });

    it('defaults to 1 when footnoteNumberById is missing entry', () => {
      const editorState = createMockEditorState([{ id: '99', pos: 10 }]);
      const converter = createMockConverter([
        { id: '99', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Note' }] }] },
      ]);
      const context = createMockConverterContext({}); // No entry for '99'

      const result = buildFootnotesInput(editorState, converter, context, undefined);

      const blocks = result?.blocksById.get('99');
      const firstRun = (blocks?.[0] as { runs?: Array<{ text?: string }> })?.runs?.[0];
      expect(firstRun?.text).toBe('¹');
    });

    it('defaults to 1 when converterContext is undefined', () => {
      const editorState = createMockEditorState([{ id: '1', pos: 10 }]);
      const converter = createMockConverter([
        { id: '1', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Note' }] }] },
      ]);

      const result = buildFootnotesInput(editorState, converter, undefined, undefined);

      const blocks = result?.blocksById.get('1');
      const firstRun = (blocks?.[0] as { runs?: Array<{ text?: string }> })?.runs?.[0];
      expect(firstRun?.text).toBe('¹');
    });
  });

  describe('edge cases', () => {
    it('handles footnote with empty content array', () => {
      const editorState = createMockEditorState([{ id: '1', pos: 10 }]);
      const converter = createMockConverter([{ id: '1', content: [] }]);

      const result = buildFootnotesInput(editorState, converter, undefined, undefined);

      // Should return null because blocksById would be empty
      expect(result).toBeNull();
    });

    it('handles footnote with null content', () => {
      const editorState = createMockEditorState([{ id: '1', pos: 10 }]);
      const converter = { footnotes: [{ id: '1', content: null }] } as unknown as ConverterLike;

      const result = buildFootnotesInput(editorState, converter, undefined, undefined);

      expect(result).toBeNull();
    });

    it('handles numeric footnote IDs', () => {
      const editorState = createMockEditorState([{ id: '1', pos: 10 }]);
      const converter = { footnotes: [{ id: 1, content: [{ type: 'paragraph' }] }] } as unknown as ConverterLike;

      const result = buildFootnotesInput(editorState, converter, undefined, undefined);

      expect(result).not.toBeNull();
      expect(result?.blocksById.has('1')).toBe(true);
    });

    it('handles duplicate footnote references in document', () => {
      const editorState = createMockEditorState([
        { id: '1', pos: 10 },
        { id: '1', pos: 30 }, // Same ID at different position
      ]);
      const converter = createMockConverter([
        { id: '1', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Note 1' }] }] },
      ]);

      const result = buildFootnotesInput(editorState, converter, undefined, undefined);

      expect(result?.refs).toHaveLength(2);
      expect(result?.refs[0]).toEqual({ id: '1', pos: 11 });
      expect(result?.refs[1]).toEqual({ id: '1', pos: 31 });
      // But only one entry in blocksById
      expect(result?.blocksById.size).toBe(1);
    });

    it('handles footnote ref with null id', () => {
      const editorState = {
        doc: {
          content: { size: 1000 },
          descendants: (callback: (node: unknown, pos: number) => boolean | void) => {
            callback({ type: { name: 'footnoteReference' }, attrs: { id: null } }, 10);
            return false;
          },
        },
      } as unknown as EditorState;
      const converter = createMockConverter([{ id: '1', content: [{ type: 'paragraph' }] }]);

      const result = buildFootnotesInput(editorState, converter, undefined, undefined);

      expect(result).toBeNull(); // No valid refs found
    });

    it('clamps pos to doc content size', () => {
      const editorState = {
        doc: {
          content: { size: 15 },
          descendants: (callback: (node: unknown, pos: number) => boolean | void) => {
            callback({ type: { name: 'footnoteReference' }, attrs: { id: '1' } }, 20); // pos > content.size
            return false;
          },
        },
      } as unknown as EditorState;
      const converter = createMockConverter([
        { id: '1', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Note' }] }] },
      ]);

      const result = buildFootnotesInput(editorState, converter, undefined, undefined);

      expect(result?.refs[0]?.pos).toBe(15); // Clamped to doc.content.size
    });
  });
});
