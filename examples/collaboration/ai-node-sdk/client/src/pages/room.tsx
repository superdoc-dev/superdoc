import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useRoomStatus } from '@/hooks/use-room-status';
import { EditorLayout } from '@/components/editor/editor-layout';

export function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const displayName = sessionStorage.getItem('displayName') ?? 'User';
  const { data: status, isLoading, isError } = useRoomStatus(roomId);

  if (!roomId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">No room ID specified.</p>
        <Link to="/" className="text-sm text-primary hover:underline flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>
      </div>
    );
  }

  // Wait for agent to be ready before rendering editor.
  // The agent seeds the collaboration room with the document content.
  // If we render the editor too early, the browser would seed the room
  // with blank.docx instead of the user's uploaded file.
  if (!status?.agentReady) {
    if (isError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4">
          <p className="text-sm text-muted-foreground">
            Room <span className="font-mono font-medium">{roomId}</span> was not found or the agent server is unavailable.
          </p>
          <Link to="/" className="text-sm text-primary hover:underline flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
        </div>
      );
    }
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {status ? 'Waiting for agent to connect...' : 'Connecting to room...'}
        </p>
      </div>
    );
  }

  return (
    <EditorLayout
      roomId={roomId}
      displayName={displayName}
      agentReady
    />
  );
}
