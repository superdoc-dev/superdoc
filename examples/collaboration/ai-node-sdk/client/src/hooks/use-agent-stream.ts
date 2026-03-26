import { useState, useCallback, useRef } from 'react';
import { streamSSE } from '../lib/sse-parser';
import { getStreamUrl } from '../lib/agent-api';
import type { Trace } from '../types/agent';

export function useAgentStream(roomId: string) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentResponse, setCurrentResponse] = useState('');
  const [traces, setTraces] = useState<Trace[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const startStream = useCallback(
    async (messageId: string, prompt: string): Promise<string> => {
      const controller = new AbortController();
      abortRef.current = controller;
      setIsStreaming(true);
      setCurrentResponse('');

      // Create a new trace for this prompt
      const trace: Trace = {
        id: messageId,
        prompt,
        turns: [],
        status: 'running',
        startedAt: Date.now(),
      };
      setTraces((prev) => [...prev, trace]);

      const url = getStreamUrl(roomId, messageId);
      let finalOutput = '';

      try {
        for await (const event of streamSSE(url, controller.signal)) {
          switch (event.type) {
            case 'token':
              setCurrentResponse((prev) => prev + event.text);
              finalOutput += event.text;
              break;

            case 'turn_start':
              setTraces((prev) => {
                const updated = [...prev];
                const t = updated.find((tr) => tr.id === messageId);
                if (t) t.turns = [...t.turns, { turnIndex: event.turnIndex, toolCalls: [] }];
                return updated;
              });
              break;

            case 'tool_call_start':
              setTraces((prev) => {
                const updated = [...prev];
                const t = updated.find((tr) => tr.id === messageId);
                const turn = t?.turns.find((tu) => tu.turnIndex === event.turnIndex);
                if (turn) {
                  turn.toolCalls = [
                    ...turn.toolCalls,
                    { toolName: event.toolName, args: event.args, status: 'pending' },
                  ];
                }
                return updated;
              });
              break;

            case 'tool_call_end':
              setTraces((prev) => {
                const updated = [...prev];
                const t = updated.find((tr) => tr.id === messageId);
                const turn = t?.turns.find((tu) => tu.turnIndex === event.turnIndex);
                if (turn) {
                  const tc = turn.toolCalls.find(
                    (c) => c.toolName === event.toolName && c.status === 'pending',
                  );
                  if (tc) {
                    tc.result = event.result;
                    tc.durationMs = event.durationMs;
                    tc.status = (event.result as Record<string, unknown>)?.ok === false ? 'error' : 'success';
                  }
                }
                return updated;
              });
              break;

            case 'done':
              finalOutput = event.fullOutput || finalOutput;
              setTraces((prev) => {
                const updated = [...prev];
                const t = updated.find((tr) => tr.id === messageId);
                if (t) t.status = 'completed';
                return updated;
              });
              setIsStreaming(false);
              break;

            case 'error':
              setTraces((prev) => {
                const updated = [...prev];
                const t = updated.find((tr) => tr.id === messageId);
                if (t) t.status = 'error';
                return updated;
              });
              setIsStreaming(false);
              break;
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== 'AbortError') {
          console.error('SSE stream error:', err);
        }
        setIsStreaming(false);
      }

      return finalOutput;
    },
    [roomId],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  return { isStreaming, currentResponse, traces, startStream, cancel };
}
