import { useEffect, useRef, useState } from 'react';
import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

const API_KEY = import.meta.env.VITE_OPENAI_API_KEY as string;

type Suggestion = { find: string; replace: string; comment: string };

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const commentsRef = useRef<HTMLDivElement>(null);
  const superdocRef = useRef<any>(null);

  useEffect(() => {
    if (!file || !containerRef.current) return;

    superdocRef.current?.destroy();
    superdocRef.current = new SuperDoc({
      selector: containerRef.current,
      document: file,
      documentMode: 'suggesting',
      user: { name: 'Jane Doe', email: 'jane@example.com' },
      modules: {
        comments: { selector: commentsRef.current!, allowResolving: true },
      },
    });

    return () => {
      superdocRef.current?.destroy();
      superdocRef.current = null;
    };
  }, [file]);

  const runAIReview = async () => {
    const editor = superdocRef.current?.activeEditor;
    if (!editor) return;

    setReviewing(true);
    try {
      const text = editor.state.doc.textContent;
      const suggestions = await callLLM(text);

      for (const s of suggestions) {
        const matches = editor.commands.search(s.find, { highlight: false });
        if (!matches.length) continue;

        editor.commands.insertTrackedChange({
          from: matches[0].from,
          to: matches[0].to,
          text: s.replace,
          user: { name: 'AI Assistant', email: 'ai@superdoc.dev' },
          comment: s.comment,
        });
      }
    } finally {
      setReviewing(false);
    }
  };

  if (!API_KEY) {
    return <div style={{ padding: '2rem' }}>Add VITE_OPENAI_API_KEY to .env — see .env.example</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header style={{ padding: '0.75rem 1rem', background: '#f5f5f5', borderBottom: '1px solid #ddd', display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <input type="file" accept=".docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button
          onClick={runAIReview}
          disabled={!file || reviewing}
          style={{ padding: '0.4rem 1rem', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', opacity: !file || reviewing ? 0.5 : 1 }}
        >
          {reviewing ? 'Reviewing…' : 'AI Review'}
        </button>
      </header>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div ref={containerRef} style={{ flex: 1, overflow: 'auto' }} />
        <div ref={commentsRef} style={{ width: 320, borderLeft: '1px solid #ddd', overflow: 'auto' }} />
      </div>
    </div>
  );
}

/**
 * Call OpenAI to get redlining suggestions for the document text.
 * WARNING: This is a demo only. Never expose API keys in client-side code in production.
 * Use a backend proxy to keep your key secret.
 */
async function callLLM(text: string): Promise<Suggestion[]> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a legal document reviewer. Given document text, return a JSON object with a "suggestions" array. Each suggestion has:
- "find": the exact text to replace (must match the document verbatim)
- "replace": the improved text
- "comment": a brief explanation of the change

Return 3-5 suggestions max. Focus on clarity, precision, and legal best practices.`,
        },
        { role: 'user', content: text.slice(0, 8000) },
      ],
    }),
  });

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? '{}';
  return JSON.parse(content).suggestions ?? [];
}
