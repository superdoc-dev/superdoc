/**
 * `preset.*` command runners — CLI/SDK-only operations that proxy the Node SDK
 * preset registry (see `lib/preset-ops.ts`).
 *
 * Six commands:
 *   - `preset list`             — registered preset ids + the default
 *   - `preset get-catalog`      — full catalog for a preset
 *   - `preset get-tools`        — provider-shaped tool array + cache strategy
 *   - `preset get-system-prompt`— preset's SDK system prompt
 *   - `preset get-mcp-prompt`   — preset's MCP system prompt
 *   - `preset dispatch`         — route a tool call into the preset against the
 *                                 live session-bound `editor.doc`
 *
 * The first five are session-less reads (no session resolution, no metadata
 * touch). `preset dispatch` mirrors the `execute_code` command: bind to the
 * active session, run the dispatch against `editor.doc`, then if the doc
 * mutated, mark the session dirty and bump the revision.
 */

import { getBooleanOption, getStringOption, resolveJsonInput, type ParsedArgs } from '../lib/args';
import { assertExpectedRevision, markContextUpdated, withActiveContext, writeContextMetadata } from '../lib/context';
import { exportToPath, openSessionDocument, type EditorWithDoc, type OpenedDocument } from '../lib/document';
import { CliError } from '../lib/errors';
import { parseOperationArgs } from '../lib/operation-args';
import {
  runPresetDispatch,
  runPresetGetCatalog,
  runPresetGetMcpPrompt,
  runPresetGetSystemPrompt,
  runPresetGetTools,
  runPresetList,
} from '../lib/preset-ops';
import { syncCollaborativeSessionSnapshot } from '../lib/session-collab';
import type { CliOperationId } from '../cli';
import type { CommandContext, CommandExecution } from '../lib/types';

// Comma-separated so both the CLI flag form and the JSON-RPC (Python) form
// carry exclusions as one plain string; action/tool names contain no commas.
function parseCsvOption(parsed: ParsedArgs, name: string): readonly string[] | undefined {
  const value = getStringOption(parsed, name);
  if (typeof value !== 'string') return undefined;
  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return entries.length > 0 ? entries : undefined;
}

const TOOL_PROVIDERS = ['openai', 'anthropic', 'vercel', 'generic'] as const;
type ToolProvider = (typeof TOOL_PROVIDERS)[number];

function isToolProvider(value: unknown): value is ToolProvider {
  return typeof value === 'string' && (TOOL_PROVIDERS as readonly string[]).includes(value);
}

function presetFromArg(parsed: ParsedArgs): string | undefined {
  const raw = getStringOption(parsed, 'preset');
  if (typeof raw !== 'string' || raw.length === 0) return undefined;
  return raw;
}

// ---------------------------------------------------------------------------
// preset list
// ---------------------------------------------------------------------------

export async function runPresetListCommand(tokens: string[], _context: CommandContext): Promise<CommandExecution> {
  const { help } = parseOperationArgs('doc.preset.list' as CliOperationId, tokens, { commandName: 'preset list' });
  if (help) {
    return {
      command: 'preset list',
      data: { usage: ['superdoc preset list'] },
      pretty: 'Usage: superdoc preset list',
    };
  }
  const data = runPresetList();
  return {
    command: 'preset list',
    data,
    pretty: `presets: ${data.presets.join(', ')} (default: ${data.defaultPreset})`,
  };
}

// ---------------------------------------------------------------------------
// preset get-catalog
// ---------------------------------------------------------------------------

export async function runPresetGetCatalogCommand(
  tokens: string[],
  _context: CommandContext,
): Promise<CommandExecution> {
  const { parsed, help } = parseOperationArgs('doc.preset.getCatalog' as CliOperationId, tokens, {
    commandName: 'preset get-catalog',
  });
  if (help) {
    return {
      command: 'preset get-catalog',
      data: { usage: ['superdoc preset get-catalog [--preset <id>]'] },
      pretty: 'Usage: superdoc preset get-catalog [--preset <id>]',
    };
  }
  const catalog = await runPresetGetCatalog(presetFromArg(parsed));
  return {
    command: 'preset get-catalog',
    data: catalog as unknown as Record<string, unknown>,
    pretty: `catalog: ${catalog.toolCount} tool(s), contractVersion=${catalog.contractVersion}`,
  };
}

