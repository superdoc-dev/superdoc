import { useState, useCallback, useRef, useEffect } from 'react';
import { streamSSE } from '../lib/sse-parser';
import { getStreamUrl } from '../lib/agent-api';
import type { Trace } from '../types/agent';

export function useAgentStream(roomId: string) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentResponse, setCurrentResponse] = useState('');
  const [traces, setTraces] = useState<Trace[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  // Abort any active SSE connection on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const startStream = useCallback(
    async (messageId: string, prompt: string): Promise<string> => {
      // Abort any previous connection before starting a new one
      abortRef.current?.abort();

      const controller = new AbortController();
      abortRef.current = controller;
      setIsStreaming(true);
      setCurrentResponse('');

      // Create a new trace for this prompt, but skip if one already exists (StrictMode re-mount)
      const trace: Trace = {
        id: messageId,
        prompt,
        turns: [],
        status: 'running',
        startedAt: Date.now(),
      };
      setTraces((prev) => {
        if (prev.some((t) => t.id === messageId)) return prev;
        return [...prev, trace];
      });

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
                if (t) {
                  // Deduplicate: skip if turn already exists
                  if (t.turns.some((tu) => tu.turnIndex === event.turnIndex)) return prev;
                  t.turns = [...t.turns, { turnIndex: event.turnIndex, toolCalls: [] }];
                }
                return updated;
              });
              break;

            case 'tool_call_start':
              setTraces((prev) => {
                const updated = [...prev];
                const t = updated.find((tr) => tr.id === messageId);
                const turn = t?.turns.find((tu) => tu.turnIndex === event.turnIndex);
                if (turn) {
                  // Deduplicate: skip if this tool call already exists in this turn
                  const exists = turn.toolCalls.some(
                    (c) => c.toolName === event.toolName && JSON.stringify(c.args) === JSON.stringify(event.args),
                  );
                  if (exists) return prev;
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
