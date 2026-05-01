import type { RoomStatus } from '../types/room';
import type { SendMessagePayload } from '../types/agent';

const AGENT_URL = import.meta.env.VITE_AGENT_URL ?? 'http://localhost:8090';

export interface StartRoomOptions {
  model: string;
  changeMode: string;
  useSample?: boolean;
  file?: File | null;
}

export async function startRoom(roomId: string, opts: StartRoomOptions): Promise<{ ok: boolean }> {
  const form = new FormData();
  form.append('model', opts.model);
  form.append('changeMode', opts.changeMode);
  if (opts.useSample) form.append('useSample', 'true');
  if (opts.file) form.append('file', opts.file);

  const res = await fetch(`${AGENT_URL}/v1/rooms/${roomId}/start`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error(`Failed to start room: ${res.status}`);
  return res.json();
}

export async function getRoomStatus(roomId: string): Promise<RoomStatus> {
  const res = await fetch(`${AGENT_URL}/v1/rooms/${roomId}/status`);
  if (!res.ok) throw new Error(`Failed to get room status: ${res.status}`);
  return res.json();
}

export async function sendMessage(roomId: string, payload: SendMessagePayload): Promise<{ messageId: string }> {
  const res = await fetch(`${AGENT_URL}/v1/rooms/${roomId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to send message: ${res.status}`);
  return res.json();
}

export async function cancelMessage(roomId: string, messageId: string): Promise<void> {
  await fetch(`${AGENT_URL}/v1/rooms/${roomId}/messages/${messageId}/cancel`, { method: 'POST' });
}

export async function updateRoomSettings(roomId: string, settings: { model?: string; changeMode?: string }): Promise<void> {
  await fetch(`${AGENT_URL}/v1/rooms/${roomId}/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
}

export async function stopRoom(roomId: string): Promise<void> {
  await fetch(`${AGENT_URL}/v1/rooms/${roomId}/stop`, { method: 'POST' });
}

export function getStreamUrl(roomId: string, messageId: string): string {
  return `${AGENT_URL}/v1/rooms/${roomId}/messages/${messageId}/stream`;
}
