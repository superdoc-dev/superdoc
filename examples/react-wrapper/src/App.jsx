import { useRef, useState } from 'react';
import { SuperDocEditor } from '@superdoc/react';
import '@superdoc/react/style.css';
import './App.css';

// Define users as constants to avoid creating new objects on every render
// This prevents infinite loops when callbacks trigger re-renders
const USERS = {
  alice: { name: 'Alice', email: 'alice@company.com' },
  uploader: { name: 'Uploader', email: 'uploader@example.com' },
  searcher: { name: 'Searcher', email: 'search@example.com' },
  reviewer: { name: 'Reviewer', email: 'reviewer@example.com' },
  accessibility: { name: 'User', email: 'user@example.com' },
  tester: { name: 'Test User', email: 'test@example.com' },
  logger: { name: 'Logger', email: 'logger@example.com' },
  exporter: { name: 'Exporter', email: 'export@example.com' },
  minimalist: { name: 'Minimalist', email: 'min@example.com' },
};

// Users list for mentions demo
const MENTION_USERS = [
  { name: 'Alice Johnson', email: 'alice@company.com', image: null },
  { name: 'Bob Smith', email: 'bob@company.com', image: null },
  { name: 'Carol White', email: 'carol@company.com', image: null },
  { name: 'David Brown', email: 'david@company.com', image: null },
];

// Modules config for comments
const COMMENTS_MODULE = {
  comments: {
    enabled: true,
  },
};

// Example 1: Basic Editor with Ref Methods
function BasicEditor({ document, title, user }) {
  const editorRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  // Track mode in state for UI only - actual mode changes use getInstance()
  const [mode, setMode] = useState('editing');

  const handleExport = async () => {
    await editorRef.current?.getInstance()?.export({ triggerDownload: true });
  };

  // Use imperative API to change mode (no rebuild)
  const handleModeChange = (newMode) => {
    editorRef.current?.getInstance()?.setDocumentMode(newMode);
    setMode(newMode); // Update UI state to reflect the change
  };

  return (
    <div className="editor-panel">
      <div className="panel-header">
        <h3>{title}</h3>
        {isReady && (
          <div className="panel-controls">
            <select value={mode} onChange={(e) => handleModeChange(e.target.value)}>
              <option value="editing">Edit</option>
              <option value="suggesting">Suggest</option>
              <option value="viewing">View</option>
            </select>
            <button onClick={handleExport}>Export</button>
            <button onClick={() => editorRef.current?.getInstance()?.focus()}>Focus</button>
          </div>
        )}
      </div>
      <div className="panel-content">
        <SuperDocEditor
          ref={editorRef}
          document={document}
          documentMode="editing"
          user={user}
          rulers={true}
          renderLoading={() => (
            <div className="loading">
              <div className="spinner" />
              <p>Loading...</p>
            </div>
          )}
          onReady={() => setIsReady(true)}
          style={{ height: '100%' }}
        />
      </div>
    </div>
  );
}

