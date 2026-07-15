import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function JoinRoomForm() {
  const [roomId, setRoomId] = useState('');
  const [displayName, setDisplayName] = useState('User');
  const navigate = useNavigate();

  return (
    <form
      className='space-y-5'
      onSubmit={(event) => {
        event.preventDefault();
        if (!roomId.trim()) return;
        sessionStorage.setItem('displayName', displayName);
        navigate(`/room/${roomId.trim()}`);
      }}
    >
      <div className='space-y-2'>
        <Label htmlFor='join-room-id'>Room ID</Label>
        <Input id='join-room-id' value={roomId} onChange={(event) => setRoomId(event.target.value)} />
      </div>
      <div className='space-y-2'>
        <Label htmlFor='join-display-name'>Display name</Label>
        <Input id='join-display-name' value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
      </div>
      <Button type='submit' className='w-full' disabled={!roomId.trim()}>
        Join room
      </Button>
    </form>
  );
}
