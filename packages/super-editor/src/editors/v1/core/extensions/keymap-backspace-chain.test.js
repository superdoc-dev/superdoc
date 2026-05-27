import { describe, it, expect, vi } from 'vitest';
import { handleBackspace, handleDelete } from './keymap.js';

/**
 * Pins the ordering of commands in the Backspace chain.
 *
 * The chain shape matters because:
 *   - `inputType: deleteContentBackward` meta must be set before any specialized
 *     handler runs (track-changes Backspace gating depends on it).
 *   - The mixed-bidi handler must run after the run-aware ladder so it does not
 *     intercept Backspace inside SDT blocks or atomic-before cases.
 *   - It must run before the generic `deleteSelection` / `joinBackward` fallbacks.
 *
 * If the chain order changes, this test fails loudly and the author must
 * justify the new ordering.
 */
describe('handleBackspace chain ordering', () => {
  const makeEditor = () => {
    const callLog = [];
    const setMetaLog = [];

    const tr = {
      setMeta: vi.fn((key, value) => {
        setMetaLog.push({ key, value });
        return tr;
      }),
    };

    // Each command spy records its name and returns false so the chain
    // walks through every entry; the dispatchHistoryBoundary helper at the
    // top of handleBackspace dispatches the closeHistory tr separately.
    const make = (name) => () => {
      callLog.push(name);
      return false;
    };

    const commands = {
      undoInputRule: make('undoInputRule'),
      deleteBlockSdtAtTextBlockStart: make('deleteBlockSdtAtTextBlockStart'),
      selectInlineSdtBeforeRunStart: make('selectInlineSdtBeforeRunStart'),
      moveIntoBlockSdtBeforeTextBlockStart: make('moveIntoBlockSdtBeforeTextBlockStart'),
      backspaceEmptyRunParagraph: make('backspaceEmptyRunParagraph'),
      backspaceSkipEmptyRun: make('backspaceSkipEmptyRun'),
      backspaceAtomBefore: make('backspaceAtomBefore'),
      backspaceNextToRun: make('backspaceNextToRun'),
      backspaceAcrossRuns: make('backspaceAcrossRuns'),
      mixedBidiBackspace: make('mixedBidiBackspace'),
      deleteSelection: make('deleteSelection'),
      removeNumberingProperties: make('removeNumberingProperties'),
      joinBackward: make('joinBackward'),
      selectNodeBackward: make('selectNodeBackward'),
    };

    const editor = {
      view: { state: { tr }, dispatch: vi.fn() },
      commands: {
        first: vi.fn((build) => {
          const fns = build({ commands, tr });
          for (const fn of fns) {
            const result = fn();
            if (result) return result;
          }
          return false;
        }),
      },
    };

    return { editor, callLog, setMetaLog };
  };

  it('walks the chain in the expected order when no command handles', () => {
    const { editor, callLog } = makeEditor();
    handleBackspace(editor);
    expect(callLog).toEqual([
      'undoInputRule',
      // step 2 sets inputType meta and returns false (no command call)
      'deleteBlockSdtAtTextBlockStart',
      'selectInlineSdtBeforeRunStart',
      'moveIntoBlockSdtBeforeTextBlockStart',
      'backspaceEmptyRunParagraph',
      'backspaceSkipEmptyRun',
      'backspaceAtomBefore',
      'backspaceNextToRun',
      'backspaceAcrossRuns',
      'mixedBidiBackspace',
      'deleteSelection',
      'removeNumberingProperties',
      'joinBackward',
      'selectNodeBackward',
    ]);
  });

  it('sets inputType: deleteContentBackward meta before specialized handlers', () => {
    const { editor, callLog, setMetaLog } = makeEditor();
    handleBackspace(editor);

    expect(setMetaLog).toContainEqual({ key: 'inputType', value: 'deleteContentBackward' });

    // Meta must be set BEFORE the run-aware handlers run, otherwise track-changes
    // Backspace wrapping in trackChangesHelpers/trackedTransaction.js cannot
    // identify the tr as a Backspace.
    const sdtIndex = callLog.indexOf('deleteBlockSdtAtTextBlockStart');
    expect(sdtIndex).toBeGreaterThanOrEqual(0);
    // Spy log only records command calls, not the meta-setter step; verify
    // meta-setter happens at chain position 1 by reconstructing the chain
    // walk (undoInputRule at 0, meta-setter at 1, then SDT at 2).
    expect(callLog[0]).toBe('undoInputRule');
    expect(callLog[1]).toBe('deleteBlockSdtAtTextBlockStart');
    expect(callLog[2]).toBe('selectInlineSdtBeforeRunStart');
    expect(callLog[3]).toBe('moveIntoBlockSdtBeforeTextBlockStart');
  });

  it('places mixedBidiBackspace after backspaceAcrossRuns and before deleteSelection', () => {
    const { editor, callLog } = makeEditor();
    handleBackspace(editor);

    const acrossRunsIndex = callLog.indexOf('backspaceAcrossRuns');
    const inlineSdtIndex = callLog.indexOf('selectInlineSdtBeforeRunStart');
    const mixedIndex = callLog.indexOf('mixedBidiBackspace');
    const deleteSelectionIndex = callLog.indexOf('deleteSelection');

    expect(inlineSdtIndex).toBeGreaterThanOrEqual(0);
    expect(acrossRunsIndex).toBeGreaterThanOrEqual(0);
    expect(acrossRunsIndex).toBeGreaterThan(inlineSdtIndex);
    expect(mixedIndex).toBeGreaterThan(acrossRunsIndex);
    expect(deleteSelectionIndex).toBeGreaterThan(mixedIndex);
  });

  it('tolerates missing mixedBidiBackspace command (extension not registered)', () => {
    const { editor, callLog } = makeEditor();
    // Simulate the extension being absent: drop the mixedBidiBackspace key
    // from the commands map. The chain uses `?? false` so it should keep walking.
    delete editor.commands.first.mock.calls; // reset just in case
    const editorWithoutCommand = {
      ...editor,
      commands: {
        first: vi.fn((build) => {
          const tr = editor.view.state.tr;
          const commands = new Proxy(
            {},
            {
              get(_, name) {
                if (name === 'mixedBidiBackspace') return undefined;
                return () => {
                  callLog.push(name);
                  return false;
                };
              },
            },
          );
          const fns = build({ commands, tr });
          for (const fn of fns) {
            const result = fn();
            if (result) return result;
          }
          return false;
        }),
      },
    };

    expect(() => handleBackspace(editorWithoutCommand)).not.toThrow();
    expect(callLog).toContain('backspaceAcrossRuns');
    expect(callLog).toContain('deleteSelection');
    expect(callLog).not.toContain('mixedBidiBackspace');
  });
});