// ---------------------------------------------------------------------------
// preset get-tools
// ---------------------------------------------------------------------------

export async function runPresetGetToolsCommand(tokens: string[], _context: CommandContext): Promise<CommandExecution> {
  const { parsed, help } = parseOperationArgs('doc.preset.getTools' as CliOperationId, tokens, {
    commandName: 'preset get-tools',
  });
  if (help) {
    return {
      command: 'preset get-tools',
      data: {
        usage: [
          'superdoc preset get-tools --provider <openai|anthropic|vercel|generic> [--preset <id>] [--cache] [--excludeActions <a,b>]',
        ],
      },
      pretty:
        'Usage: superdoc preset get-tools --provider <openai|anthropic|vercel|generic> [--preset <id>] [--cache] [--excludeActions <a,b>]',
    };
  }
  const provider = getStringOption(parsed, 'provider');
  if (!isToolProvider(provider)) {
    throw new CliError(
      'INVALID_ARGUMENT',
      `preset get-tools: --provider must be one of ${TOOL_PROVIDERS.join(', ')}; got ${provider ?? '<missing>'}`,
    );
  }
  const cache = getBooleanOption(parsed, 'cache');
  const excludeActions = parseCsvOption(parsed, 'excludeActions');
  const result = await runPresetGetTools(presetFromArg(parsed), provider, cache, excludeActions);
  return {
    command: 'preset get-tools',
    data: result as unknown as Record<string, unknown>,
    pretty: `preset get-tools: provider=${provider} tools=${result.tools.length} cache=${result.cacheStrategy}`,
  };
}

// ---------------------------------------------------------------------------
// preset get-system-prompt / get-mcp-prompt
// ---------------------------------------------------------------------------

export async function runPresetGetSystemPromptCommand(
  tokens: string[],
  _context: CommandContext,
): Promise<CommandExecution> {
  const { parsed, help } = parseOperationArgs('doc.preset.getSystemPrompt' as CliOperationId, tokens, {
    commandName: 'preset get-system-prompt',
  });
  if (help) {
    return {
      command: 'preset get-system-prompt',
      data: { usage: ['superdoc preset get-system-prompt [--preset <id>] [--excludeActions <a,b>]'] },
      pretty: 'Usage: superdoc preset get-system-prompt [--preset <id>] [--excludeActions <a,b>]',
    };
  }
  const prompt = await runPresetGetSystemPrompt(presetFromArg(parsed), parseCsvOption(parsed, 'excludeActions'));
  return {
    command: 'preset get-system-prompt',
    data: { prompt },
    pretty: `system prompt: ${prompt.length} chars`,
  };
}

export async function runPresetGetMcpPromptCommand(
  tokens: string[],
  _context: CommandContext,
): Promise<CommandExecution> {
  const { parsed, help } = parseOperationArgs('doc.preset.getMcpPrompt' as CliOperationId, tokens, {
    commandName: 'preset get-mcp-prompt',
  });
  if (help) {
    return {
      command: 'preset get-mcp-prompt',
      data: { usage: ['superdoc preset get-mcp-prompt [--preset <id>]'] },
      pretty: 'Usage: superdoc preset get-mcp-prompt [--preset <id>]',
    };
  }
  const prompt = await runPresetGetMcpPrompt(presetFromArg(parsed));
  return {
    command: 'preset get-mcp-prompt',
    data: { prompt },
    pretty: `mcp prompt: ${prompt.length} chars`,
  };
}

// ---------------------------------------------------------------------------
// preset dispatch — session-bound mutator
// ---------------------------------------------------------------------------

function makeRevisionReader(editor: EditorWithDoc): () => string | undefined {
  const info = editor.doc.info;
  const boundInfo = typeof info === 'function' ? info.bind(editor.doc) : null;
  return () => {
    if (!boundInfo) return undefined;
    try {
      const result = boundInfo({}) as { revision?: unknown } | undefined;
      const revision = result?.revision;
      return typeof revision === 'string' ? revision : revision != null ? String(revision) : undefined;
    } catch {
      return undefined;
    }
  };
}

function scriptTimeoutMs(commandTimeoutMs: number | undefined): number | undefined {
  return commandTimeoutMs == null ? undefined : Math.max(1, commandTimeoutMs - 1);
}

