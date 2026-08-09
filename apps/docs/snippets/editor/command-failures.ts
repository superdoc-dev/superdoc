import type { CommandExecutionResult, CommandState, SuperDocUIReason } from 'superdoc/ui';

export const explainUnavailableCommand = (state: CommandState): string | null => {
  if (state.enabled) return null;

  const messages: Partial<Record<SuperDocUIReason, string>> = {
    'not-ready': 'The document is still loading.',
    'document-readonly': 'Switch from viewing mode before editing.',
    'selection-required': 'Place the cursor in the document first.',
    'range-selection-required': 'Select some text first.',
    'table-context-unavailable': 'Place the cursor inside a table first.',
    'content-control-locked': 'This field does not allow formatting changes.',
    'command-unsupported': 'This action is not available in this SuperDoc build.',
  };

  return state.reason
    ? (messages[state.reason] ?? 'This action is currently unavailable.')
    : 'This action is unavailable.';
};

export const explainCommandResult = (result: CommandExecutionResult): string => {
  if (result === false) return 'The command could not be routed.';
  if (result === true) return 'The command completed.';
  if (!result.success) return `${result.failure.code}: ${result.failure.message}`;
  return 'The command completed.';
};
