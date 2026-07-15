import type { RoomStatus, StartRoomOptions } from '@/types/room';

const ROOM_SERVER_URL = import.meta.env.VITE_ROOM_SERVER_URL ?? 'http://127.0.0.1:8090';

export async function startRoom(roomId: string, options: StartRoomOptions): Promise<RoomStatus> {
  const body = new FormData();
  if (options.useSample) body.append('useSample', 'true');
  if (options.file) body.append('file', options.file);

  const response = await fetch(`${ROOM_SERVER_URL}/rooms/${roomId}/start`, { method: 'POST', body });
  if (!response.ok) throw new Error(`Failed to start room: ${response.status}`);
  return response.json();
}

export async function getRoomStatus(roomId: string): Promise<RoomStatus> {
  const response = await fetch(`${ROOM_SERVER_URL}/rooms/${roomId}/status`);
  if (!response.ok) throw new Error(`Failed to get room status: ${response.status}`);
  return response.json();
}

export function getDownloadUrl(roomId: string): string {
  return `${ROOM_SERVER_URL}/rooms/${roomId}/download`;
}
