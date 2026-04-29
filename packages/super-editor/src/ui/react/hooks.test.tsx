import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { SuperDocUIProvider, useSetSuperDoc } from './provider.js';
import {
  useSuperDocCommand,
  useSuperDocComments,
  useSuperDocReview,
  useSuperDocSelection,
  useSuperDocToolbar,
} from './hooks.js';

function makeSuperdocStub(overrides: { selectionInfo?: unknown } = {}) {
  const editorListeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const superdocListeners = new Map<string, Set<(...args: unknown[]) => void>>();

  const editor = {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!editorListeners.has(event)) editorListeners.set(event, new Set());
      editorListeners.get(event)!.add(handler);
    }),
    off: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      editorListeners.get(event)?.delete(handler);
    }),
    state: { selection: { empty: true, from: 0, to: 0 } },
    options: { documentId: 'doc-1', isHeaderOrFooter: false },
    commands: {},
    isEditable: true,
    doc: {
      selection: {
        current: vi.fn(
          () =>
            overrides.selectionInfo ?? {
              empty: true,
              target: null,
              activeMarks: [],
              activeCommentIds: [],
              activeChangeIds: [],
            },
        ),
      },
    },
  };

  return {
    activeEditor: editor,
    config: { documentMode: 'editing' as const },
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!superdocListeners.has(event)) superdocListeners.set(event, new Set());
      superdocListeners.get(event)!.add(handler);
    }),
    off: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      superdocListeners.get(event)?.delete(handler);
    }),
  };
}

let warnSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warnSpy.mockRestore();
});

describe('domain hooks', () => {
  it('useSuperDocSelection returns the empty default before ready, then the live slice', () => {
    let selection: ReturnType<typeof useSuperDocSelection> | undefined;
    let setSuperDoc: ReturnType<typeof useSetSuperDoc> | undefined;

    function Probe() {
      selection = useSuperDocSelection();
      setSuperDoc = useSetSuperDoc();
      return null;
    }

    render(
      <SuperDocUIProvider>
        <Probe />
      </SuperDocUIProvider>,
    );

    expect(selection).toEqual({
      empty: true,
      target: null,
      selectionTarget: null,
      activeMarks: [],
      activeCommentIds: [],
      activeChangeIds: [],
      quotedText: '',
    });

    act(() => {
      setSuperDoc!(
        makeSuperdocStub({
          selectionInfo: {
            empty: false,
            text: 'hello',
            target: {
              kind: 'text',
              segments: [{ blockId: 'p1', range: { start: 0, end: 5 } }],
            },
            activeMarks: ['bold'],
            activeCommentIds: ['c1'],
            activeChangeIds: [],
          },
        }),
      );
    });

    expect(selection?.empty).toBe(false);
    expect(selection?.target?.segments[0]).toEqual({ blockId: 'p1', range: { start: 0, end: 5 } });
    // SD-2812: selectionTarget mirrors the TextTarget for downstream
    // doc-api point/range operations.
    expect(selection?.selectionTarget).toEqual({
      kind: 'selection',
      start: { kind: 'text', blockId: 'p1', offset: 0 },
      end: { kind: 'text', blockId: 'p1', offset: 5 },
    });
    expect(selection?.activeMarks).toEqual(['bold']);
    expect(selection?.activeCommentIds).toEqual(['c1']);
  });

  it('useSuperDocComments / useSuperDocReview / useSuperDocToolbar return initial empties before ready', () => {
    let comments: ReturnType<typeof useSuperDocComments> | undefined;
    let review: ReturnType<typeof useSuperDocReview> | undefined;
    let toolbar: ReturnType<typeof useSuperDocToolbar> | undefined;

    function Probe() {
      comments = useSuperDocComments();
      review = useSuperDocReview();
      toolbar = useSuperDocToolbar();
      return null;
    }

    render(
      <SuperDocUIProvider>
        <Probe />
      </SuperDocUIProvider>,
    );

    expect(comments).toEqual({ items: [], activeIds: [], total: 0 });
    expect(review).toEqual({ items: [], openCount: 0, activeId: null });
    expect(toolbar).toEqual({ context: null, commands: {} });
  });

  it('useSuperDocCommand returns the disabled fallback for unknown ids', () => {
    let cmd: ReturnType<typeof useSuperDocCommand> | undefined;
    let setSuperDoc: ReturnType<typeof useSetSuperDoc> | undefined;

    function Probe() {
      cmd = useSuperDocCommand('not-a-real-command');
      setSuperDoc = useSetSuperDoc();
      return null;
    }

    render(
      <SuperDocUIProvider>
        <Probe />
      </SuperDocUIProvider>,
    );

    // Pre-ready: fallback.
    expect(cmd).toEqual({ active: false, disabled: true, value: undefined, source: 'built-in' });

    act(() => {
      setSuperDoc!(makeSuperdocStub());
    });

    // Post-ready, unknown id: still the fallback.
    expect(cmd).toEqual({ active: false, disabled: true, value: undefined, source: 'built-in' });
  });

  it('useSuperDocCommand returns the live snapshot for built-in ids', () => {
    let cmd: ReturnType<typeof useSuperDocCommand> | undefined;
    let setSuperDoc: ReturnType<typeof useSetSuperDoc> | undefined;

    function Probe() {
      cmd = useSuperDocCommand('bold');
      setSuperDoc = useSetSuperDoc();
      return null;
    }

    render(
      <SuperDocUIProvider>
        <Probe />
      </SuperDocUIProvider>,
    );

    act(() => {
      setSuperDoc!(makeSuperdocStub());
    });

    // The stub doesn't populate per-command state, so bold lands on the
    // built-in snapshot's default disabled posture (no editor context).
    expect(cmd?.source).toBe('built-in');
    expect(typeof cmd?.disabled).toBe('boolean');
  });
});
