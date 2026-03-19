import { getActiveFormatting } from '../core/helpers/getActiveFormatting.js';
import { resolveToolbarSources } from './resolve-toolbar-sources.js';
import type { CreateHeadlessToolbarOptions, ToolbarCommandState, ToolbarContext, ToolbarSnapshot } from './types.js';

const COMMAND_TO_FORMATTING_MARK = {
  toggleBold: 'bold',
  toggleItalic: 'italic',
} as const;

const resolveStateEditor = (context: ToolbarContext | null) => {
  if (!context) return null;
  return 'getActiveEditor' in context.editor ? context.editor.getActiveEditor() : context.editor;
};

const buildDisabledCommandStateMap = (commands: string[]): Record<string, ToolbarCommandState> => {
  const entries = commands.map((command) => [
    command,
    {
      active: false,
      disabled: true,
    },
  ]);
  return Object.fromEntries(entries);
};

const buildCommandStateMap = (
  commands: string[] = [],
  snapshot: Pick<ToolbarSnapshot, 'context'>,
): Record<string, ToolbarCommandState> => {
  const { context } = snapshot;
  const stateEditor = resolveStateEditor(context);
  const formatting = stateEditor ? getActiveFormatting(stateEditor) : [];
  const isDisabled = !context || !context.isEditable;

  // POC behavior: when there is no usable editing context, or the current
  // context is not editable, toolbar commands are treated as fully disabled.
  // Richer built-in command rules can be layered on later if needed.
  if (isDisabled) {
    return buildDisabledCommandStateMap(commands);
  }

  // POC behavior: command-state derivation is keyed by raw command names.
  // A more production-ready API will likely move toward toolbar item ids or
  // richer descriptors, with internal mapping to built-in command semantics.
  const entries = commands.map((command) => {
    const commandKey = COMMAND_TO_FORMATTING_MARK[command as keyof typeof COMMAND_TO_FORMATTING_MARK] ?? null;

    return [
      command,
      {
        active: commandKey ? formatting.some((mark) => mark.name === commandKey) : false,
        disabled: false,
      },
    ];
  });

  return Object.fromEntries(entries);
};

export const createToolbarSnapshot = ({ superdoc, commands = [] }: CreateHeadlessToolbarOptions): ToolbarSnapshot => {
  const { context } = resolveToolbarSources(superdoc);
  return {
    context,
    commands: buildCommandStateMap(commands, { context }),
  };
};
