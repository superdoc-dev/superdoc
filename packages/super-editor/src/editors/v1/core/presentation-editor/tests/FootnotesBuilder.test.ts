import { describe, it, expect, vi } from 'vitest';
import type { EditorState } from 'prosemirror-state';
import { buildFootnotesInput, type ConverterLike } from '../layout/FootnotesBuilder.js';
import type { ConverterContext } from '@core/layout-adapter/converter-context.js';
import { SUBSCRIPT_SUPERSCRIPT_SCALE } from '@core/layout-adapter/constants.js';

const { mockFootnoteToFlowBlocks } = vi.hoisted(() => ({
  mockFootnoteToFlowBlocks: vi.fn((_doc: unknown, opts?: { blockIdPrefix?: string }) => {
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

vi.mock('@core/layout-adapter', async (importOriginal) => {
  const { buildLayoutDocumentAdapterVitestMock } = await import('./mock-layout-document-adapter-vitest.js');
  return buildLayoutDocumentAdapterVitestMock(importOriginal, { toFlowBlocks: mockFootnoteToFlowBlocks });
});

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

function blocksFromResult(result: ReturnType<typeof buildFootnotesInput>) {
  return result?.blocksById.get('1');
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

    it('stamps converted footnote blocks with the footnote story key', () => {
      const editorState = createMockEditorState([{ id: '1', pos: 10 }]);
      const converter = createMockConverter([
        { id: '1', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Note' }] }] },
      ]);

      buildFootnotesInput(editorState, converter, undefined, undefined);

      const [, options] =
        (
          mockFootnoteToFlowBlocks as unknown as { mock: { calls: Array<[unknown, Record<string, unknown>]> } }
        ).mock.calls.at(-1) ?? [];
      expect(options?.storyKey).toBe('fn:1');
    });

    it('prefers the active note render override over stale converter content', () => {
      const editorState = createMockEditorState([{ id: '1', pos: 10 }]);
      const converter = createMockConverter([
        {
          id: '1',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Stale note' }] }],
        },
      ]);

      buildFootnotesInput(editorState, converter, undefined, undefined, {
        noteId: '1',
        docJson: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Live note' }] }],
        },
      });

      const docArg = (mockFootnoteToFlowBlocks as unknown as { mock: { calls: Array<[any]> } }).mock.calls.at(-1)?.[0];
      expect(docArg).toEqual({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Live note' }] }],
      });
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
      expect(firstRun?.text).toBe('1\u00A0');
      expect(firstRun?.dataAttrs?.['data-sd-footnote-number']).toBe('true');
      expect(firstRun).not.toHaveProperty('pmStart');
      expect(firstRun).not.toHaveProperty('pmEnd');
    });

    it('normalizes away empty note reference runs before layout conversion', () => {
      const editorState = createMockEditorState([{ id: '1', pos: 10 }]);
      const converter = createMockConverter([
        {
          id: '1',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'run', content: [], attrs: { runProperties: { styleId: 'FootnoteReference' } } },
                {
                  type: 'run',
                  content: [{ type: 'text', text: 'Note' }],
                },
              ],
            },
          ],
        },
      ]);

      buildFootnotesInput(editorState, converter, undefined, undefined);

      const docArg = (mockFootnoteToFlowBlocks as unknown as { mock: { calls: Array<[any]> } }).mock.calls.at(-1)?.[0];
      expect(docArg?.content?.[0]?.content).toEqual([
        {
          type: 'run',
          content: [{ type: 'text', text: 'Note' }],
        },
      ]);
    });

    it('normalizes away note separator tabs before layout conversion', () => {
      const editorState = createMockEditorState([{ id: '1', pos: 10 }]);
      const converter = createMockConverter([
        {
          id: '1',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'run', content: [], attrs: { runProperties: { styleId: 'FootnoteReference' } } },
                {
                  type: 'run',
                  content: [{ type: 'tab' }, { type: 'text', text: 'Note' }],
                },
              ],
            },
          ],
        },
      ]);

      buildFootnotesInput(editorState, converter, undefined, undefined);

      const docArg = (mockFootnoteToFlowBlocks as unknown as { mock: { calls: Array<[any]> } }).mock.calls.at(-1)?.[0];
      expect(docArg?.content?.[0]?.content).toEqual([
        {
          type: 'run',
          content: [{ type: 'text', text: 'Note' }],
        },
      ]);
    });

    it('normalizes away hidden passthrough field-code nodes before layout conversion', () => {
      const editorState = createMockEditorState([{ id: '1', pos: 10 }]);
      const converter = createMockConverter([
        {
          id: '1',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'run',
                  content: [{ type: 'text', text: 'Section ' }],
                },
                {
                  type: 'run',
                  content: [{ type: 'passthroughInline', attrs: { originalName: 'w:fldChar' } }],
                },
                {
                  type: 'run',
                  content: [{ type: 'text', text: '1.2(b)' }],
                },
              ],
            },
          ],
        },
      ]);

      buildFootnotesInput(editorState, converter, undefined, undefined);

      const docArg = (mockFootnoteToFlowBlocks as unknown as { mock: { calls: Array<[any]> } }).mock.calls.at(-1)?.[0];
      expect(docArg?.content?.[0]?.content).toEqual([
        {
          type: 'run',
          content: [{ type: 'text', text: 'Section ' }],
        },
        {
          type: 'run',
          content: [{ type: 'text', text: '1.2(b)' }],
        },
      ]);
    });

    it('builds the marker as a scaled superscript run instead of a Unicode superscript glyph', () => {
      const editorState = createMockEditorState([{ id: '1', pos: 10 }]);
      const converter = createMockConverter([
        { id: '1', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Note' }] }] },
      ]);
      const context = createMockConverterContext({ '1': 1 });

      const result = buildFootnotesInput(editorState, converter, context, undefined);

      const firstRun = (
        blocksFromResult(result)?.[0] as {
          runs?: Array<{
            text?: string;
            fontSize?: number;
            vertAlign?: string;
          }>;
        }
      )?.runs?.[0];

      expect(firstRun?.text).toBe('1\u00A0');
      expect(firstRun?.fontSize).toBe(12 * SUBSCRIPT_SUPERSCRIPT_SCALE);
      expect(firstRun?.vertAlign).toBe('superscript');
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
      expect(firstRun?.text).toBe('3\u00A0');
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
      expect(firstRun?.text).toBe('123\u00A0');
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
      expect(firstRun?.text).toBe('1\u00A0');
    });

    it('defaults to 1 when converterContext is undefined', () => {
      const editorState = createMockEditorState([{ id: '1', pos: 10 }]);
      const converter = createMockConverter([
        { id: '1', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Note' }] }] },
      ]);

      const result = buildFootnotesInput(editorState, converter, undefined, undefined);

      const blocks = result?.blocksById.get('1');
      const firstRun = (blocks?.[0] as { runs?: Array<{ text?: string }> })?.runs?.[0];
      expect(firstRun?.text).toBe('1\u00A0');
    });

    // SD-2656: Word's FootnoteReference rStyle is independent of the body run's
    // formatting. The marker must NOT inherit bold/italic/letterSpacing even when
    // the first body text run is bold (e.g. ³**NTD**). Inheriting bold renders
    // the marker as bold too — visibly wrong vs Word.
    it('does NOT inherit bold/italic/letterSpacing from a bold first text run', () => {
      const editorState = createMockEditorState([{ id: '1', pos: 10 }]);
      const converter = createMockConverter([
        { id: '1', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'NTD' }] }] },
      ]);
      const context = createMockConverterContext({ '1': 1 });

      mockFootnoteToFlowBlocks.mockImplementationOnce(() => ({
        blocks: [
          {
            kind: 'paragraph',
            runs: [
              {
                kind: 'text',
                text: 'NTD',
                bold: true,
                italic: true,
                letterSpacing: 5,
                fontFamily: 'Times New Roman',
                fontSize: 12,
                pmStart: 0,
                pmEnd: 3,
              },
            ],
          },
        ],
        bookmarks: new Map(),
      }));

      const result = buildFootnotesInput(editorState, converter, context, undefined);

      const firstRun = (
        blocksFromResult(result)?.[0] as {
          runs?: Array<{ text?: string; bold?: boolean; italic?: boolean; letterSpacing?: number }>;
        }
      )?.runs?.[0];
      expect(firstRun?.text).toBe('1\u00A0');
      expect(firstRun?.bold).toBeUndefined();
      expect(firstRun?.italic).toBeUndefined();
      expect(firstRun?.letterSpacing).toBeUndefined();
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

    it('renders the real note body when a special entry shares the same id', () => {
      // Simulates the ID-collision scenario: continuationSeparator at id=1 (empty
      // content) alongside a real note also at id=1 (with text).  The builder
      // must pick the regular note.
      const editorState = createMockEditorState([{ id: '1', pos: 10 }]);
      const converter = {
        footnotes: [
          { id: '1', type: 'continuationSeparator', content: [] },
          { id: '1', type: null, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Real note' }] }] },
        ],
      } as ConverterLike;

      const result = buildFootnotesInput(editorState, converter, undefined, undefined);

      expect(result).not.toBeNull();
      expect(result?.blocksById.has('1')).toBe(true);
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

    it('does not inject a leading marker run when the ref has customMarkFollows', () => {
      // SD-2658: a customMark footnote's body has no w:footnoteRef in OOXML —
      // the literal symbol in the document body is the entire identification.
      const editorState = {
        doc: {
          content: { size: 100 },
          descendants: (callback: (node: unknown, pos: number) => boolean | void) => {
            callback({ type: { name: 'footnoteReference' }, attrs: { id: '1', customMarkFollows: '1' } }, 10);
            return false;
          },
        },
      } as unknown as EditorState;
      const converter = createMockConverter([
        { id: '1', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Note' }] }] },
      ]);
      const context = createMockConverterContext({ '1': 1 });

      const result = buildFootnotesInput(editorState, converter, context, undefined);

      const blocks = result?.blocksById.get('1');
      const firstRun = (blocks?.[0] as { runs?: Array<{ text?: string; dataAttrs?: Record<string, string> }> })
        ?.runs?.[0];
      expect(firstRun?.dataAttrs?.['data-sd-footnote-number']).toBeUndefined();
      expect(firstRun?.text).toBe('Footnote 1 text');
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
