import { ArrowLeft, Loader2 } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { EditorLayout } from '@/components/editor/editor-layout';
import { useRoomStatus } from '@/hooks/use-room-status';

export function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const displayName = sessionStorage.getItem('displayName') ?? 'User';
  const status = useRoomStatus(roomId);

  if (!roomId) return <RoomMessage message='No room ID specified.' />;
  if (status.isError) return <RoomMessage message='Room not found or the room server is unavailable.' />;
  if (status.data?.error) return <RoomMessage message={`Document failed to open: ${status.data.error}`} />;
  if (!status.data?.documentReady) {
    return (
      <div className='flex h-full flex-col items-center justify-center gap-3'>
        <Loader2 className='h-6 w-6 animate-spin text-muted-foreground' />
        <p className='text-sm text-muted-foreground'>Loading the document into the collaboration room…</p>
      </div>
    );
  }
  return <EditorLayout roomId={roomId} displayName={displayName} />;
}

function RoomMessage({ message }: { message: string }) {
  return (
    <div className='flex h-full flex-col items-center justify-center gap-4'>
      <p className='text-sm text-muted-foreground'>{message}</p>
      <Link to='/' className='flex items-center gap-1 text-sm text-primary'>
        <ArrowLeft className='h-4 w-4' />
        Back home
      </Link>
    </div>
  );
}
