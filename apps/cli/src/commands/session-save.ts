import { ensureSessionExistsForProject } from '../lib/context';
import { CliError } from '../lib/errors';
import { validateSessionId } from '../lib/session';
import type { CommandContext, CommandExecution } from '../lib/types';
import { runSave } from './save';

function parseSessionSaveTarget(
  tokens: string[],
  context: CommandContext,
): { sessionId: string; saveTokens: string[] } {
  const [first, ...tail] = tokens;

  if (first === '--help' || first === '-h') {
    return { sessionId: '', saveTokens: ['--help'] };
  }

  const positionalSessionId = first && !first.startsWith('--') ? first : undefined;
  if (positionalSessionId && context.sessionId && positionalSessionId !== context.sessionId) {
    throw new CliError('INVALID_ARGUMENT', 'session save: positional <sessionId> conflicts with --session.');
  }

  const sessionId = positionalSessionId ?? context.sessionId;
  if (!sessionId) {
    throw new CliError('MISSING_REQUIRED', 'session save: missing required <sessionId> (or --session).');
  }

  return {
    sessionId: validateSessionId(sessionId, 'session save session id'),
    saveTokens: positionalSessionId ? tail : tokens,
  };
}

export async function runSessionSave(tokens: string[], context: CommandContext): Promise<CommandExecution> {
  const { sessionId, saveTokens } = parseSessionSaveTarget(tokens, context);
  if (saveTokens[0] === '--help') {
    return {
      command: 'session save',
      data: {
        usage: [
          'superdoc session save <sessionId> [--in-place] [--out <path>] [--force]',
          'superdoc session save --session <sessionId> [--in-place] [--out <path>] [--force]',
        ],
      },
      pretty: [
        'Usage:',
        '  superdoc session save <sessionId> [--in-place] [--out <path>] [--force]',
        '  superdoc session save --session <sessionId> [--in-place] [--out <path>] [--force]',
      ].join('\n'),
    };
  }

  await ensureSessionExistsForProject(sessionId);
  const saveResult = await runSave(saveTokens, {
    ...context,
    sessionId,
  });

  const data =
    saveResult.data && typeof saveResult.data === 'object'
      ? { ...(saveResult.data as Record<string, unknown>), sessionId }
      : saveResult.data;

  return {
    ...saveResult,
    command: 'session save',
    data,
  };
}
