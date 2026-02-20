import { closeHistory } from 'prosemirror-history';
import { Extension } from '../Extension.js';
import { isIOS } from '../utilities/isIOS.js';
import { isMacOS } from '../utilities/isMacOS.js';

export const handleEnter = (editor) => {
  const { view } = editor;
  // Close the current undo group so this structural action becomes its own undo step.
  // Note: this fires before the command chain, so if no command succeeds (rare — e.g.
  // Enter with no valid split target) an empty undo boundary is created. Acceptable
  // trade-off vs. the complexity of post-hoc closeHistory after commands.first.
  view?.dispatch?.(closeHistory(view?.state?.tr));

  return editor.commands.first(({ commands }) => [
    () => commands.splitRunToParagraph(),
    () => commands.newlineInCode(),
    () => commands.createParagraphNear(),
    () => commands.liftEmptyBlock(),
    () => commands.splitBlock(),
  ]);
};

export const handleBackspace = (editor) => {
  const { view } = editor;
  // Close undo group — see comment in handleEnter.
  view?.dispatch?.(closeHistory(view?.state?.tr));

  return editor.commands.first(({ commands, tr }) => [
    () => commands.undoInputRule(),
    () => {
      tr.setMeta('inputType', 'deleteContentBackward');
      return false;
    },
    () => commands.backspaceEmptyRunParagraph(),
    () => commands.backspaceSkipEmptyRun(),
    () => commands.backspaceNextToRun(),
    () => commands.deleteSelection(),
    () => commands.removeNumberingProperties(),
    () => commands.joinBackward(),
    () => commands.selectNodeBackward(),
  ]);
};

export const handleDelete = (editor) => {
  const { view } = editor;
  // Close undo group — see comment in handleEnter.
  view?.dispatch?.(closeHistory(view?.state?.tr));

  return editor.commands.first(({ commands }) => [
    () => commands.deleteSkipEmptyRun(),
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
