import { EditorWorkspace } from './editor-workspace';
import { RoomHeader } from './room-header';
import { McpConnectSidebar } from '@/components/mcp/mcp-connect-sidebar';

export function EditorLayout({ roomId, displayName }: { roomId: string; displayName: string }) {
  return (
    <div className='flex h-full flex-col'>
      <RoomHeader roomId={roomId} />
      <div className='flex flex-1 overflow-hidden'>
        <main className='flex flex-1 flex-col overflow-auto bg-background'>
          <EditorWorkspace roomId={roomId} displayName={displayName} />
        </main>
        <McpConnectSidebar roomId={roomId} />
      </div>
    </div>
  );
}
