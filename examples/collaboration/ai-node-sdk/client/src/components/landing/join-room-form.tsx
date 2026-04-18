import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function JoinRoomForm() {
  const [roomId, setRoomId] = useState('');
  const [displayName, setDisplayName] = useState('User');
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomId.trim()) return;
    sessionStorage.setItem('displayName', displayName);
    navigate(`/room/${roomId.trim()}`);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Room ID */}
      <div className="space-y-2">
        <Label htmlFor="room-id">Room ID</Label>
        <Input
          id="room-id"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          placeholder="e.g. calm-fox-42"
          autoFocus
        />
        <p className="text-xs text-muted-foreground">
          Enter the room name shared by the room creator.
        </p>
      </div>

      {/* Display Name */}
      <div className="space-y-2">
        <Label htmlFor="join-display-name">Display name</Label>
        <Input
          id="join-display-name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Your name"
        />
      </div>

      {/* Submit */}
      <Button type="submit" className="w-full" disabled={!roomId.trim()}>
        Join Room
      </Button>
    </form>
  );
}