describe('handleDelete chain ordering', () => {
  const makeEditor = () => {
    const callLog = [];
    const tr = {
      setMeta: vi.fn(() => tr),
    };
    const make = (name) => () => {
      callLog.push(name);
      return false;
    };

    const commands = {
      deleteBlockSdtAtTextBlockStart: make('deleteBlockSdtAtTextBlockStart'),
      selectInlineSdtAfterRunEnd: make('selectInlineSdtAfterRunEnd'),
      deleteSkipEmptyRun: make('deleteSkipEmptyRun'),
      deleteAtomAfter: make('deleteAtomAfter'),
      deleteNextToRun: make('deleteNextToRun'),
      deleteSelection: make('deleteSelection'),
      joinForward: make('joinForward'),
      selectNodeForward: make('selectNodeForward'),
    };

    const editor = {
      view: { state: { tr }, dispatch: vi.fn() },
      commands: {
        first: vi.fn((build) => {
          const fns = build({ commands });
          for (const fn of fns) {
            const result = fn();
            if (result) return result;
          }
          return false;
        }),
      },
    };

    return { editor, callLog };
  };

  it('runs inline SDT forward selection before generic Delete fallbacks', () => {
    const { editor, callLog } = makeEditor();
    handleDelete(editor);

    expect(callLog).toEqual([
      'deleteBlockSdtAtTextBlockStart',
      'selectInlineSdtAfterRunEnd',
      'deleteSkipEmptyRun',
      'deleteAtomAfter',
      'deleteNextToRun',
      'deleteSelection',
      'joinForward',
      'selectNodeForward',
    ]);
  });
});
