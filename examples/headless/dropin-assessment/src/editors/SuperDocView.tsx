import { useEffect, useState } from 'react';
import { SuperDocEditor } from '@superdoc-dev/react';
import '@superdoc-dev/react/style.css';
import { SuperDocAdapter } from '../adapters/SuperDocAdapter';
import { Toolbar } from '../ui/Toolbar';
import { CommentsSidebar } from '../ui/CommentsSidebar';

const CURRENT_USER = { name: 'Alex Rivera', email: 'alex@example.com' };

// Disable SuperDoc's built-in comments UI (floating trigger + side panel +
// composer). We drive comments entirely from the custom sidebar via
// `editor.doc.comments.*`.
const MODULES = { comments: false as const };

// Keep telemetry opt-out explicit for anyone copying this config into a real
// consumer app. SuperDoc defaults to enabled; drop-in adopters typically
// need to disable until they add their own consent flow.
const TELEMETRY = { enabled: false as const };

export function SuperDocView() {
  const [superdoc, setSuperdoc] = useState<any>(null);
  const [adapter, setAdapter] = useState<SuperDocAdapter | null>(null);

  // Build + tear down the adapter alongside the superdoc instance. Using
  // an effect (instead of useMemo) makes the lifecycle explicit: when the
  // SuperDoc view unmounts on editor toggle, the adapter gets destroyed.
  useEffect(() => {
    if (!superdoc) return;
    const next = new SuperDocAdapter(superdoc);
    setAdapter(next);
    return () => {
      next.destroy();
      setAdapter(null);
    };
  }, [superdoc]);

  return (
    <>
      {adapter ? (
        <Toolbar adapter={adapter} />
      ) : (
        <div
          style={{
            height: 56,
            borderBottom: '1px solid #e5e7eb',
            padding: '0 16px',
            display: 'flex',
            alignItems: 'center',
            color: '#6b7280',
            fontSize: 13,
          }}
        >
          Loading SuperDoc…
        </div>
      )}
      <div className="body">
        <div className="doc-host" style={{ padding: 0 }}>
          <SuperDocEditor
            document="/sample-review.docx"
            documentMode="editing"
            user={CURRENT_USER}
            modules={MODULES}
            telemetry={TELEMETRY}
            hideToolbar
            contained
            style={{ height: '100%' }}
            onReady={({ superdoc: sd }) => {
              setSuperdoc(sd);
            }}
          />
        </div>
        {adapter ? (
          <CommentsSidebar adapter={adapter} currentAuthorId="alex" />
        ) : (
          <aside className="sidebar">
            <div className="sidebar-header">
              <span>Comments</span>
            </div>
            <div className="sidebar-empty">Waiting for editor…</div>
          </aside>
        )}
      </div>
    </>
  );
}
