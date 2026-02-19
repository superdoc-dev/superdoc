import { CliError } from './errors';
import { executeOperation } from './operation-executor';
import type { CommandContext, CommandExecution } from './types';
import { CLI_COMMAND_SPECS, type CliCommandKey, type CliCommandSpec, type CliOperationId } from '../cli';

const OPERATION_ID_BY_COMMAND_KEY = new Map<CliCommandKey, CliOperationId>(
  CLI_COMMAND_SPECS.map((spec) => [spec.key, spec.operationId as CliOperationId]),
);
const COMMAND_SPEC_BY_KEY = new Map<CliCommandKey, CliCommandSpec>(CLI_COMMAND_SPECS.map((spec) => [spec.key, spec]));

function hasHelpFlag(tokens: string[]): boolean {
  return tokens.includes('--help') || tokens.includes('-h');
}

function buildUsageLines(spec: CliCommandSpec): string[] {
  if (spec.examples.length > 0) return [...spec.examples];
  return [`superdoc ${spec.key}`];
}

export async function runCommandWrapper(
  commandKey: CliCommandKey,
  tokens: string[],
  context: CommandContext,
): Promise<CommandExecution> {
  const operationId = OPERATION_ID_BY_COMMAND_KEY.get(commandKey);
  if (!operationId) {
    throw new CliError('COMMAND_FAILED', `No operation id is registered for command key "${commandKey}".`);
  }

  const spec = COMMAND_SPEC_BY_KEY.get(commandKey);
  if (!spec) {
    throw new CliError('COMMAND_FAILED', `No command spec is registered for command key "${commandKey}".`);
  }

  if (hasHelpFlag(tokens)) {
    const usage = buildUsageLines(spec);
    return {
      command: commandKey,
      data: { usage },
      pretty: ['Usage:', ...usage.map((line) => `  ${line}`)].join('\n'),
    };
  }

  return executeOperation({
    mode: 'wrapper',
    operationId,
    commandName: commandKey,
    tokens,
    context,
  });
}
