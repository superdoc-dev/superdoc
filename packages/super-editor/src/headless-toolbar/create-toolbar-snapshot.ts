import { resolveToolbarSources } from './resolve-toolbar-sources.js';
import type { BuiltInToolbarRegistryEntry } from './internal-types.js';
import type {
  CreateHeadlessToolbarOptions,
  HeadlessToolbarSuperdocHost,
  PublicToolbarItemId,
  ToolbarCommandStates,
  ToolbarSnapshot,
} from './types.js';

const buildCommandStateMap = ({
  commands = [],
  superdoc,
  context,
  toolbarRegistry,
}: {
  commands?: PublicToolbarItemId[];
  superdoc: HeadlessToolbarSuperdocHost;
  context: ToolbarSnapshot['context'];
  toolbarRegistry: Partial<Record<PublicToolbarItemId, BuiltInToolbarRegistryEntry>>;
}): ToolbarCommandStates => {
  const entries = commands.map((command) => {
    const entry = toolbarRegistry[command];

    if (!entry) {
      return [
        command,
        {
          active: false,
          disabled: true,
        },
      ] as const;
    }

    return [command, entry.state({ context, superdoc })] as const;
  });

  return Object.fromEntries(entries) as ToolbarCommandStates;
};

export const createToolbarSnapshot = ({
  superdoc,
  commands = [],
  toolbarRegistry,
}: CreateHeadlessToolbarOptions & {
  toolbarRegistry: Partial<Record<PublicToolbarItemId, BuiltInToolbarRegistryEntry>>;
}): ToolbarSnapshot => {
  const { context } = resolveToolbarSources(superdoc);
  const snapshot = {
    context,
    commands: buildCommandStateMap({ commands, superdoc, context, toolbarRegistry }),
  };
  return snapshot;
};
