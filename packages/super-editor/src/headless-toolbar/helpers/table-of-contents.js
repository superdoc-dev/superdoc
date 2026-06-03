import { insertTableOfContentsAtSelection } from '../../editors/v1/extensions/table-of-contents/table-of-contents-insertion.js';
import { resolveStateEditor } from './context.js';

export const createTableOfContentsInsertExecute =
  () =>
  ({ context }) => {
    const editor = resolveStateEditor(context);
    if (!editor) return false;
    return insertTableOfContentsAtSelection(editor);
  };
