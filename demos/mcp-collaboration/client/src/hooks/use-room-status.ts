import { useQuery } from '@tanstack/react-query';
import { getRoomStatus } from '@/lib/room-api';

export function useRoomStatus(roomId: string | undefined) {
  return useQuery({
    queryKey: ['room-status', roomId],
    queryFn: () => getRoomStatus(roomId!),
    enabled: Boolean(roomId),
    refetchInterval: (query) => (query.state.data?.documentReady ? false : 750),
  });
}
