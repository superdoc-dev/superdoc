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

    // Per-command resilience: if a single deriver throws (editor
    // mid-construction, partial PresentationEditor route, test stub
    // not modelling full PM state), default that command to disabled
    // rather than killing the whole snapshot. Other commands still
    // resolve, and the next event tick re-derives once the editor is
    // stable.
    try {
      return [command, entry.state({ context, superdoc })] as const;
    } catch {
      return [
        command,
        {
          active: false,
          disabled: true,
        },
      ] as const;
    }
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
