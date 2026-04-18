import { useMutation } from '@tanstack/react-query';
import { sendMessage } from '../lib/agent-api';
import type { SendMessagePayload } from '../types/agent';

export function useSendMessage(roomId: string) {
  return useMutation({
    mutationFn: (payload: SendMessagePayload) => sendMessage(roomId, payload),
  });
}
