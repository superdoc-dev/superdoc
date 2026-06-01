/**
 * Spec F — §17.11.14 endnote customMarkFollows: when an endnote reference carries
 * customMarkFollows="1", the endnote body must NOT receive the synthetic leading
 * marker. Mirrors the footnote behavior in FootnotesBuilder.
 */
import { describe, it, expect, vi } from 'vitest';
import type { EditorState } from 'prosemirror-state';
import { buildEndnoteBlocks } from '../layout/EndnotesBuilder.js';
import type { ConverterContext } from '@core/layout-adapter/converter-context.js';

vi.mock('@core/layout-adapter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@core/layout-adapter')>();
  return {
    ...actual,
    toFlowBlocks: vi.fn((_doc: unknown, opts?: { blockIdPrefix?: string }) => {
      if (typeof opts?.blockIdPrefix === 'string') {
        const id = opts.blockIdPrefix.replace('endnote-', '').replace(/-$/, '');
        return {
          blocks: [
            {
              kind: 'paragraph',
              runs: [{ kind: 'text', text: `Endnote ${id} text`, pmStart: 0, pmEnd: 10 }],
            },
          ],
          bookmarks: new Map(),
        };
      }
      return { blocks: [], bookmarks: new Map() };
    }),
  };
});

const ENDNOTE_MARKER_DATA_ATTR = 'data-sd-endnote-number';

function makeEditorState(refs: Array<{ id: string; pos: number; customMarkFollows?: unknown }>): EditorState {
  return {
    doc: {
      content: { size: 1000 },
      descendants: (cb: (node: unknown, pos: number) => boolean | void) => {
        refs.forEach(({ id, pos, customMarkFollows }) => {
          cb({ type: { name: 'endnoteReference' }, attrs: { id, customMarkFollows } }, pos);
        });
        return false;
      },
    },
  } as unknown as EditorState;
}

function makeConverter(endnotes: Array<{ id: string; content: unknown[] }>) {
  return { endnotes };
}

function makeCtx(endnoteNumberById: Record<string, number>): ConverterContext {
  return { endnoteNumberById } as ConverterContext;
}

describe('buildEndnoteBlocks — customMarkFollows suppresses body marker (§17.11.14)', () => {
  it('injects leading marker for a normal endnote ref', () => {
    const editorState = makeEditorState([{ id: '1', pos: 10 }]);
    const converter = makeConverter([{ id: '1', content: [{ type: 'paragraph' }] }]);
    const ctx = makeCtx({ '1': 1 });

    const blocks = buildEndnoteBlocks(editorState, converter, ctx, undefined);

    const firstRun = (blocks[0] as { runs?: Array<{ dataAttrs?: Record<string, string> }> })?.runs?.[0];
    expect(firstRun?.dataAttrs?.[ENDNOTE_MARKER_DATA_ATTR]).toBe('true');
  });

  it('skips the leading marker when ref has customMarkFollows="1"', () => {
    const editorState = makeEditorState([{ id: '1', pos: 10, customMarkFollows: '1' }]);
    const converter = makeConverter([{ id: '1', content: [{ type: 'paragraph' }] }]);
    const ctx = makeCtx({ '1': 1 });

    const blocks = buildEndnoteBlocks(editorState, converter, ctx, undefined);

    const firstRun = (blocks[0] as { runs?: Array<{ text?: string; dataAttrs?: Record<string, string> }> })?.runs?.[0];
    expect(firstRun?.dataAttrs?.[ENDNOTE_MARKER_DATA_ATTR]).toBeUndefined();
    expect(firstRun?.text).toBe('Endnote 1 text');
  });

  it('skips marker for boolean true customMarkFollows', () => {
    const editorState = makeEditorState([{ id: '1', pos: 10, customMarkFollows: true }]);
    const converter = makeConverter([{ id: '1', content: [{ type: 'paragraph' }] }]);
    const ctx = makeCtx({ '1': 1 });

    const blocks = buildEndnoteBlocks(editorState, converter, ctx, undefined);
    const firstRun = (blocks[0] as { runs?: Array<{ dataAttrs?: Record<string, string> }> })?.runs?.[0];
    expect(firstRun?.dataAttrs?.[ENDNOTE_MARKER_DATA_ATTR]).toBeUndefined();
  });

  it('still injects marker for customMarkFollows="0" / "false"', () => {
    const editorState = makeEditorState([{ id: '1', pos: 10, customMarkFollows: '0' }]);
    const converter = makeConverter([{ id: '1', content: [{ type: 'paragraph' }] }]);
    const ctx = makeCtx({ '1': 1 });

    const blocks = buildEndnoteBlocks(editorState, converter, ctx, undefined);
    const firstRun = (blocks[0] as { runs?: Array<{ dataAttrs?: Record<string, string> }> })?.runs?.[0];
    expect(firstRun?.dataAttrs?.[ENDNOTE_MARKER_DATA_ATTR]).toBe('true');
  });
});