// Example 2: File Upload Editor
function FileUploadEditor({ title }) {
  const [file, setFile] = useState(null);
  const editorRef = useRef(null);
  const fileInputRef = useRef(null);

  const handleFile = (e) => {
    const selected = e.target.files?.[0];
    if (selected) setFile(selected);
  };

  const handleExport = async () => {
    const blob = await editorRef.current?.getInstance()?.export({ triggerDownload: false });
    if (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'exported.docx';
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="editor-panel">
      <div className="panel-header">
        <h3>{title}</h3>
        <div className="panel-controls">
          <button onClick={() => fileInputRef.current?.click()}>
            {file ? 'Change File' : 'Upload DOCX'}
          </button>
          <input
            type="file"
            ref={fileInputRef}
            accept=".docx"
            onChange={handleFile}
            hidden
          />
          {file && <button onClick={handleExport}>Export</button>}
        </div>
      </div>
      <div className="panel-content">
        {file ? (
          <SuperDocEditor
            ref={editorRef}
            document={file}
            user={USERS.uploader}
            renderLoading={() => (
              <div className="loading">
                <div className="spinner" />
                <p>Processing file...</p>
              </div>
            )}
            style={{ height: '100%' }}
          />
        ) : (
          <div className="empty-state">
            <p>Upload a .docx file to begin editing</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Example 3: View-Only Mode
function ViewOnlyEditor({ document, title }) {
  return (
    <div className="editor-panel">
      <div className="panel-header">
        <h3>{title}</h3>
        <span className="badge">View Only</span>
      </div>
      <div className="panel-content">
        <SuperDocEditor
          document={document}
          documentMode="viewing"
          hideToolbar
          style={{ height: '100%' }}
        />
      </div>
    </div>
  );
}

// Example 4: Search Demo
function SearchEditor({ document, title }) {
  const editorRef = useRef(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);

  const handleSearch = () => {
    if (!searchTerm.trim()) return;
    const instance = editorRef.current?.getInstance();
    const matches = instance?.search(searchTerm) || [];
    setResults(matches);
    setCurrentIndex(matches.length > 0 ? 0 : -1);
    if (matches.length > 0) {
      instance?.goToSearchResult(matches[0]);
    }
  };

  const navigateResult = (direction) => {
    if (results.length === 0) return;
    const newIndex = (currentIndex + direction + results.length) % results.length;
    setCurrentIndex(newIndex);
    editorRef.current?.getInstance()?.goToSearchResult(results[newIndex]);
  };

  return (
    <div className="editor-panel">
      <div className="panel-header">
        <h3>{title}</h3>
        <div className="search-controls">
          <input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button onClick={handleSearch}>Find</button>
          {results.length > 0 && (
            <>
              <button onClick={() => navigateResult(-1)}>&larr;</button>
              <span className="result-count">
                {currentIndex + 1}/{results.length}
              </span>
              <button onClick={() => navigateResult(1)}>&rarr;</button>
            </>
          )}
        </div>
      </div>
      <div className="panel-content">
        <SuperDocEditor
          ref={editorRef}
          document={document}
          user={USERS.searcher}
          style={{ height: '100%' }}
        />
      </div>
    </div>
  );
}

// Example 5: Track Changes Demo
function TrackChangesEditor({ document, title }) {
  const editorRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const [tcMode, setTcMode] = useState('review');

  const handleTcModeChange = (mode) => {
    setTcMode(mode);
    editorRef.current?.getInstance()?.setTrackedChangesPreferences({ mode, enabled: true });
  };

  return (
    <div className="editor-panel">
      <div className="panel-header">
        <h3>{title}</h3>
        {isReady && (
          <div className="panel-controls">
            <span className="control-label">Track Changes:</span>
            <select value={tcMode} onChange={(e) => handleTcModeChange(e.target.value)}>
              <option value="review">Review (show all)</option>
              <option value="original">Original (hide changes)</option>
              <option value="final">Final (accept all)</option>
            </select>
          </div>
        )}
      </div>
      <div className="panel-content">
        <SuperDocEditor
          ref={editorRef}
          document={document}
          documentMode="suggesting"
          user={USERS.reviewer}
          onReady={() => setIsReady(true)}
          style={{ height: '100%' }}
        />
      </div>
    </div>
  );
}

// Example 6: Accessibility Options
function AccessibilityEditor({ document, title }) {
  const editorRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [showRulers, setShowRulers] = useState(true);

  const toggleHighContrast = () => {
    const next = !highContrast;
    setHighContrast(next);
    editorRef.current?.getInstance()?.setHighContrastMode(next);
  };

  const toggleRulers = () => {
    setShowRulers(!showRulers);
    editorRef.current?.getInstance()?.toggleRuler();
  };

  return (
    <div className="editor-panel">
      <div className="panel-header">
        <h3>{title}</h3>
        {isReady && (
          <div className="panel-controls">
            <button
              className={highContrast ? 'active' : ''}
              onClick={toggleHighContrast}
            >
              High Contrast {highContrast ? 'ON' : 'OFF'}
            </button>
            <button
              className={showRulers ? 'active' : ''}
              onClick={toggleRulers}
            >
              Rulers {showRulers ? 'ON' : 'OFF'}
            </button>
          </div>
        )}
      </div>
      <div className="panel-content">
        <SuperDocEditor
          ref={editorRef}
          document={document}
          rulers={showRulers}
          user={USERS.accessibility}
          onReady={() => setIsReady(true)}
          style={{ height: '100%' }}
        />
      </div>
    </div>
  );
}

// Example 7: Role-Based Permissions
function RolesEditor({ document, title }) {
  const [role, setRole] = useState('editor');
  const [key, setKey] = useState(0);

  const handleRoleChange = (newRole) => {
    setRole(newRole);
    setKey((k) => k + 1); // Force re-mount with new role
  };

  return (
    <div className="editor-panel">
      <div className="panel-header">
        <h3>{title}</h3>
        <div className="panel-controls">
          <span className="control-label">Role:</span>
          <select value={role} onChange={(e) => handleRoleChange(e.target.value)}>
            <option value="editor">Editor (full access)</option>
            <option value="suggester">Suggester (suggestions only)</option>
            <option value="viewer">Viewer (read only)</option>
          </select>
        </div>
      </div>
      <div className="panel-content">
        <SuperDocEditor
          key={key}
          document={document}
          role={role}
          documentMode={role === 'viewer' ? 'viewing' : 'editing'}
          user={USERS.tester}
          style={{ height: '100%' }}
        />
      </div>
    </div>
  );
}

// Example 8: Events Logger
function EventsEditor({ document, title }) {
  const editorRef = useRef(null);
  const [events, setEvents] = useState([]);

  const logEvent = (name, data) => {
    const time = new Date().toLocaleTimeString();
    setEvents((prev) => [...prev.slice(-9), { time, name, data }]);
  };

  const clearLog = () => setEvents([]);

  return (
    <div className="editor-panel">
      <div className="panel-header">
        <h3>{title}</h3>
        <div className="panel-controls">
          <button onClick={clearLog}>Clear Log</button>
          <span className="badge">{events.length} events</span>
        </div>
      </div>
      <div className="panel-content split-view">
        <div className="editor-side">
          <SuperDocEditor
            ref={editorRef}
            document={document}
            user={USERS.logger}
            onReady={() => logEvent('ready', {})}
            onEditorCreate={() => logEvent('editorCreate', {})}
            onEditorUpdate={() => logEvent('editorUpdate', {})}
            onEditorDestroy={() => logEvent('editorDestroy', {})}
            onContentError={(e) => logEvent('contentError', e)}
            onException={(e) => logEvent('exception', e)}
            style={{ height: '100%' }}
          />
        </div>
        <div className="events-side">
          <div className="events-log">
            {events.length === 0 ? (
              <p className="empty-log">Events will appear here...</p>
            ) : (
              events.map((evt, i) => (
                <div key={i} className="event-item">
                  <span className="event-time">{evt.time}</span>
                  <span className="event-name">{evt.name}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Example 9: HTML Export
function HtmlExportEditor({ document, title }) {
  const editorRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const [html, setHtml] = useState('');
  const [showHtml, setShowHtml] = useState(false);

  const extractHtml = () => {
    const result = editorRef.current?.getInstance()?.getHTML() || [];
    setHtml(result.join('\n\n--- Document Break ---\n\n'));
    setShowHtml(true);
  };

  return (
    <div className="editor-panel">
      <div className="panel-header">
        <h3>{title}</h3>
        {isReady && (
          <div className="panel-controls">
            <button onClick={extractHtml}>Get HTML</button>
            {showHtml && (
              <button onClick={() => setShowHtml(false)}>Hide HTML</button>
            )}
          </div>
        )}
      </div>
      <div className="panel-content split-view">
        <div className={showHtml ? 'editor-side' : 'editor-side full'}>
          <SuperDocEditor
            ref={editorRef}
            document={document}
            user={USERS.exporter}
            onReady={() => setIsReady(true)}
            style={{ height: '100%' }}
          />
        </div>
        {showHtml && (
          <div className="html-side">
            <pre className="html-output">{html || 'No content'}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

// Example 10: Minimal / No Toolbar
function MinimalEditor({ document, title }) {
  const editorRef = useRef(null);
  const [isReady, setIsReady] = useState(false);

  return (
    <div className="editor-panel minimal">
      <div className="panel-header">
        <h3>{title}</h3>
        {isReady && (
          <div className="panel-controls">
            <button onClick={() => editorRef.current?.getInstance()?.focus()}>Focus</button>
            <button onClick={() => editorRef.current?.getInstance()?.export({ triggerDownload: true })}>
              Export
            </button>
          </div>
        )}
      </div>
      <div className="panel-content">
        <SuperDocEditor
          ref={editorRef}
          document={document}
          hideToolbar
          rulers={false}
          user={USERS.minimalist}
          onReady={() => setIsReady(true)}
          style={{ height: '100%' }}
        />
      </div>
    </div>
  );
}

// Example 11: Multiple Users (Mentions)
function UsersEditor({ document, title }) {
  return (
    <div className="editor-panel">
      <div className="panel-header">
        <h3>{title}</h3>
        <div className="panel-controls">
          <span className="control-label">Users for @mentions:</span>
          {MENTION_USERS.slice(0, 3).map((u) => (
            <span key={u.email} className="user-chip">{u.name.split(' ')[0]}</span>
          ))}
          <span className="user-chip">+{MENTION_USERS.length - 3}</span>
        </div>
      </div>
      <div className="panel-content">
        <SuperDocEditor
          document={document}
          user={MENTION_USERS[0]}
          users={MENTION_USERS}
          modules={COMMENTS_MODULE}
          style={{ height: '100%' }}
        />
      </div>
    </div>
  );
}

// Main App with Tabs
function App() {
  const [activeTab, setActiveTab] = useState(0);
  const sampleDoc = '/sample.docx';

  const editors = [
    {
      id: 'basic',
      title: 'Basic',
      component: <BasicEditor document={sampleDoc} title="Basic Editor" user={USERS.alice} />,
    },
    {
      id: 'upload',
      title: 'Upload',
      component: <FileUploadEditor title="File Upload" />,
    },
    {
      id: 'view',
      title: 'View Only',
      component: <ViewOnlyEditor document={sampleDoc} title="View Only" />,
    },
    {
      id: 'search',
      title: 'Search',
      component: <SearchEditor document={sampleDoc} title="Search Demo" />,
    },
    {
      id: 'track-changes',
      title: 'Track Changes',
      component: <TrackChangesEditor document={sampleDoc} title="Track Changes" />,
    },
    {
      id: 'accessibility',
      title: 'Accessibility',
      component: <AccessibilityEditor document={sampleDoc} title="Accessibility Options" />,
    },
    {
      id: 'roles',
      title: 'Roles',
      component: <RolesEditor document={sampleDoc} title="Role-Based Permissions" />,
    },
    {
      id: 'events',
      title: 'Events',
      component: <EventsEditor document={sampleDoc} title="Events Logger" />,
    },
    {
      id: 'html-export',
      title: 'HTML Export',
      component: <HtmlExportEditor document={sampleDoc} title="HTML Export" />,
    },
    {
      id: 'minimal',
      title: 'Minimal',
      component: <MinimalEditor document={sampleDoc} title="Minimal (No Toolbar)" />,
    },
    {
      id: 'users',
      title: 'Users',
      component: <UsersEditor document={sampleDoc} title="Multiple Users & Mentions" />,
    },
  ];

  return (
    <div className="app">
      <header className="app-header">
        <h1>@superdoc/react</h1>
      </header>

      <main className="tabs-layout">
        <div className="tab-bar">
          {editors.map((editor, index) => (
            <button
              key={editor.id}
              className={`tab ${activeTab === index ? 'active' : ''}`}
              onClick={() => setActiveTab(index)}
            >
              {editor.title}
            </button>
          ))}
        </div>
        <div className="tab-content">
          {editors[activeTab].component}
        </div>
      </main>
    </div>
  );
}

export default App;
