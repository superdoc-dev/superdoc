import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NoteSessionCoordinator } from './NoteSessionCoordinator.js';
import type { RenderedNoteTarget } from './note-target.js';

// Minimal PM-doc fakes for isNoteContentEmpty (walks descendants for text/atoms).
const emptyDoc = () =>
  ({
    descendants: (cb: (node: unknown) => boolean | void) => {
      cb({ isText: false, isAtom: false, type: { name: 'paragraph' } });
    },
  }) as never;

const docWithText = () =>
  ({
    descendants: (cb: (node: unknown) => boolean | void) => {
      cb({ isText: false, isAtom: false, type: { name: 'paragraph' } });
      cb({ isText: true, isAtom: true, text: 'note text', type: { name: 'text' } });
    },
  }) as never;

type FakeSessionEditor = {
  state: { doc: never };
  on: (event: string, cb: () => void) => void;
  off: (event: string, cb: () => void) => void;
  emitUpdate: () => void;
};

const makeSessionEditor = (doc: never): FakeSessionEditor => {
  const handlers = new Set<() => void>();
  const editor: FakeSessionEditor = {
    state: { doc },
    on: (event, cb) => {
      if (event === 'update') handlers.add(cb);
    },
    off: (event, cb) => {
      if (event === 'update') handlers.delete(cb);
    },
    emitUpdate: () => {
      handlers.forEach((cb) => cb());
    },
  };
  return editor;
};

const TARGET: RenderedNoteTarget = { storyType: 'footnote', noteId: '2' };

describe('NoteSessionCoordinator', () => {
  let host: HTMLElement;
  let scroller: HTMLElement;
  let hasActiveSession: ReturnType<typeof vi.fn>;
  let exitActiveSession: ReturnType<typeof vi.fn>;
  let coordinator: NoteSessionCoordinator;
  let scrollIntoViewSpy: ReturnType<typeof vi.fn>;

  const addFragment = (blockId: string): HTMLElement => {
    const el = document.createElement('div');
    el.setAttribute('data-block-id', blockId);
    host.appendChild(el);
    return el;
  };

  beforeEach(() => {
    host = document.createElement('div');
    scroller = document.createElement('div');
    document.body.append(host, scroller);
    hasActiveSession = vi.fn(() => true);
    exitActiveSession = vi.fn();
    scrollIntoViewSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewSpy as never;
    coordinator = new NoteSessionCoordinator({
      getHost: () => host,
      getScrollContainer: () => scroller,
      hasActiveSession,
      exitActiveSession,
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('highlights only the active note fragments and clears them on exit', () => {
    const noteFrag = addFragment('footnote-2-ABC123');
    const otherNote = addFragment('footnote-9-DEF456');
    const bodyFrag = addFragment('para-uuid');

    coordinator.onActivated(TARGET, { editor: makeSessionEditor(docWithText()) });

    expect(noteFrag.classList.contains('sd-note-session-active')).toBe(true);
    expect(otherNote.classList.contains('sd-note-session-active')).toBe(false);
    expect(bodyFrag.classList.contains('sd-note-session-active')).toBe(false);

    coordinator.onExit();
    expect(noteFrag.classList.contains('sd-note-session-active')).toBe(false);
  });

  it('re-applies the highlight after a repaint rebuilds the fragments', () => {
    addFragment('footnote-2-ABC123');
    coordinator.onActivated(TARGET, { editor: makeSessionEditor(docWithText()) });

    host.innerHTML = '';
    const rebuilt = addFragment('footnote-2-NEWHASH');
    coordinator.onPaint();

    expect(rebuilt.classList.contains('sd-note-session-active')).toBe(true);
  });

  it('self-heals when the session ended through another path', () => {
    const frag = addFragment('footnote-2-ABC123');
    coordinator.onActivated(TARGET, { editor: makeSessionEditor(docWithText()) });
    expect(frag.classList.contains('sd-note-session-active')).toBe(true);

    hasActiveSession.mockReturnValue(false);
    coordinator.onPaint();
    expect(frag.classList.contains('sd-note-session-active')).toBe(false);
  });

  it('keeps the scroll pending until the fragment paints, then scrolls once', () => {
    // Activated before the (inserted) note has painted — nothing to scroll yet.
    coordinator.onActivated(TARGET, { editor: makeSessionEditor(docWithText()) });
    expect(scrollIntoViewSpy).not.toHaveBeenCalled();

    addFragment('footnote-2-ABC123');
    coordinator.onPaint();
    expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1);

    coordinator.onPaint();
    expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1); // not re-scrolled
  });

  it('does not scroll when the note is already fully visible', () => {
    const frag = addFragment('footnote-2-ABC123');
    frag.getBoundingClientRect = vi.fn(() => ({ top: 100, bottom: 160 }) as DOMRect);
    scroller.getBoundingClientRect = vi.fn(() => ({ top: 0, bottom: 500 }) as DOMRect);

    coordinator.onActivated(TARGET, { editor: makeSessionEditor(docWithText()) });

    expect(scrollIntoViewSpy).not.toHaveBeenCalled();
  });

  it('never auto-exits when the note is emptied: the user stays in the note area (SD-3400)', async () => {
    // Word-like boundary: emptying a note keeps the caret in the (now empty)
    // note; the removal and renumbering happen at session EXIT (the commit
    // path removes emptied notes). Auto-exiting here is what used to eject
    // the user into the body mid-Backspace.
    addFragment('footnote-2-ABC123');
    const sessionEditor = makeSessionEditor(docWithText());
    coordinator.onActivated(TARGET, { editor: sessionEditor });

    sessionEditor.state.doc = emptyDoc();
    sessionEditor.emitUpdate();
    await Promise.resolve();

    expect(exitActiveSession).not.toHaveBeenCalled();
  });
});
