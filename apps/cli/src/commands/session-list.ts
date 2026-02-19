import { getActiveSessionId, listProjectSessions } from '../lib/context';
import { parseOperationArgs } from '../lib/operation-args';
import type { CommandContext, CommandExecution } from '../lib/types';

function buildPretty(
  activeSessionId: string | null,
  sessions: Awaited<ReturnType<typeof listProjectSessions>>,
): string {
  if (sessions.length === 0) {
    return 'No sessions found';
  }

  const lines = [`Default session: ${activeSessionId ?? '<none>'}`, 'Sessions:'];
  for (const session of sessions) {
    const marker = session.sessionId === activeSessionId ? '*' : ' ';
    const sessionTypeLabel = session.sessionType === 'collab' ? 'collab' : 'local';
    const collabDocId = session.collaboration?.documentId ? `, doc ${session.collaboration.documentId}` : '';
    lines.push(
      `${marker} ${session.sessionId} (${sessionTypeLabel}, ${session.dirty ? 'dirty' : 'clean'}, rev ${session.revision}${collabDocId})`,
    );
  }
  return lines.join('\n');
}

export async function runSessionList(tokens: string[], _context: CommandContext): Promise<CommandExecution> {
  const { help } = parseOperationArgs('doc.session.list', tokens, { commandName: 'session list' });

  if (help) {
    return {
      command: 'session list',
      data: {
        usage: 'superdoc session list',
      },
      pretty: 'Usage: superdoc session list',
    };
  }

  const [sessions, activeSessionId] = await Promise.all([listProjectSessions(), getActiveSessionId()]);

  return {
    command: 'session list',
    data: {
      activeSessionId: activeSessionId ?? undefined,
      sessions,
      total: sessions.length,
    },
    pretty: buildPretty(activeSessionId, sessions),
  };
}
