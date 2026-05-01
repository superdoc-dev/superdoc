/**
 * Embedded "Bring Your Own UI" demo for Mintlify docs.
 *
 * Loads SuperDoc via the UMD bundle (window.SuperDoc), then dynamic-imports
 * the superdoc/ui ESM entry to get createSuperDocUI. Subscribes to controller
 * observables (ui.commands, ui.comments, ui.trackChanges, ui.document) and
 * bridges them into local React state — no superdoc/ui/react bundle needed,
 * which avoids React-global ambiguity in Mintlify's runtime.
 *
 * The reader sees a small workspace slice driven entirely by the controller.
 * Caption text on the docs page should still point them at superdoc/ui/react
 * for production React apps.
 */

const SUPERDOC_VERSION = '1.30.1';
const DEV_DIST_URL = 'http://localhost:9094/dist';
const UNPKG_DIST_URL = `https://unpkg.com/superdoc@${SUPERDOC_VERSION}/dist`;

const SAMPLE_HTML = `
  <h2>Services Agreement</h2>
  <p>Acme Corp will provide implementation services for the customer.</p>
  <p>Payment is due within 30 days of invoice receipt.</p>
  <p>Either party may terminate this agreement with written notice.</p>
`;

const TRY_IT = [
  'Select "30 days" in the contract and click Comment.',
  'Switch to Suggest mode, then change "30 days" to "15 days".',
  'Accept or reject the tracked change in the Activity sidebar.',
  'Click Export to download the edited DOCX.',
];

export const BringYourOwnUIDemo = ({ variant = 'overview' }) => {
  const [launched, setLaunched] = useState(false);

  if (!launched) {
    return (
      <div
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          padding: 32,
          background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 14, color: '#475569', marginBottom: 12 }}>
          Custom toolbar, custom Activity sidebar — all driven by <code>superdoc/ui</code>
        </div>
        <button
          onClick={() => setLaunched(true)}
          style={{
            background: '#6366f1',
            color: '#fff',
            border: 'none',
            padding: '10px 20px',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Launch interactive demo
        </button>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 12 }}>
          Loads SuperDoc {SUPERDOC_VERSION} from unpkg (~5 MB)
        </div>
      </div>
    );
  }

  return <Workspace variant={variant} />;
};

