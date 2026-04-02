import { resolveStateEditor } from './context.js';
import type { ToolbarCommandState, ToolbarContext } from '../types.js';

export const isCommandDisabled = (context: ToolbarContext | null) => {
  if (!context || !context.isEditable) return true;
  const editor = context.presentationEditor?.editor ?? context.editor;
  const documentMode = editor?.options?.documentMode;
  return documentMode === 'viewing';
};

export const createDisabledStateDeriver =
  (options?: { withValue?: boolean }) =>
  ({ context }: { context: ToolbarContext | null }): ToolbarCommandState => {
    const disabled = isCommandDisabled(context);

    if (options?.withValue) {
      return {
        active: false,
        disabled,
        value: null,
      };
    }

    return {
      active: false,
      disabled,
    };
  };

export const createDirectCommandExecute =
  (commandName: string) =>
  ({ context, payload }: { context: any; payload?: unknown }) => {
    const editor = resolveStateEditor(context);
    const command = commandName ? editor?.commands[commandName] : null;
    if (typeof command !== 'function') return false;
    const result = payload === undefined ? command() : command(payload);
    return Boolean(result);
  };
