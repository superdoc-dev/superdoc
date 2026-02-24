import { ensureSessionExistsForProject, setActiveSessionId } from '../lib/context';
import { CliError } from '../lib/errors';
import { validateSessionId } from '../lib/session';
import type { CommandContext, CommandExecution } from '../lib/types';

function parseSessionId(
  tokens: string[],
  context: CommandContext,
  commandName: string,
): { sessionId: string; rest: string[] } {
  const [first, ...tail] = tokens;

  if (first === '--help' || first === '-h') {
    return { sessionId: '', rest: ['--help'] };
  }

  const positionalSessionId = first && !first.startsWith('--') ? first : undefined;
  if (positionalSessionId && context.sessionId && positionalSessionId !== context.sessionId) {
    throw new CliError('INVALID_ARGUMENT', `${commandName}: positional <sessionId> conflicts with --session.`);
  }

  const sessionId = positionalSessionId ?? context.sessionId;
  if (!sessionId) {
    throw new CliError('MISSING_REQUIRED', `${commandName}: missing required <sessionId> (or --session).`);
  }

  return {
    sessionId: validateSessionId(sessionId, `${commandName} session id`),
    rest: positionalSessionId ? tail : tokens,
  };
}

async function runSetDefault(
  tokens: string[],
  context: CommandContext,
  commandName: 'session set-default' | 'session use',
): Promise<CommandExecution> {
  const { sessionId, rest } = parseSessionId(tokens, context, commandName);
  if (rest[0] === '--help') {
    return {
      command: commandName,
      data: {
        usage: [`superdoc ${commandName} <sessionId>`, `superdoc ${commandName} --session <sessionId>`],
      },
      pretty: [
        `Usage:`,
        `  superdoc ${commandName} <sessionId>`,
        `  superdoc ${commandName} --session <sessionId>`,
      ].join('\n'),
    };
  }

  if (rest.length > 0) {
    throw new CliError('INVALID_ARGUMENT', `${commandName}: unexpected argument(s): ${rest.join(' ')}`);
  }

  await ensureSessionExistsForProject(sessionId);
  await setActiveSessionId(sessionId);

  return {
    command: commandName,
    data: {
      activeSessionId: sessionId,
    },
    pretty: `Default session set to ${sessionId}`,
  };
}

export async function runSessionSetDefault(tokens: string[], context: CommandContext): Promise<CommandExecution> {
  return runSetDefault(tokens, context, 'session set-default');
}

export async function runSessionUse(tokens: string[], context: CommandContext): Promise<CommandExecution> {
  return runSetDefault(tokens, context, 'session use');
}
