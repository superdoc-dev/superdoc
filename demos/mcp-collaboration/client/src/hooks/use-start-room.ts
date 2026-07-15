import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { startRoom } from '@/lib/room-api';
import type { StartRoomOptions } from '@/types/room';

export function useStartRoom() {
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async ({ roomId, ...options }: StartRoomOptions & { roomId: string }) => {
      await startRoom(roomId, options);
      return roomId;
    },
    onSuccess: (roomId) => navigate(`/room/${roomId}`),
  });
}
