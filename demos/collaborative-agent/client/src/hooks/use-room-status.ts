import { useQuery } from '@tanstack/react-query';
import { getRoomStatus } from '../lib/agent-api';

export function useRoomStatus(roomId: string | undefined) {
  return useQuery({
    queryKey: ['room-status', roomId],
    queryFn: () => getRoomStatus(roomId!),
    enabled: !!roomId,
    refetchInterval: 1000,
  });
}
