/**
 * SD-3400 area-delete integration: commit of an EMPTIED note runs the REAL
 * removal pipeline (`removeNoteEverywhere`) against a real convertedXml part.
 * Unlike note-story-runtime.test.ts, the footnote-wrappers module is NOT
 * mocked here — only the story-editor factory (DOM-bound) and the
 * part-mutation transaction plumbing are shimmed, with mutatePart applying the
 * mutation directly to the part.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Editor } from '../../core/Editor.js';

const mockCreateStoryEditor = vi.fn();

vi.mock('../../core/story-editor-factory.js', () => ({
  createStoryEditor: (...args: unknown[]) => mockCreateStoryEditor(...args),
}));

vi.mock('../../core/parts/mutation/mutate-part.js', () => ({
  mutatePart: vi.fn(
    (request: { mutate?: (ctx: { part: unknown; dryRun: boolean }) => unknown; editor: Editor; partId: string }) => {
      const converter = (request.editor as unknown as { converter?: { convertedXml?: Record<string, unknown> } })
        .converter;
      const part = converter?.convertedXml?.[request.partId] ?? {};
      request.mutate?.({ part, dryRun: false });
      if (converter?.convertedXml) converter.convertedXml[request.partId] = part;
      return { changed: true, changedPaths: [], degraded: false, result: undefined };
    },
  ),
  closeUndoGroup: vi.fn(),
}));

vi.mock('../../core/parts/mutation/compound-mutation.js', () => ({
  compoundMutation: vi.fn((request: { execute: () => boolean }) => ({ success: request.execute() })),
}));

vi.mock('../helpers/index-cache.js', () => ({
  clearIndexCache: vi.fn(),
}));

const mockTrackChangesState = { isTrackChangesActive: false };
vi.mock('../../extensions/track-changes/plugins/index.js', () => ({
  TrackChangesBasePluginKey: { getState: () => mockTrackChangesState },
}));

import { resolveNoteRuntime } from './note-story-runtime.js';

function makeFootnotesXml(entries: Array<{ id: string }>) {
  return {
    declaration: { attributes: { version: '1.0', encoding: 'UTF-8', standalone: 'yes' } },
    elements: [
      {
        type: 'element',
        name: 'w:footnotes',
        attributes: { 'xmlns:w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main' },
        elements: entries.map((e) => ({
          type: 'element',
          name: 'w:footnote',
          attributes: { 'w:id': e.id },
          elements: [],
        })),
      },
    ],
  };
}

function footnoteElementIds(host: { converter: { convertedXml: Record<string, unknown> } }): string[] {
  const xml = host.converter.convertedXml['word/footnotes.xml'] as {
    elements: Array<{ elements: Array<{ name: string; attributes: Record<string, string> }> }>;
  };
  return xml.elements[0].elements.filter((el) => el.name === 'w:footnote').map((el) => el.attributes['w:id']);
}

/** Host whose body has footnoteReference markers for the given ids. */
function makeHost(refIds: string[]) {
  const doc = {
    descendants: (cb: (node: unknown, pos: number) => boolean | void) => {
      refIds.forEach((id, index) => {
        cb({ type: { name: 'footnoteReference' }, attrs: { id } }, index + 1);
      });
      return true;
    },
    nodeAt: vi.fn(() => ({ nodeSize: 1 })),
  };
  const tr = { delete: vi.fn(), doc };
  return {
    converter: {
      footnotes: [{ id: '1', content: [{ type: 'paragraph' }] }],
      endnotes: [],
      convertedXml: { 'word/footnotes.xml': makeFootnotesXml([{ id: '1' }, { id: '2' }]) },
    },
    state: { doc, tr },
    dispatch: vi.fn(),
    on: vi.fn(),
    emit: vi.fn(),
    safeEmit: vi.fn(() => []),
    options: {},
  } as unknown as Editor & { converter: { convertedXml: Record<string, unknown> } };
}

const footnoteLocator = { kind: 'story' as const, storyType: 'footnote' as const, noteId: '1' };

/** Story editor whose doc is empty (only an empty paragraph). */
const emptiedStoryEditor = () => ({
  state: {
    doc: {
      content: { size: 4 },
      textBetween: () => '',
      descendants: (cb: (n: unknown, p: number) => boolean | void) => {
        cb({ isText: false, isAtom: false, type: { name: 'paragraph' } }, 0);
      },
    },
  },
  schema: {},
  getJSON: () => ({ type: 'doc', content: [{ type: 'paragraph' }] }),
  getUpdatedJson: () => ({ type: 'doc', content: [{ type: 'paragraph' }] }),
  destroy: vi.fn(),
  on: vi.fn(),
});

describe('SD-3400 area-delete integration (real removal pipeline)', () => {
  it('committing an emptied note deletes every body marker and tombstones the w:footnote element', () => {
    mockCreateStoryEditor.mockReturnValueOnce(emptiedStoryEditor() as never);
    // Two references to note 1 (multi-ref) plus an unrelated note 2 marker.
    const host = makeHost(['1', '2', '1']);

    const runtime = resolveNoteRuntime(host, footnoteLocator);
    runtime.commit?.(host);

    // Both markers for note 1 deleted, descending positions (3 then 1).
    expect(host.state.tr.delete).toHaveBeenCalledTimes(2);
    expect((host.state.tr.delete as ReturnType<typeof vi.fn>).mock.calls).toEqual([
      [3, 4],
      [1, 2],
    ]);
    // Tombstone (SD-3400 undo): the w:footnote element STAYS in the part so a
    // single undo restores the whole note; export prunes it while no body
    // reference exists. The id is registered as session-managed.
    expect(footnoteElementIds(host)).toEqual(['1', '2']);
    const converter = (host as unknown as { converter: { sessionManagedNoteIds?: { footnotes: Set<string> } } })
      .converter;
    expect(converter.sessionManagedNoteIds?.footnotes.has('1')).toBe(true);
  });

  it('suggesting mode: committing an emptied note keeps markers and element (no silent tracked divergence)', () => {
    mockTrackChangesState.isTrackChangesActive = true;
    try {
      mockCreateStoryEditor.mockReturnValueOnce(emptiedStoryEditor() as never);
      const host = makeHost(['1', '2']);

      const runtime = resolveNoteRuntime(host, footnoteLocator);
      runtime.commit?.(host);

      // No marker deletes: the auto-removal is gated out of tracked mode.
      expect(host.state.tr.delete).not.toHaveBeenCalled();
      expect(footnoteElementIds(host)).toEqual(['1', '2']);
    } finally {
      mockTrackChangesState.isTrackChangesActive = false;
    }
  });

  it('committing a note that still has content leaves markers and the element alone', () => {
    mockCreateStoryEditor.mockReturnValueOnce({
      ...emptiedStoryEditor(),
      state: {
        doc: {
          content: { size: 10 },
          textBetween: () => 'still here',
          descendants: (cb: (n: unknown, p: number) => boolean | void) => {
            cb({ isText: true, isAtom: true, text: 'still here', type: { name: 'text' } }, 1);
          },
        },
      },
      getUpdatedJson: () => ({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'still here' }] }],
      }),
    } as never);
    const host = makeHost(['1', '2']);

    const runtime = resolveNoteRuntime(host, footnoteLocator);
    runtime.commit?.(host);

    expect(host.state.tr.delete).not.toHaveBeenCalled();
    expect(footnoteElementIds(host)).toEqual(['1', '2']);
  });
});
