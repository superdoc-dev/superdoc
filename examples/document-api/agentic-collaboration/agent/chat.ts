/**
 * Chat WebSocket helpers for agent communication.
 */

import WebSocket from 'ws';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface ChatConnection {
  send: (content: string) => void;
  setStatus: (status: string) => void;
  close: () => void;
}

/**
 * Connect to the chat WebSocket server.
 */
export function connectChat(
  url: string,
  onMessage: (msg: ChatMessage) => void,
  onClear: () => void,
): Promise<ChatConnection> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timeout = setTimeout(() => reject(new Error('Chat connection timeout')), 10000);

    ws.on('open', () => {
      clearTimeout(timeout);
      console.log('[Agent] Chat WebSocket connected');

      const send = (content: string) => {
        ws.send(JSON.stringify({
          type: 'message',
          role: 'assistant',
          id: `agent-${Date.now()}`,
          content,
          timestamp: Date.now(),
        }));
      };

      const setStatus = (status: string) => {
        ws.send(JSON.stringify({ type: 'status', status }));
      };

      const close = () => {
        setStatus('offline');
        ws.close();
      };

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          console.log('[Agent] Received:', msg.type, msg.message?.role || '');
          if (msg.type === 'message' && msg.message?.role === 'user') {
            onMessage(msg.message);
          } else if (msg.type === 'clear') {
            onClear();
          }
        } catch (e) {
          console.error('[Agent] Parse error:', e);
        }
      });

      resolve({ send, setStatus, close });
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}
