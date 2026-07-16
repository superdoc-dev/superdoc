import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createEditor, disposeEditor, type EditorHandle } from './editor.js';

const ROOM_OUTPUT_DIR = join(tmpdir(), 'superdoc-mcp-collaboration');

interface Room {
  id: string;
  sourcePath: string;
  editor: EditorHandle | null;
  ready: Promise<void>;
  error: string | null;
}

export interface RoomStatus {
  roomId: string;
  documentReady: boolean;
  error: string | null;
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();

  constructor(private readonly collaborationUrl: string) {}

  start(roomId: string, sourcePath: string): RoomStatus {
    const existing = this.rooms.get(roomId);
    if (existing) return this.toStatus(existing);

    const room: Room = {
      id: roomId,
      sourcePath,
      editor: null,
      error: null,
      ready: Promise.resolve(),
    };
    room.ready = this.initializeRoom(room);
    this.rooms.set(roomId, room);
    return this.toStatus(room);
  }

  status(roomId: string): RoomStatus | null {
    const room = this.rooms.get(roomId);
    return room ? this.toStatus(room) : null;
  }

  async export(roomId: string): Promise<string | null> {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    await room.ready;
    if (!room.editor) throw new Error(room.error ?? 'Document is not ready.');

    await mkdir(ROOM_OUTPUT_DIR, { recursive: true });
    const outputPath = join(ROOM_OUTPUT_DIR, `${room.id}-current.docx`);
    await room.editor.document.save({ out: outputPath, force: true });
    return outputPath;
  }

  async stop(roomId: string): Promise<boolean> {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    await room.ready.catch(() => undefined);
    if (room.editor) await disposeEditor(room.editor);
    this.rooms.delete(roomId);
    return true;
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.rooms.keys()].map((roomId) => this.stop(roomId)));
  }

  private async initializeRoom(room: Room): Promise<void> {
    try {
      room.editor = await createEditor({
        roomId: room.id,
        docPath: room.sourcePath,
        collaborationUrl: this.collaborationUrl,
      });
    } catch (error) {
      room.error = error instanceof Error ? error.message : String(error);
    }
  }

  private toStatus(room: Room): RoomStatus {
    return { roomId: room.id, documentReady: room.editor !== null, error: room.error };
  }
}
