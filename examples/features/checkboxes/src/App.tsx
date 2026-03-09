import { useEffect, useRef, useState } from 'react';
import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

/**
 * Checkboxes Example
 *
 * This example demonstrates how to:
 * 1. Add a custom "Insert Checkbox" button to the toolbar
 * 2. Insert checkbox content controls at the cursor position
 * 3. Toggle checkboxes programmatically
 * 4. List all checkboxes in the document
 */
export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [checkboxes, setCheckboxes] = useState<any[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const superdocRef = useRef<any>(null);

  // Insert a checkbox at the current cursor position
  const insertCheckbox = async () => {
    const editor = superdocRef.current?.activeEditor;
    if (!editor) return;

    // Step 1: Wrap the current selection (or cursor) in a content control
    const wrapResult = await editor.doc.contentControls.wrap({
      selection: { kind: 'current' },
      tag: `checkbox-${Date.now()}`, // Unique tag for identification
      title: 'Checkbox',
    });

    if (!wrapResult.success) {
      console.error('Failed to create content control:', wrapResult.failure);
      return;
    }

    // Step 2: Convert the content control to a checkbox type
    const setTypeResult = await editor.doc.contentControls.setType({
      target: wrapResult.contentControl,
      controlType: 'checkbox',
    });

    if (!setTypeResult.success) {
      console.error('Failed to set checkbox type:', setTypeResult.failure);
      return;
    }

    console.log('Checkbox inserted:', setTypeResult.contentControl);
    refreshCheckboxList();
  };

  // Toggle a specific checkbox by its nodeId
  const toggleCheckbox = async (checkbox: any) => {
    const editor = superdocRef.current?.activeEditor;
    if (!editor) return;

    const result = await editor.doc.contentControls.checkbox.toggle({
      target: {
        kind: checkbox.kind,
        nodeType: 'sdt',
        nodeId: checkbox.nodeId,
      },
    });

    if (result.success) {
      console.log('Checkbox toggled');
      refreshCheckboxList();
    } else {
      console.error('Failed to toggle checkbox:', result.failure);
    }
  };

  // Get the checked state of a checkbox
  const getCheckboxState = (checkbox: any): boolean => {
    const editor = superdocRef.current?.activeEditor;
    if (!editor) return false;

    try {
      const state = editor.doc.contentControls.checkbox.getState({
        target: {
          kind: checkbox.kind,
          nodeType: 'sdt',
          nodeId: checkbox.nodeId,
        },
      });
      return state.checked;
    } catch {
      return false;
    }
  };

  // Refresh the list of checkboxes in the document
  const refreshCheckboxList = () => {
    const editor = superdocRef.current?.activeEditor;
    if (!editor) return;

    // List all content controls and filter for checkboxes
    const allControls = editor.doc.contentControls.list();
    const checkboxControls = allControls.items.filter(
      (item: any) => item.type === 'checkbox'
    );

    // Add checked state to each checkbox
    const checkboxesWithState = checkboxControls.map((cb: any) => ({
      ...cb,
      checked: getCheckboxState(cb),
    }));

    setCheckboxes(checkboxesWithState);
  };

  useEffect(() => {
    if (!file || !containerRef.current) return;

    superdocRef.current?.destroy();
    superdocRef.current = new SuperDoc({
      selector: containerRef.current,
      document: file,
      toolbar: '#toolbar',
      modules: {
        toolbar: {
          // Add the checkbox button to the toolbar
          customButtons: [
            {
              type: 'button',
              name: 'insertCheckbox',
              tooltip: 'Insert Checkbox',
              icon: checkboxIcon,
              group: 'center',
              command: insertCheckbox,
            },
          ],
        },
      },
      onReady: () => {
        // Load existing checkboxes when document is ready
        setTimeout(refreshCheckboxList, 500);
      },
    });

    return () => {
      superdocRef.current?.destroy();
      superdocRef.current = null;
    };
  }, [file]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Header */}
      <header
        style={{
          padding: '0.75rem 1rem',
          background: '#f5f5f5',
          borderBottom: '1px solid #ddd',
          display: 'flex',
          gap: '1rem',
          alignItems: 'center',
        }}
      >
        <input
          type="file"
          accept=".docx"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <button onClick={insertCheckbox} disabled={!file}>
          Insert Checkbox
        </button>
        <button onClick={refreshCheckboxList} disabled={!file}>
          Refresh List
        </button>
      </header>

      {/* Toolbar */}
      <div id="toolbar" />

      {/* Main content area */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Document editor */}
        <div ref={containerRef} style={{ flex: 1, overflow: 'auto' }} />

        {/* Checkbox sidebar */}
        {file && (
          <aside
            style={{
              width: '280px',
              borderLeft: '1px solid #ddd',
              padding: '1rem',
              overflow: 'auto',
              background: '#fafafa',
            }}
          >
            <h3 style={{ marginBottom: '1rem' }}>
              Checkboxes ({checkboxes.length})
            </h3>
            {checkboxes.length === 0 ? (
              <p style={{ color: '#666', fontSize: '0.9rem' }}>
                No checkboxes found. Click "Insert Checkbox" to add one.
              </p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {checkboxes.map((cb, index) => (
                  <li
                    key={cb.nodeId}
                    style={{
                      padding: '0.5rem',
                      marginBottom: '0.5rem',
                      background: '#fff',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={cb.checked}
                      onChange={() => toggleCheckbox(cb)}
                    />
                    <span style={{ flex: 1 }}>
                      {cb.title || `Checkbox ${index + 1}`}
                    </span>
                    <code style={{ fontSize: '0.7rem', color: '#888' }}>
                      {cb.tag}
                    </code>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

// Checkbox icon SVG
const checkboxIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
  <path d="M9 12l2 2 4-4"/>
</svg>`;
