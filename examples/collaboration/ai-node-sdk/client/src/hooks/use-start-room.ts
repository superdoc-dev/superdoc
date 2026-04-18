import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { startRoom, type StartRoomOptions } from '../lib/agent-api';

export function useStartRoom() {
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async ({ roomId, ...opts }: StartRoomOptions & { roomId: string }) => {
      await startRoom(roomId, opts);
      return roomId;
    },
    onSuccess: (roomId) => {
      navigate(`/room/${roomId}`);
    },
  });
}
