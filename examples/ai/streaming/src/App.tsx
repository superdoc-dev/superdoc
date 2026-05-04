import { useEffect, useRef, useState } from 'react';
import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

// Flush buffered tokens at most every FLUSH_MS, or immediately on a newline.
// Inserting on every token causes one document mutation per token (hundreds
// per response), which floods the layout engine and undo stack.
const FLUSH_MS = 150;

export default function App() {
  const [prompt, setPrompt] = useState('Write a one-page project brief for a mobile app called Trailtrack that helps hikers log their routes.');
  const [streaming, setStreaming] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const superdocRef = useRef<any>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const sd = new SuperDoc({
      selector: containerRef.current,
      documentMode: 'editing',
      user: { name: 'You', email: 'you@example.com' },
      onReady: () => setEditorReady(Boolean(sd.activeEditor)),
    });
    superdocRef.current = sd;
    return () => {
      // Abort any in-flight stream before tearing down the editor; otherwise
      // a delayed token can call insert against a destroyed editor.
      abortRef.current?.abort();
      sd.destroy();
      superdocRef.current = null;
    };
  }, []);

  const generate = async () => {
    // Guard against re-entry. setStreaming is React-batched, so a fast
    // double-click would otherwise fire generate twice before the button
    // swaps to Stop, racing two streams and orphaning the first abort.
    if (abortRef.current) return;
    const editor = superdocRef.current?.activeEditor;
    if (!editor || !prompt.trim()) return;

    setStreaming(true);
    setError(null);
    abortRef.current = new AbortController();

    // Buffered flush: collect tokens, write to the document at most every
    // FLUSH_MS or whenever a newline arrives (newlines mark paragraph
    // boundaries, which the user expects to see immediately).
    let buffer = '';
    let pendingFlush: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      if (pendingFlush) { clearTimeout(pendingFlush); pendingFlush = null; }
      if (!buffer) return;
      const text = buffer;
      buffer = '';
      // Bail if the editor was torn down between scheduling and firing.
      const ed = superdocRef.current?.activeEditor;
      if (!ed) return;
      ed.doc.insert({ value: text, type: 'text' });
    };

    try {
      for await (const chunk of streamFromServer(prompt, abortRef.current.signal)) {
        buffer += chunk;
        if (chunk.includes('\n')) {
          flush();
        } else if (!pendingFlush) {
          pendingFlush = setTimeout(flush, FLUSH_MS);
        }
      }
      flush(); // final tail
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError((err as Error).message || String(err));
      }
    } finally {
      if (pendingFlush) clearTimeout(pendingFlush);
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const stop = () => abortRef.current?.abort();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header style={{ padding: '0.75rem 1rem', background: '#f5f5f5', borderBottom: '1px solid #ddd', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="What should the document be about?"
          disabled={streaming}
          style={{ flex: 1, padding: '0.5rem 0.75rem', border: '1px solid #ccc', borderRadius: 4, fontSize: 14 }}
        />
        {streaming ? (
          <button
            onClick={stop}
            style={{ padding: '0.5rem 1rem', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
          >
            Stop
          </button>
        ) : (
          <button
            onClick={generate}
            disabled={!editorReady || !prompt.trim()}
            title={!editorReady ? 'Loading editor…' : undefined}
            style={{ padding: '0.5rem 1rem', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 4, cursor: editorReady ? 'pointer' : 'not-allowed', opacity: editorReady && prompt.trim() ? 1 : 0.5 }}
          >
            {editorReady ? 'Generate' : 'Loading…'}
          </button>
        )}
      </header>

      {error && (
        <div style={{ padding: '0.5rem 1rem', background: '#fee2e2', color: '#991b1b', fontSize: 13 }}>
          {error}
        </div>
      )}

      <div ref={containerRef} style={{ flex: 1, overflow: 'auto' }} />
    </div>
  );
}

/**
 * Stream text deltas from the local /api/generate proxy as Server-Sent Events.
 * The browser never sees the OpenAI key — it lives in the Node server's env.
 */
async function* streamFromServer(prompt: string, signal: AbortSignal): AsyncGenerator<string> {
  const res = await fetch('/api/generate', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });

  if (!res.ok || !res.body) {
    const message = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (!data) continue;
      const event = JSON.parse(data);
      if (event.type === 'token') yield event.text;
      else if (event.type === 'done') return;
      else if (event.type === 'error') throw new Error(event.message);
    }
  }
}
