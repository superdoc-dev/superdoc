import { ensureSessionExistsForProject } from '../lib/context';
import { CliError } from '../lib/errors';
import { validateSessionId } from '../lib/session';
import type { CommandContext, CommandExecution } from '../lib/types';
import { runClose } from './close';

function parseSessionCloseTarget(
  tokens: string[],
  context: CommandContext,
): { sessionId: string; closeTokens: string[] } {
  const [first, ...tail] = tokens;

  if (first === '--help' || first === '-h') {
    return { sessionId: '', closeTokens: ['--help'] };
  }

  const positionalSessionId = first && !first.startsWith('--') ? first : undefined;
  if (positionalSessionId && context.sessionId && positionalSessionId !== context.sessionId) {
    throw new CliError('INVALID_ARGUMENT', 'session close: positional <sessionId> conflicts with --session.');
  }

  const sessionId = positionalSessionId ?? context.sessionId;
  if (!sessionId) {
    throw new CliError('MISSING_REQUIRED', 'session close: missing required <sessionId> (or --session).');
  }

  return {
    sessionId: validateSessionId(sessionId, 'session close session id'),
    closeTokens: positionalSessionId ? tail : tokens,
  };
}

export async function runSessionClose(tokens: string[], context: CommandContext): Promise<CommandExecution> {
  const { sessionId, closeTokens } = parseSessionCloseTarget(tokens, context);
  if (closeTokens[0] === '--help') {
    return {
      command: 'session close',
      data: {
        usage: [
          'superdoc session close <sessionId> [--discard]',
          'superdoc session close --session <sessionId> [--discard]',
        ],
      },
      pretty: [
        'Usage:',
        '  superdoc session close <sessionId> [--discard]',
        '  superdoc session close --session <sessionId> [--discard]',
      ].join('\n'),
    };
  }

  await ensureSessionExistsForProject(sessionId);
  const closeResult = await runClose(closeTokens, {
    ...context,
    sessionId,
  });

  const data =
    closeResult.data && typeof closeResult.data === 'object'
      ? { ...(closeResult.data as Record<string, unknown>), sessionId }
      : closeResult.data;

  return {
    ...closeResult,
    command: 'session close',
    data,
  };
}
