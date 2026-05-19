import { createEditor, disposeEditor, type EditorHandle } from '../superdoc/editor.js';
import { executeRun, type RunEvent } from '../agent/runner.js';
import crypto from 'node:crypto';

const COLLAB_URL = process.env.COLLAB_WS_URL || 'ws://localhost:8081';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  displayName?: string;
}

interface Run {
  id: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  events: RunEvent[];
  subscribers: Set<(event: RunEvent) => void>;
  abortController: AbortController;
  fullOutput: string;
}

interface Room {
  roomId: string;
  model: string;
  changeMode: 'direct' | 'tracked';
  editor: EditorHandle | null;
  editorReady: Promise<void> | null;
  conversation: Message[];
  activeRunId: string | null;
  runs: Map<string, Run>;
}

const rooms = new Map<string, Room>();

export async function startRoom(
  roomId: string,
  opts: { model: string; changeMode: string; docPath: string },
): Promise<{ ok: true }> {
  if (rooms.has(roomId)) return { ok: true };

  const room: Room = {
    roomId,
    model: opts.model || 'gpt-4o',
    changeMode: (opts.changeMode as 'direct' | 'tracked') || 'direct',
    editor: null,
    editorReady: null,
    conversation: [],
    activeRunId: null,
    runs: new Map(),
  };

  console.log(`[room-manager] Starting editor for room ${roomId}, docPath: ${opts.docPath}`);
  room.editorReady = createEditor({
    roomId,
    docPath: opts.docPath,
    collabUrl: COLLAB_URL,
    changeMode: room.changeMode,
  }).then(async (handle) => {
    room.editor = handle;
    console.log(`[room-manager] Editor connected, sessionId: ${handle.sessionId}`);

    // Diagnostic: check if the document has content after opening
    try {
      const text = await handle.document.core.getText({});
      console.log(`[room-manager] Document text length: ${text?.text?.length ?? 0}`);
      console.log(`[room-manager] Document text preview: "${text?.text?.substring(0, 100) ?? '(empty)'}"`);
    } catch (e: any) {
      console.log(`[room-manager] Could not read doc text: ${e.message}`);
    }

    try {
      const blocks = await handle.document.blocks.list({});
      console.log(`[room-manager] Document blocks: ${blocks?.blocks?.length ?? 0}`);
    } catch (e: any) {
      console.log(`[room-manager] Could not read blocks: ${e.message}`);
    }
  }).catch((err) => {
    console.error(`[room-manager] Editor init failed for room ${roomId}:`, err);
  });

  rooms.set(roomId, room);
  return { ok: true };
}

export function getRoomStatus(roomId: string) {
  const room = rooms.get(roomId);
  if (!room) return null;
  return {
    roomId: room.roomId,
    model: room.model,
    changeMode: room.changeMode,
    agentReady: room.editor !== null,
    activeRunId: room.activeRunId,
    conversationLength: room.conversation.length,
  };
}

export async function sendMessage(
  roomId: string,
  input: string,
  displayName: string,
): Promise<{ messageId: string } | null> {
  const room = rooms.get(roomId);
  if (!room) return null;

  if (room.editorReady) await room.editorReady;
  if (!room.editor) return null;

  const messageId = `msg_${crypto.randomBytes(8).toString('hex')}`;
  const abortController = new AbortController();

  const run: Run = {
    id: messageId,
    status: 'running',
    events: [],
    subscribers: new Set(),
    abortController,
    fullOutput: '',
  };

  room.runs.set(messageId, run);
  room.activeRunId = messageId;
  room.conversation.push({ role: 'user', content: input, displayName });

  // Fire execution in background
  (async () => {
    console.log(`[room-manager] Starting run ${messageId} in room ${roomId}, model: ${room.model}`);
    try {
      const runner = executeRun({
        input,
        conversationHistory: room.conversation.slice(0, -1),
        documentHandle: room.editor!.document,
        model: room.model,
        signal: abortController.signal,
      });

      for await (const event of runner) {
        console.log(`[room-manager] Event: ${event.type}`, event.type === 'token' ? `"${(event as any).text?.slice(0, 50)}"` : '');
        run.events.push(event);
        for (const sub of run.subscribers) {
          try { sub(event); } catch { /* ignore */ }
        }

        if (event.type === 'done') {
          run.status = 'completed';
          run.fullOutput = event.fullOutput;
          room.conversation.push({ role: 'assistant', content: event.fullOutput });
          room.activeRunId = null;
        }
        if (event.type === 'error') {
          run.status = 'failed';
          room.activeRunId = null;
        }
      }
    } catch (err: any) {
      console.error(`[room-manager] Run ${messageId} failed:`, err);
      const errorEvent: RunEvent = { type: 'error', message: err?.message ?? 'Unknown error' };
      run.events.push(errorEvent);
      run.status = 'failed';
      room.activeRunId = null;
      for (const sub of run.subscribers) {
        try { sub(errorEvent); } catch { /* ignore */ }
      }
    }
  })();

  return { messageId };
}

export function subscribeToRun(
  roomId: string,
  messageId: string,
  callback: (event: RunEvent) => void,
): (() => void) | null {
  const room = rooms.get(roomId);
  if (!room) return null;
  const run = room.runs.get(messageId);
  if (!run) return null;

  // Replay past events
  for (const event of run.events) {
    callback(event);
  }

  if (run.status === 'running') {
    run.subscribers.add(callback);
    return () => { run.subscribers.delete(callback); };
  }

  return () => {};
}

export function cancelRun(roomId: string, messageId: string): boolean {
  const room = rooms.get(roomId);
  if (!room) return false;
  const run = room.runs.get(messageId);
  if (!run || run.status !== 'running') return false;
  run.abortController.abort();
  run.status = 'cancelled';
  room.activeRunId = null;
  return true;
}

export async function stopRoom(roomId: string): Promise<boolean> {
  const room = rooms.get(roomId);
  if (!room) return false;
  if (room.editor) await disposeEditor(room.editor);
  rooms.delete(roomId);
  return true;
}

export function updateRoomSettings(
  roomId: string,
  settings: { model?: string; changeMode?: string },
): boolean {
  const room = rooms.get(roomId);
  if (!room) return false;
  if (settings.model) room.model = settings.model;
  if (settings.changeMode) room.changeMode = settings.changeMode as 'direct' | 'tracked';
  return true;
}
