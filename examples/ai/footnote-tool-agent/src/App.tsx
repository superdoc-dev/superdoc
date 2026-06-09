import { useEffect, useRef, useState } from 'react';
import { SuperDoc } from 'superdoc';
import type { DocumentApi } from 'superdoc';
import { addFootnoteCitation } from './tool';
import { runAgentTurn, type AssistantReply, type ChatMessage, type ToolHandler } from './agent';

const SYSTEM_PROMPT = `You are a writing assistant for a document the user is editing.
You have one tool, addFootnoteCitation, that inserts a footnote at the user's cursor.
When the user asks to cite a source or add a footnote, extract the source text from the request and call the tool.
Use only source details present in the user request. Do not invent authors, titles, publishers, or years. If the request is underspecified, pass the user's wording verbatim as sourceText.
If the tool returns ok: false, briefly tell the user the reason. If ok: true, confirm in one short sentence.
Do not narrate what you're about to do. Just call the tool, then summarize the result.`;

const SEED =
  '# Reliability brief\n\n' +
  'Cloud-native teams converged on a small set of reliability patterns over the past decade. ' +
  'Click into this paragraph to position the cursor, then ask the assistant to add a footnote citation.';

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

type ChatRow =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string }
  | { kind: 'tool'; name: string; ok: boolean; reason?: string };

export default function App() {
  const [prompt, setPrompt] = useState('Add a footnote citing Doe, "Cloud Reliability Patterns," 2024.');
  const [running, setRunning] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatRow[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const superdocRef = useRef<SuperDoc | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const sd = new SuperDoc({
      selector: containerRef.current,
      documentMode: 'editing',
      jsonOverride: EMPTY_DOC,
      modules: { comments: false },
      telemetry: { enabled: false },
      onReady: ({ superdoc }) => {
        const api = (superdoc as SuperDoc).activeEditor?.doc;
        if (!api) return;
        const cleared = api.clearContent({});
        if (!cleared.success && cleared.failure?.code !== 'NO_OP') return;
        api.insert({ value: SEED, type: 'markdown' });
        setEditorReady(true);
      },
    });
    superdocRef.current = sd;
    return () => {
      abortRef.current?.abort();
      sd.destroy();
      superdocRef.current = null;
    };
  }, []);

  const send = async () => {
    // `abortRef.current` is the synchronous in-flight guard. `running` is
    // React state and is batched, so a fast double-trigger (double-click,
    // Cmd+Enter twice within one frame) can pass a state-based guard before
    // setRunning(true) takes effect and start two loops that overwrite each
    // other's abort controller. The ref check holds because refs update
    // immediately, not on the next render.
    const userText = prompt.trim();
    const api = superdocRef.current?.activeEditor?.doc;
    if (!api || abortRef.current || !userText) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setPrompt('');
    setError(null);
    setChat((c) => [...c, { kind: 'user', text: userText }]);
    setRunning(true);

    // Bind editor.doc once so handlers are plain (args) → result functions.
    // Add more tools by appending entries to this object and mirroring
    // their JSON schema in server.mjs TOOLS.
    const handlers: Record<string, ToolHandler> = {
      addFootnoteCitation: (args) => addFootnoteCitation(api, args as { sourceText: string }),
    };

    try {
      await runAgentTurn({
        userText,
        handlers,
        postTurn: (messages, signal) => postTurn(messages, SYSTEM_PROMPT, signal),
        onEvent: (event) => {
          setChat((c) =>
            event.kind === 'assistant'
              ? [...c, { kind: 'assistant', text: event.text }]
              : [...c, { kind: 'tool', name: event.name, ok: event.result.ok, reason: event.result.ok ? undefined : event.result.reason }],
          );
        },
        signal: controller.signal,
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError((err as Error).message || String(err));
    } finally {
      // Clear only if it's still our controller — guards against accidental
      // clearing if a future edit allows overlapping turns.
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setRunning(false);
    }
  };

  const stop = () => abortRef.current?.abort();

  return (
    <div style={S.app}>
      <aside style={S.sidebar}>
        <header style={S.header}>
          <div style={S.label}>Available tool</div>
          <div style={S.chip}>
            <span style={S.dot} />
            <span>addFootnoteCitation</span>
          </div>
        </header>

        <div style={S.chat}>
          {chat.length === 0 && (
            <div style={S.hint}>
              Place the cursor in the document, then ask in plain language.<br />
              <em>Add a footnote citing Doe's 2024 cloud reliability paper.</em>
            </div>
          )}
          {chat.map((row, idx) => (
            <ChatBubble key={idx} row={row} />
          ))}
          {error && <div style={S.error}>{error}</div>}
        </div>

        <div style={S.composer}>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={running || !editorReady}
            rows={2}
            placeholder="Ask the assistant…"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void send();
              }
            }}
            style={S.textarea}
          />
          {running ? (
            <button onClick={stop} style={btn('#ef4444')}>Stop</button>
          ) : (
            <button onClick={() => void send()} disabled={!editorReady || !prompt.trim()} style={btn('#1355ff', !editorReady || !prompt.trim())}>
              Send
            </button>
          )}
        </div>
      </aside>

      <div ref={containerRef} style={S.editorArea} />
    </div>
  );
}