const Workspace = ({ variant }) => {
  const [status, setStatus] = useState('booting');
  const [statusError, setStatusError] = useState(null);
  const [bold, setBold] = useState({ active: false, disabled: true });
  const [italic, setItalic] = useState({ active: false, disabled: true });
  const [docState, setDocState] = useState({ mode: 'editing', ready: false });
  const [comments, setComments] = useState({ items: [], total: 0, activeIds: [] });
  const [changes, setChanges] = useState({ items: [], total: 0, activeId: null });
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerText, setComposerText] = useState('');
  const [composerCapture, setComposerCapture] = useState(null);

  const containerIdRef = useRef(`byo-demo-${Math.random().toString(36).slice(2, 9)}`);
  const superdocRef = useRef(null);
  const uiRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const teardown = [];

    const baseUrl = (() => {
      const isDev = typeof window !== 'undefined' && window.location.hostname === 'localhost';
      return isDev ? DEV_DIST_URL : UNPKG_DIST_URL;
    })();

    const ensureStyle = () => {
      const href = `${baseUrl}/style.css`;
      if (document.querySelector(`link[href="${href}"]`)) return;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      document.head.appendChild(link);
    };

    const loadEditorUMD = () => {
      if (window.SuperDoc) return Promise.resolve();
      const src = `${baseUrl}/superdoc.min.js`;
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        return new Promise((resolve, reject) => {
          existing.addEventListener('load', resolve, { once: true });
          existing.addEventListener('error', reject, { once: true });
        });
      }
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = () => reject(new Error('Failed to load superdoc.min.js'));
        document.body.appendChild(script);
      });
    };

    const loadController = () => import(/* webpackIgnore: true */ /* @vite-ignore */ `${baseUrl}/ui.es.js`);

    const boot = async () => {
      try {
        ensureStyle();
        await loadEditorUMD();
        if (cancelled) return;
        if (!document.getElementById(containerIdRef.current)) return;

        const superdoc = new window.SuperDoc({
          selector: `#${containerIdRef.current}`,
          html: SAMPLE_HTML,
          contained: true,
          onReady: async () => {
            if (cancelled) return;
            try {
              const { createSuperDocUI } = await loadController();
              if (cancelled) return;

              const ui = createSuperDocUI({ superdoc });
              uiRef.current = ui;

              // Bridge controller observables into local React state.
              const offBold = ui.commands.bold.observe(setBold);
              const offItalic = ui.commands.italic.observe(setItalic);
              const offDoc = ui.document.subscribe(({ snapshot }) => setDocState(snapshot));
              const offComments = ui.comments.subscribe(({ snapshot }) => setComments(snapshot));
              const offChanges = ui.trackChanges.subscribe(({ snapshot }) => setChanges(snapshot));

              teardown.push(() => offBold?.());
              teardown.push(() => offItalic?.());
              teardown.push(() => offDoc?.());
              teardown.push(() => offComments?.());
              teardown.push(() => offChanges?.());

              setStatus('ready');
            } catch (err) {
              console.error('[BYO UI Demo] controller load failed:', err);
              setStatus('error');
              setStatusError(err?.message || 'Failed to load superdoc/ui controller');
            }
          },
        });
        superdocRef.current = superdoc;
      } catch (err) {
        if (cancelled) return;
        console.error('[BYO UI Demo] boot failed:', err);
        setStatus('error');
        setStatusError(err?.message || 'Failed to boot SuperDoc');
      }
    };

    boot();

    return () => {
      cancelled = true;
      teardown.forEach((fn) => {
        try {
          fn();
        } catch {}
      });
      try {
        uiRef.current?.destroy?.();
        superdocRef.current?.destroy?.();
      } catch {}
      uiRef.current = null;
      superdocRef.current = null;
    };
  }, []);

  const ui = uiRef.current;

  const onComment = () => {
    if (!ui) return;
    const captured = ui.selection.capture();
    if (!captured?.target) {
      alert('Select some text in the editor first.');
      return;
    }
    setComposerCapture(captured);
    setComposerText('');
    setComposerOpen(true);
  };

  const submitComment = () => {
    if (!ui || !composerCapture || !composerText.trim()) return;
    ui.comments.createFromCapture(composerCapture, { text: composerText.trim() });
    setComposerOpen(false);
    setComposerCapture(null);
    setComposerText('');
  };

  const onExport = async () => {
    if (!ui) return;
    try {
      await ui.document.export({ exportType: ['docx'], triggerDownload: true });
    } catch (err) {
      console.error('[BYO UI Demo] export failed:', err);
      alert(`Export failed: ${err?.message || err}`);
    }
  };

  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        overflow: 'hidden',
        background: '#fff',
      }}
    >
      <div
        style={{
          padding: 16,
          background: '#f8fafc',
          borderBottom: '1px solid #e5e7eb',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', marginBottom: 6 }}>Try it</div>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
          {TRY_IT.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '8px 12px',
          background: '#fff',
          borderBottom: '1px solid #e5e7eb',
          flexWrap: 'wrap',
        }}
      >
        <ToolButton
          label='B'
          active={bold.active}
          disabled={bold.disabled}
          onClick={() => ui?.commands.get('bold')?.execute()}
          style={{ fontWeight: 700 }}
        />
        <ToolButton
          label='I'
          active={italic.active}
          disabled={italic.disabled}
          onClick={() => ui?.commands.get('italic')?.execute()}
          style={{ fontStyle: 'italic' }}
        />
        <Sep />
        <ToolButton label='Comment' onClick={onComment} disabled={!ui} />
        <Sep />
        <SegmentedControl
          value={docState.mode}
          options={[
            { value: 'editing', label: 'Edit' },
            { value: 'suggesting', label: 'Suggest' },
          ]}
          onChange={(mode) => ui?.document.setMode(mode)}
          disabled={!ui}
        />
        <div style={{ flex: 1 }} />
        <ToolButton label='Export' onClick={onExport} disabled={!ui} primary />
      </div>

      <div style={{ display: 'flex', minHeight: 380, maxHeight: 480 }}>
        <div style={{ flex: 1, overflow: 'auto', borderRight: '1px solid #e5e7eb' }}>
          <div id={containerIdRef.current} style={{ minHeight: 380 }} />
          {status === 'booting' && <div style={{ padding: 24, color: '#64748b', fontSize: 13 }}>Loading SuperDoc…</div>}
          {status === 'error' && (
            <div style={{ padding: 24, color: '#b91c1c', fontSize: 13 }}>Demo failed to load. {statusError}</div>
          )}
        </div>
        <ActivitySidebar comments={comments} changes={changes} ui={ui} ready={status === 'ready'} />
      </div>

      {composerOpen && (
        <div
          style={{
            padding: 12,
            background: '#fefce8',
            borderTop: '1px solid #fde68a',
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: '#78350f', marginBottom: 6 }}>
              Anchored to: <em>"{composerCapture?.quotedText?.slice(0, 60) || ''}"</em>
            </div>
            <textarea
              value={composerText}
              onChange={(e) => setComposerText(e.target.value)}
              placeholder='Write a comment...'
              rows={2}
              style={{
                width: '100%',
                fontSize: 13,
                padding: 8,
                border: '1px solid #fbbf24',
                borderRadius: 6,
                resize: 'vertical',
              }}
              autoFocus
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button
              onClick={submitComment}
              disabled={!composerText.trim()}
              style={{
                background: '#6366f1',
                color: '#fff',
                border: 'none',
                padding: '6px 12px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: composerText.trim() ? 'pointer' : 'not-allowed',
                opacity: composerText.trim() ? 1 : 0.5,
              }}
            >
              Post
            </button>
            <button
              onClick={() => {
                setComposerOpen(false);
                setComposerCapture(null);
                setComposerText('');
              }}
              style={{
                background: '#fff',
                color: '#78350f',
                border: '1px solid #fbbf24',
                padding: '6px 12px',
                borderRadius: 6,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <style>{`
        #${containerIdRef.current} .superdoc__layers { max-width: 660px !important; padding: 16px; }
        #${containerIdRef.current} .super-editor { max-width: 100% !important; width: 100% !important; color: #0f172a; }
        #${containerIdRef.current} .editor-element { width: 100% !important; min-width: unset !important; transform: none !important; }
        #${containerIdRef.current} h1, #${containerIdRef.current} h2, #${containerIdRef.current} h3, #${containerIdRef.current} strong { color: #0f172a; }
      `}</style>
    </div>
  );
};

const ToolButton = ({ label, active, disabled, onClick, primary, style }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      background: primary ? '#6366f1' : active ? '#e0e7ff' : 'transparent',
      color: primary ? '#fff' : active ? '#3730a3' : '#1e293b',
      border: '1px solid',
      borderColor: primary ? '#6366f1' : active ? '#a5b4fc' : 'transparent',
      padding: '4px 10px',
      borderRadius: 6,
      fontSize: 13,
      fontWeight: primary ? 600 : 500,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      minWidth: 28,
      ...(style || {}),
    }}
  >
    {label}
  </button>
);

const Sep = () => <div style={{ width: 1, height: 20, background: '#e5e7eb', margin: '0 4px' }} />;

const SegmentedControl = ({ value, options, onChange, disabled }) => (
  <div
    style={{
      display: 'inline-flex',
      border: '1px solid #e5e7eb',
      borderRadius: 6,
      overflow: 'hidden',
      opacity: disabled ? 0.5 : 1,
    }}
  >
    {options.map((opt) => (
      <button
        key={opt.value}
        onClick={() => !disabled && onChange(opt.value)}
        disabled={disabled}
        style={{
          background: value === opt.value ? '#1e293b' : '#fff',
          color: value === opt.value ? '#fff' : '#475569',
          border: 'none',
          padding: '4px 10px',
          fontSize: 12,
          fontWeight: 500,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

const ActivitySidebar = ({ comments, changes, ui, ready }) => {
  const isEmpty = ready && comments.items.length === 0 && changes.items.length === 0;

  return (
    <div
      style={{
        width: 260,
        background: '#fafbfc',
        overflow: 'auto',
        padding: 12,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', marginBottom: 12, letterSpacing: 0.3 }}>
        ACTIVITY
      </div>
      {isEmpty && (
        <div
          style={{
            padding: 12,
            background: '#fff',
            border: '1px dashed #cbd5e1',
            borderRadius: 8,
            fontSize: 12,
            color: '#64748b',
            lineHeight: 1.5,
          }}
        >
          <div style={{ marginBottom: 8 }}>Nothing here yet.</div>
          <div>Select text and click Comment, or switch to Suggest and edit the text.</div>
        </div>
      )}
      {comments.items.map((c) => (
        <div
          key={c.id}
          style={{
            padding: 10,
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            marginBottom: 8,
            fontSize: 12,
          }}
        >
          <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>Comment</div>
          {c.anchoredText ? (
            <div style={{ color: '#64748b', fontStyle: 'italic', marginBottom: 6 }}>
              "{(c.anchoredText || '').slice(0, 80)}"
            </div>
          ) : null}
          <div style={{ color: '#1e293b', marginBottom: 8 }}>{c.text}</div>
          <button onClick={() => ui?.comments.resolve(c.id)} style={pillBtnStyle}>
            Resolve
          </button>
        </div>
      ))}
      {changes.items.map((item) => {
        const change = item.change || item;
        return (
          <div
            key={item.id}
            style={{
              padding: 10,
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              marginBottom: 8,
              fontSize: 12,
            }}
          >
            <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>
              {change.type === 'insert' ? 'Insertion' : change.type === 'delete' ? 'Deletion' : 'Change'}
            </div>
            {change.excerpt ? (
              <div style={{ color: '#64748b', fontStyle: 'italic', marginBottom: 6 }}>
                "{(change.excerpt || '').slice(0, 80)}"
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => ui?.trackChanges.accept(item.id)} style={pillBtnPrimary}>
                Accept
              </button>
              <button onClick={() => ui?.trackChanges.reject(item.id)} style={pillBtnStyle}>
                Reject
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const pillBtnStyle = {
  background: '#fff',
  color: '#475569',
  border: '1px solid #cbd5e1',
  padding: '4px 10px',
  borderRadius: 6,
  fontSize: 11,
  fontWeight: 500,
  cursor: 'pointer',
};

const pillBtnPrimary = {
  ...pillBtnStyle,
  background: '#6366f1',
  color: '#fff',
  borderColor: '#6366f1',
};
