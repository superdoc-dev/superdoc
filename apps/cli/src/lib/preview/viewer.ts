// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ViewerHtmlOptions {
  /** URL to fetch the document from. */
  documentUrl: string;
  /** Poll interval in milliseconds. */
  pollIntervalMs?: number;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Generates the HTML for the SuperDoc preview viewer.
 *
 * This creates a standalone HTML page that:
 * 1. Loads the document from the server
 * 2. Displays it using SuperDoc
 * 3. Polls for changes and reloads when the file is modified
 */
export function generateViewerHtml(options: ViewerHtmlOptions): string {
  const { documentUrl, pollIntervalMs = 1000 } = options;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SuperDoc Preview</title>
  <link rel="stylesheet" href="/superdoc/style.css">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    html, body {
      min-height: 100%;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #e5e5e5;
    }
    .header {
      background: #1a1a2e;
      color: white;
      padding: 12px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .header h1 {
      font-size: 16px;
      font-weight: 500;
    }
    .download-btn {
      background: #3b82f6;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .download-btn:hover {
      background: #2563eb;
    }
    /* Hide SuperDoc sidebar/scrollbar area */
    #superdoc-container > div {
      border: none !important;
    }
    [class*="sidebar"], [class*="Sidebar"], [class*="scrollbar-track"] {
      display: none !important;
    }
    .editor-container {
      display: flex;
      justify-content: center;
      padding: 24px;
      padding-bottom: 48px;
    }
    #superdoc-container {
      width: 100%;
      max-width: 900px;
      background: white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      border-radius: 4px;
    }
    .loading-overlay, .error-overlay {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px;
      color: #666;
    }
    .error-overlay {
      color: #ef4444;
    }
    .error-overlay code {
      display: block;
      margin-top: 10px;
      font-size: 12px;
      background: #fee2e2;
      padding: 8px 12px;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>SuperDoc Preview</h1>
    <button class="download-btn" id="download-btn">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      Download
    </button>
  </div>
  <div class="editor-container">
    <div id="superdoc-container"></div>
  </div>

  <!-- Load SuperDoc IIFE bundle (exposes window.SuperDoc) -->
  <script src="/superdoc/superdoc.min.js"></script>
  <script>
    const CONFIG = {
      documentUrl: ${JSON.stringify(documentUrl)},
      pollIntervalMs: ${pollIntervalMs}
    };

    const container = document.getElementById('superdoc-container');
    const downloadBtn = document.getElementById('download-btn');

    let superdoc = null;

    async function loadDocument() {
      try {
        // Fetch the document
        const response = await fetch(CONFIG.documentUrl);
        if (!response.ok) {
          throw new Error('Failed to fetch document: ' + response.status);
        }

        const blob = await response.blob();
        const file = new File([blob], 'document.docx', {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        });

        // Destroy existing instance if any
        if (superdoc) {
          superdoc.destroy();
          container.innerHTML = '';
        }

        // Create new SuperDoc instance using the global SuperDoc class
        superdoc = new SuperDoc({
          selector: '#superdoc-container',
          document: file,
          documentMode: 'viewing',
          telemetry: { enabled: false },
        });

        console.log('[preview] Document loaded');

      } catch (err) {
        console.error('[preview] Error loading document:', err);
        container.innerHTML = '<div class="error-overlay"><span>Failed to load document</span><code>' +
          (err.message || 'Unknown error') + '</code></div>';
      }
    }

    async function checkForChanges() {
      try {
        const response = await fetch('/check');
        const data = await response.json();

        if (data.changed) {
          console.log('[preview] Document changed, reloading...');
          await loadDocument();
        }
      } catch (err) {
        console.warn('[preview] Failed to check for changes:', err);
      }
    }

    // Download button
    downloadBtn.addEventListener('click', async () => {
      const response = await fetch(CONFIG.documentUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'document.docx';
      a.click();
      URL.revokeObjectURL(url);
    });

    // Initial load
    loadDocument();

    // Poll for changes
    setInterval(checkForChanges, CONFIG.pollIntervalMs);
  </script>
</body>
</html>`;
}
