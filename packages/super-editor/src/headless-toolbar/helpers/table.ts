import { isInTable } from '../../editors/v1/core/helpers/isInTable.js';
import { resolveStateEditor } from './context.js';
import { isCommandDisabled } from './general.js';
import type { ToolbarCommandState, ToolbarContext } from '../types.js';

export const createTableActionsStateDeriver =
  () =>
  ({ context }: { context: ToolbarContext | null }): ToolbarCommandState => {
    const editor = resolveStateEditor(context);
    const inTable = editor?.state?.selection?.$head ? isInTable(editor.state) : false;
    const disabled = isCommandDisabled(context) || !inTable;

    return {
      active: false,
      disabled,
    };
  };