function ChatBubble({ row }: { row: ChatRow }) {
  if (row.kind === 'user') return <div style={{ ...S.bubble, ...S.user }}>{row.text}</div>;
  if (row.kind === 'assistant') return <div style={{ ...S.bubble, ...S.assistant }}>{row.text}</div>;
  return (
    <div style={S.tool}>
      <span>used {row.name}</span>
      {row.ok ? <span style={S.ok}> · ok</span> : <span style={S.fail}> · {row.reason}</span>}
    </div>
  );
}

async function postTurn(messages: ChatMessage[], system: string, signal: AbortSignal): Promise<AssistantReply> {
  const res = await fetch('/api/turn', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, system }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(text);
  }
  const data = (await res.json()) as { type: 'message'; message: AssistantReply } | { type: 'error'; error: string };
  if (data.type === 'error') throw new Error(data.error);
  return data.message;
}

function btn(color: string, disabled = false): React.CSSProperties {
  return {
    padding: '0 14px',
    height: 36,
    background: disabled ? '#dbdbdb' : color,
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 13,
    fontFamily: 'inherit',
    fontWeight: 500,
  };
}

const S = {
  app: { display: 'grid', gridTemplateColumns: '380px 1fr', height: '100vh' } as const,
  sidebar: { display: 'flex', flexDirection: 'column', borderRight: '1px solid #dbdbdb', background: '#fff' } as const,
  header: { padding: '14px 16px', borderBottom: '1px solid #dbdbdb' } as const,
  label: { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#666', marginBottom: 8 } as const,
  chip: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', border: '1px solid #1355ff', borderRadius: 999, fontSize: 13, color: '#1355ff', background: 'rgba(19, 85, 255, 0.06)' } as const,
  dot: { width: 6, height: 6, borderRadius: '50%', background: '#1355ff' } as const,
  chat: { flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 8 } as const,
  hint: { fontSize: 12, color: '#666', lineHeight: 1.5 } as const,
  error: { padding: '8px 10px', background: '#fee2e2', color: '#991b1b', fontSize: 12, borderRadius: 4 } as const,
  composer: { padding: 14, borderTop: '1px solid #dbdbdb', display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 } as const,
  textarea: { padding: '8px 10px', border: '1px solid #dbdbdb', borderRadius: 4, fontSize: 13, lineHeight: 1.4, resize: 'vertical', fontFamily: 'inherit' } as const,
  bubble: { maxWidth: '90%', padding: '8px 10px', borderRadius: 6, fontSize: 13, lineHeight: 1.4, whiteSpace: 'pre-wrap' } as const,
  user: { alignSelf: 'flex-end', maxWidth: '85%', background: '#1355ff', color: '#fff' } as const,
  assistant: { alignSelf: 'flex-start', background: '#f5f5fa' } as const,
  tool: { alignSelf: 'flex-start', maxWidth: '90%', padding: '6px 10px', border: '1px dashed #dbdbdb', borderRadius: 6, fontSize: 11, color: '#666', fontFamily: '"JetBrains Mono", ui-monospace, monospace' } as const,
  ok: { color: '#00853d' } as const,
  fail: { color: '#c0392b' } as const,
  editorArea: { overflow: 'auto', padding: 12 } as const,
} satisfies Record<string, React.CSSProperties>;