export async function runPresetDispatchCommand(tokens: string[], context: CommandContext): Promise<CommandExecution> {
  const {
    parsed,
    args: parsedArgs,
    help,
  } = parseOperationArgs('doc.preset.dispatch' as CliOperationId, tokens, {
    commandName: 'preset dispatch',
  });
  if (help) {
    return {
      command: 'preset dispatch',
      data: {
        usage: ['superdoc preset dispatch --session <id> --tool-name <name> --args-json <json> [--preset <id>]'],
      },
      pretty: 'Usage: superdoc preset dispatch --session <id> --tool-name <name> --args-json <json> [--preset <id>]',
    };
  }

  const toolName = getStringOption(parsed, 'tool-name');
  if (typeof toolName !== 'string' || toolName.length === 0) {
    throw new CliError('MISSING_REQUIRED', 'preset dispatch: --tool-name is required.');
  }

  const argsJson = await resolveJsonInput(parsed, 'args');
  const args: Record<string, unknown> =
    argsJson != null && typeof argsJson === 'object' && !Array.isArray(argsJson)
      ? (argsJson as Record<string, unknown>)
      : {};

  const presetId = presetFromArg(parsed);
  const expectedRevision = typeof parsedArgs.expectedRevision === 'number' ? parsedArgs.expectedRevision : undefined;

  return withActiveContext(
    context.io,
    'preset dispatch',
    async ({ metadata, paths }) => {
      assertExpectedRevision(metadata, expectedRevision);
      const isHostMode = context.executionMode === 'host' && context.sessionPool != null;
      const openedRuntime = await openSessionDocument(paths.workingDocPath, context.io, metadata, {
        sessionId: context.sessionId ?? metadata.contextId,
        executionMode: context.executionMode,
        sessionPool: context.sessionPool,
      });
      // Preset dispatch hands the live editor.doc to the SDK preset — a v1-only
      // path. openSessionDocument returns the runtime-neutral handle; narrow it
      // (same defensive guard as legacy-compat's assertV1Opened).
      if (!('editor' in openedRuntime)) {
        throw new CliError('COMMAND_FAILED', 'preset dispatch: expected a v1 editor-backed session.');
      }
      const opened = openedRuntime as OpenedDocument;

      try {
        const readRevision = makeRevisionReader(opened.editor);
        const revisionBefore = readRevision();

        const result = await runPresetDispatch(presetId, toolName, args, opened.editor, {
          excludeActions: parseCsvOption(parsed, 'excludeActions'),
          executeCodeTimeoutMs: scriptTimeoutMs(context.timeoutMs),
        });

        const revisionAfter = readRevision();
        // A rolled-back superdoc_execute_code crash restores the pre-script
        // document, but the restore-dispatch itself bumps the in-host
        // revision — don't let it read as a mutation (that would persist a
        // content-identical file and dirty the session).
        const rolledBack =
          typeof result === 'object' && result != null && (result as { rolledBack?: unknown }).rolledBack === true;
        const mutated =
          !rolledBack && revisionBefore != null && revisionAfter != null && revisionBefore !== revisionAfter;

        let updatedMetadata = metadata;
        if (mutated) {
          if (isHostMode) {
            context.sessionPool!.markDirty(metadata.contextId);
            updatedMetadata = markContextUpdated(context.io, metadata, {
              dirty: true,
              revision: metadata.revision + 1,
            });
            await writeContextMetadata(paths, updatedMetadata);
            context.sessionPool!.updateMetadataRevision(metadata.contextId, updatedMetadata.revision);
          } else if (metadata.sessionType === 'collab') {
            const synced = await syncCollaborativeSessionSnapshot(context.io, metadata, paths, opened.editor);
            updatedMetadata = synced.updatedMetadata;
          } else {
            await exportToPath(opened.editor, paths.workingDocPath, true);
            updatedMetadata = markContextUpdated(context.io, metadata, {
              dirty: true,
              revision: metadata.revision + 1,
            });
            await writeContextMetadata(paths, updatedMetadata);
          }
        }

        return {
          command: 'preset dispatch',
          data: {
            result: result as unknown,
            context: { dirty: updatedMetadata.dirty, revision: updatedMetadata.revision, mutated },
          },
          pretty: `preset dispatch ${toolName} (revision ${updatedMetadata.revision}${mutated ? ', mutated' : ''})`,
        };
      } finally {
        opened.dispose();
      }
    },
    context.sessionId,
    context.executionMode,
  );
}
