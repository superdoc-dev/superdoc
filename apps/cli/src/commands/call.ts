import { ensureValidArgs, getBooleanOption, parseCommandArgs, resolveJsonInput, type OptionSpec } from '../lib/args';
import { CliError } from '../lib/errors';
import { normalizeJsonValue } from '../lib/input-readers';
import { executeOperation } from '../lib/operation-executor';
import { validateOperationResponseData } from '../lib/operation-args';
import type { CommandContext, CommandExecution } from '../lib/types';
import { CLI_COMMAND_SPECS, CLI_OPERATION_COMMAND_KEYS, CLI_OPERATION_METADATA, type CliOperationId } from '../cli';

const CALL_OPTION_SPECS: OptionSpec[] = [
  { name: 'input-json', type: 'string' },
  { name: 'input-file', type: 'string' },
  { name: 'help', type: 'boolean', aliases: ['h'] },
];

const OPERATION_IDS = new Set<CliOperationId>(Object.keys(CLI_OPERATION_METADATA) as CliOperationId[]);

const OPERATION_IDS_BY_COMMAND_KEY = new Map<string, Set<CliOperationId>>();
for (const spec of CLI_COMMAND_SPECS) {
  const operationId = spec.operationId as CliOperationId;
  const existing = OPERATION_IDS_BY_COMMAND_KEY.get(spec.key);
  if (existing) {
    existing.add(operationId);
    continue;
  }
  OPERATION_IDS_BY_COMMAND_KEY.set(spec.key, new Set([operationId]));
}

function resolveOperationId(query: string | undefined): CliOperationId {
  const normalizedQuery = query?.trim();
  if (!normalizedQuery) {
    throw new CliError('MISSING_REQUIRED', 'call: missing required <operationId>.');
  }

  if (OPERATION_IDS.has(normalizedQuery as CliOperationId)) {
    return normalizedQuery as CliOperationId;
  }

  const byCommand = OPERATION_IDS_BY_COMMAND_KEY.get(normalizedQuery);
  if (byCommand && byCommand.size === 1) {
    return [...byCommand][0];
  }

  if (byCommand && byCommand.size > 1) {
    const candidates = [...byCommand].sort();
    throw new CliError('INVALID_ARGUMENT', `call: command key "${normalizedQuery}" is ambiguous.`, {
      operationIds: candidates,
    });
  }

  throw new CliError('TARGET_NOT_FOUND', `call: unknown operation "${normalizedQuery}".`);
}

function parseHelpExecution(): CommandExecution {
  return {
    command: 'call',
    data: {
      usage: [
        'superdoc call <operationId> [--input-json "{...}"|--input-file payload.json]',
        'superdoc call doc.find --input-json \'{"doc":"./file.docx","query":{"select":{"type":"text","pattern":"test"}}}\'',
      ],
    },
    pretty: [
      'Usage:',
      '  superdoc call <operationId> [--input-json "{...}"|--input-file payload.json]',
      '  superdoc call doc.find --input-json \'{"doc":"./file.docx","query":{"select":{"type":"text","pattern":"test"}}}\'',
    ].join('\n'),
  };
}

export async function runCall(tokens: string[], context: CommandContext): Promise<CommandExecution> {
  const parsed = parseCommandArgs(tokens, CALL_OPTION_SPECS);
  ensureValidArgs(parsed);

  const help = getBooleanOption(parsed, 'help');
  if (help) return parseHelpExecution();

  const operationQuery = parsed.positionals.join(' ');
  const operationId = resolveOperationId(operationQuery);
  const input = (await resolveJsonInput(parsed, 'input')) ?? {};
  const operationExecution = await executeOperation({
    mode: 'call',
    operationId,
    input,
    context,
  });
  const normalizedResult = normalizeJsonValue(operationExecution.data, 'call');
  validateOperationResponseData(operationId, normalizedResult, CLI_OPERATION_COMMAND_KEYS[operationId]);

  return {
    command: 'call',
    data: {
      operationId,
      result: normalizedResult,
    },
    pretty: JSON.stringify(
      {
        operationId,
        result: normalizedResult,
      },
      null,
      2,
    ),
  };
}
