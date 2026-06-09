import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { SuperDocUIProvider, useSetSuperDoc, useSuperDocUI } from './provider.js';
import {
  useSuperDocCommand,
  useSuperDocComments,
  useSuperDocContentControls,
  useSuperDocFontOptions,
  useSuperDocTrackChanges,
  useSuperDocSelection,
  useSuperDocToolbar,
} from './hooks.js';

function makeSuperdocStub(
  overrides: {
    selectionInfo?: unknown;
    documentFontOptions?: Array<{ logicalFamily: string; previewFamily: string }>;
  } = {},
) {
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
    fonts: {
      getDocumentFontOptions: vi.fn(() => overrides.documentFontOptions ?? []),
    },
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

  it('useSuperDocComments / useSuperDocTrackChanges / useSuperDocContentControls / useSuperDocToolbar return initial empties before ready', () => {
    let comments: ReturnType<typeof useSuperDocComments> | undefined;
    let trackChanges: ReturnType<typeof useSuperDocTrackChanges> | undefined;
    let contentControls: ReturnType<typeof useSuperDocContentControls> | undefined;
    let toolbar: ReturnType<typeof useSuperDocToolbar> | undefined;

    function Probe() {
      comments = useSuperDocComments();
      trackChanges = useSuperDocTrackChanges();
      contentControls = useSuperDocContentControls();
      toolbar = useSuperDocToolbar();
      return null;
    }

    render(
      <SuperDocUIProvider>
        <Probe />
      </SuperDocUIProvider>,
    );

    expect(comments).toEqual({ items: [], activeIds: [], total: 0 });
    expect(trackChanges).toEqual({ items: [], total: 0, activeId: null, authors: [] });
    expect(contentControls).toEqual({ items: [], activeIds: [], activeId: null, total: 0 });
    expect(toolbar).toEqual({ context: null, commands: {} });
  });

  it('useSuperDocFontOptions returns defaults plus active document fonts', () => {
    let options: ReturnType<typeof useSuperDocFontOptions> | undefined;
    let setSuperDoc: ReturnType<typeof useSetSuperDoc> | undefined;

    function Probe() {
      options = useSuperDocFontOptions();
      setSuperDoc = useSetSuperDoc();
      return null;
    }

    render(
      <SuperDocUIProvider>
        <Probe />
      </SuperDocUIProvider>,
    );

    expect(options).toEqual([]);

    act(() => {
      setSuperDoc!(
        makeSuperdocStub({
          documentFontOptions: [{ logicalFamily: 'Aptos', previewFamily: 'Aptos' }],
        }),
      );
    });

    expect(options?.map((option) => option.label)).toEqual([
      'Aptos',
      'Arial',
      'Calibri',
      'Courier New',
      'Helvetica',
      'Times New Roman',
    ]);
    expect(options?.find((option) => option.label === 'Aptos')).toEqual({
      label: 'Aptos',
      value: 'Aptos',
      previewFamily: 'Aptos',
    });
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

  // Regression for PR #3011 review comment: useSuperDocCommand must
  // resubscribe when the id prop changes while the same controller
  // stays mounted. A toolbar that maps over a config array of command
  // ids and reuses one component instance per slot would otherwise
  // observe the wrong command when the id changes.
  it('useSuperDocCommand resubscribes when the id changes', async () => {
    let setSuperDoc: ReturnType<typeof useSetSuperDoc> | undefined;
    const captured: Array<{ id: string; source: string; value: unknown }> = [];

    function Probe({ id }: { id: string }) {
      const cmd = useSuperDocCommand(id);
      setSuperDoc = useSetSuperDoc();
      captured.push({ id, source: cmd.source, value: cmd.value });
      return <span>{id}</span>;
    }

    const { rerender } = render(
      <SuperDocUIProvider>
        <Probe id='ai.first' />
      </SuperDocUIProvider>,
    );

    // Stub a controller, then register two distinct custom commands so
    // each id has a state distinguishable in the snapshot.
    const stub = makeSuperdocStub();
    act(() => {
      setSuperDoc!(stub);
    });

    // Reach into the controller via context to register custom commands
    // with distinct values per id. Use the public ui.commands.register
    // surface.
    let registered = false;
    function Register() {
      const ui = useSuperDocUI();
      if (ui && !registered) {
        registered = true;
        ui.commands.register({ id: 'ai.first', execute: () => true, getState: () => ({ value: 'A' }) });
        ui.commands.register({ id: 'ai.second', execute: () => true, getState: () => ({ value: 'B' }) });
      }
      return null;
    }
    rerender(
      <SuperDocUIProvider>
        <Probe id='ai.first' />
        <Register />
      </SuperDocUIProvider>,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Probe with id='ai.second' now. If the hook fails to resubscribe,
    // the captured value will keep showing 'A' (stale).
    rerender(
      <SuperDocUIProvider>
        <Probe id='ai.second' />
        <Register />
      </SuperDocUIProvider>,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // The most recent capture for id='ai.second' must reflect the
    // ai.second command's value, not ai.first's.
    const lastForSecond = [...captured].reverse().find((c) => c.id === 'ai.second');
    expect(lastForSecond).toBeDefined();
    expect(lastForSecond!.value).toBe('B');
    expect(lastForSecond!.source).toBe('custom');
  });
});
