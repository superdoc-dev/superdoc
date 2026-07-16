import { closeHistory } from 'prosemirror-history';
import { Extension } from '../Extension.js';
import { isIOS } from '../utilities/isIOS.js';
import { isMacOS } from '../utilities/isMacOS.js';

const dispatchHistoryBoundary = (view) => {
  const tr = view?.state?.tr;
  if (!tr) return;
  view.dispatch?.(closeHistory(tr));
};

/**
 * SD-2368: while an IME composition is active, key handlers must decline.
 *
 * Real keydowns never reach the keymap during composition (prosemirror-view's
 * `inOrNearComposition` guard returns before `handleKeyDown` runs). The only
 * events that arrive here mid-composition are the ones prosemirror-view itself
 * synthesizes from DOM-diff heuristics in `readDOMChange` — e.g. an IME commit
 * that replaces a longer preedit ("ni h") with shorter committed text ("你好")
 * "looks like Backspace". Vanilla ProseMirror survives that because stock
 * Backspace commands fail at a mid-text cursor and the DOM change is applied
 * as-is; our run-aware command chains succeed, which makes ProseMirror discard
 * the committed text and delete a preedit character instead. Declining restores
 * the vanilla fall-through. (Chrome-Android's beforeinput backspace hack has
 * its own fallback delete when the keymap declines, so it keeps working.)
 */
const isComposing = (editor) => editor?.view?.composing === true;

export const handleEnter = (editor) => {
  if (isComposing(editor)) return false;
  const { view } = editor;
  // Close the current undo group so this structural action becomes its own undo step.
  // Note: this fires before the command chain, so if no command succeeds (rare — e.g.
  // Enter with no valid split target) an empty undo boundary is created. Acceptable
  // trade-off vs. the complexity of post-hoc closeHistory after commands.first.
  dispatchHistoryBoundary(view);

  return editor.commands.first(({ commands }) => [
    () => commands.splitRunToParagraph?.() ?? false,
    () => commands.newlineInCode(),
    () => commands.createParagraphNear(),
    () => commands.liftEmptyBlock(),
    () => commands.splitBlock(),
  ]);
};

export const handleBackspace = (editor) => {
  if (isComposing(editor)) return false;
  const { view } = editor;
  // Close undo group — see comment in handleEnter.
  dispatchHistoryBoundary(view);

  return editor.commands.first(({ commands, tr }) => [
    () => commands.undoInputRule(),
    () => {
      tr.setMeta('inputType', 'deleteContentBackward');
      return false;
    },
    () => commands.deleteBlockSdtAtTextBlockStart(),
    () => commands.selectInlineSdtBeforeRunStart(),
    () => commands.selectFootnoteMarkerBefore?.() ?? false,
    () => commands.deleteSelectedNoteMarker?.() ?? false,
    () => commands.selectBlockSdtBeforeTextBlockStart(),
    () => commands.moveIntoBlockSdtBeforeTextBlockStart(),
    () => commands.backspaceEmptyRunParagraph(),
    () => commands.backspaceSkipEmptyRun(),
    () => commands.backspaceAtomBefore(),
    () => commands.backspaceNextToRun(),
    () => commands.backspaceAcrossRuns(),
    () => commands.mixedBidiBackspace?.() ?? false,
    () => commands.deleteSelection(),
    () => commands.removeNumberingProperties(),
    () => commands.joinBackward(),
    () => commands.selectNodeBackward(),
  ]);
};

export const handleDelete = (editor) => {
  if (isComposing(editor)) return false;
  const { view } = editor;
  // Close undo group — see comment in handleEnter.
  dispatchHistoryBoundary(view);

  return editor.commands.first(({ commands }) => [
    () => commands.deleteBlockSdtAtTextBlockStart(),
    () => commands.selectInlineSdtAfterRunEnd(),
    () => commands.selectFootnoteMarkerAfter?.() ?? false,
    () => commands.deleteSelectedNoteMarker?.() ?? false,
    () => commands.selectBlockSdtAfterTextBlockEnd(),
    () => commands.moveIntoBlockSdtAfterTextBlockEnd(),
    () => commands.deleteSkipEmptyRun(),
    () => commands.deleteAtomAfter(),
    () => commands.deleteNextToRun(),
    () => commands.deleteSelection(),
    () => commands.joinForward(),
    () => commands.selectNodeForward(),
  ]);
};

/**
 * For reference.
 * https://github.com/ProseMirror/prosemirror-commands/blob/master/src/commands.ts
 */
export const Keymap = Extension.create({
  name: 'keymap',

  addShortcuts() {
    const baseKeymap = {
      Enter: () => handleEnter(this.editor),
      'Shift-Enter': () => this.editor.commands.insertLineBreak(),
      'Mod-Enter': () => this.editor.commands.insertPageBreak(),
      Backspace: () => handleBackspace(this.editor),
      'Mod-Backspace': () => handleBackspace(this.editor),
      'Shift-Backspace': () => handleBackspace(this.editor),
      Delete: () => handleDelete(this.editor),
      'Mod-Delete': () => handleDelete(this.editor),
      'Mod-a': () => this.editor.commands.selectAll(),
      Tab: () => this.editor.commands.insertTabNode(),
      ArrowLeft: () => this.editor.commands.skipTab(-1),
      ArrowRight: () => this.editor.commands.skipTab(1),
    };

    const pcBaseKeymap = {
      ...baseKeymap,
    };

    const macBaseKeymap = {
      ...baseKeymap,
      'Ctrl-h': () => handleBackspace(this.editor),
      'Alt-Backspace': () => handleBackspace(this.editor),
      'Ctrl-d': () => handleDelete(this.editor),
      'Ctrl-Alt-Backspace': () => handleDelete(this.editor),
      'Alt-Delete': () => handleDelete(this.editor),
      'Alt-d': () => handleDelete(this.editor),
      'Ctrl-a': () => this.editor.commands.selectAll(),
      'Ctrl-e': () => this.editor.commands.selectTextblockEnd(),
      'Ctrl-t': () => this.editor.commands.insertTabChar(),
    };

    if (isMacOS() || isIOS()) {
      return macBaseKeymap;
    }

    return pcBaseKeymap;
  },
});
