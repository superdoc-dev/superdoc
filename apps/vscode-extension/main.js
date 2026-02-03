/**
 * SuperDoc Webview Main Script
 * Handles initialization of SuperDoc and communication with VS Code extension
 */

(function () {
  // VS Code API for communicating with the extension
  const vscode = acquireVsCodeApi();

  // State
  let superdocInstance = null;
  let currentFileName = '';
  let isDirty = false;
  let saveTimeout = null;
  const DEBOUNCE_DELAY = 1000; // 1 second debounce for auto-save

  // DOM Elements
  const loadingEl = document.getElementById('loading');
  const containerEl = document.getElementById('superdoc-container');
  const statusTextEl = document.getElementById('status-text');
  const saveIndicatorEl = document.getElementById('save-indicator');

  /**
   * Update status bar text
   */
  function setStatus(text) {
    if (statusTextEl) {
      statusTextEl.textContent = text;
    }
  }

  /**
   * Update save indicator
   */
  function setSaveState(state) {
    if (saveIndicatorEl) {
      saveIndicatorEl.className = state;
      switch (state) {
        case 'saving':
          saveIndicatorEl.textContent = 'Saving...';
          break;
        case 'saved':
          saveIndicatorEl.textContent = 'Saved';
          break;
        case 'dirty':
          saveIndicatorEl.textContent = 'Unsaved changes';
          break;
        default:
          saveIndicatorEl.textContent = '';
      }
    }
  }

  /**
   * Hide loading state
   */
  function hideLoading() {
    if (loadingEl) {
      loadingEl.classList.add('hidden');
    }
  }

  /**
   * Show error message
   */
  function showError(message) {
    hideLoading();
    containerEl.innerHTML = `
      <div class="error-container">
        <h2>Error Loading Document</h2>
        <p>${message}</p>
      </div>
    `;
    vscode.postMessage({ type: 'error', message });
  }

  /**
   * Convert array to Uint8Array and then to Blob
   */
  function arrayToBlob(array) {
    const uint8Array = new Uint8Array(array);
    return new Blob([uint8Array], { 
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
    });
  }

  /**
   * Initialize SuperDoc with document data
   */
  async function initSuperdoc(docData, fileName) {
    try {
      currentFileName = fileName;
      setStatus(`Loading: ${fileName.split(/[/\\]/).pop()}`);

      // Convert array data to blob
      const docBlob = arrayToBlob(docData);
      const docFile = new File([docBlob], fileName.split(/[/\\]/).pop() || 'document.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });

      // Check if SuperDoc is available
      if (typeof SuperDoc === 'undefined') {
        throw new Error('SuperDoc library not loaded. Please check your internet connection.');
      }

      // Initialize SuperDoc
      // Based on the vanilla example pattern
      superdocInstance = new SuperDoc({
        selector: '#superdoc-container',
        documents: [
          {
            id: 'main-doc',
            file: docFile,
          }
        ],
        // Enable editing
        editable: true,
        // Toolbar configuration
        toolbar: {
          enabled: true,
        },
        // Handle content changes
        onContentChange: handleContentChange,
        onReady: handleReady,
        onError: handleSuperdocError,
      });

    } catch (error) {
      console.error('Failed to initialize SuperDoc:', error);
      showError(error.message || 'Failed to initialize document editor');
    }
  }

  /**
   * Handle SuperDoc ready event
   */
  function handleReady() {
    hideLoading();
    setStatus(`Editing: ${currentFileName.split(/[/\\]/).pop()}`);
    setSaveState('saved');
    console.log('SuperDoc initialized successfully');
  }

  /**
   * Handle SuperDoc errors
   */
  function handleSuperdocError(error) {
    console.error('SuperDoc error:', error);
    showError(error.message || 'An error occurred in the document editor');
  }

  /**
   * Handle content changes - debounced auto-save
   */
  function handleContentChange() {
    isDirty = true;
    setSaveState('dirty');

    // Clear existing timeout
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }

    // Debounce the save operation
    saveTimeout = setTimeout(() => {
      saveDocument();
    }, DEBOUNCE_DELAY);
  }

  /**
   * Export document and send to extension for saving
   */
  async function saveDocument() {
    if (!superdocInstance || !isDirty) {
      return;
    }

    try {
      setSaveState('saving');
      setStatus('Saving...');

      // Export the document using SuperDoc's export functionality
      const exportedBlob = await superdocInstance.export({
        type: 'docx',
      });

      // Convert blob to array for message passing
      const arrayBuffer = await exportedBlob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // Send to extension
      vscode.postMessage({
        type: 'update',
        data: Array.from(uint8Array),
      });

      isDirty = false;
      setSaveState('saved');
      setStatus(`Editing: ${currentFileName.split(/[/\\]/).pop()}`);

    } catch (error) {
      console.error('Failed to save document:', error);
      setSaveState('dirty');
      setStatus('Save failed');
      vscode.postMessage({ 
        type: 'error', 
        message: `Failed to save: ${error.message}` 
      });
    }
  }

  /**
   * Handle messages from the VS Code extension
   */
  window.addEventListener('message', async (event) => {
    const message = event.data;

    switch (message.type) {
      case 'init':
        // Initialize SuperDoc with the document data
        await initSuperdoc(message.data.content, message.data.fileName);
        break;

      case 'saved':
        // Extension confirmed save
        setSaveState('saved');
        setStatus(`Editing: ${currentFileName.split(/[/\\]/).pop()}`);
        break;

      case 'reload':
        // Reload the document (e.g., after external change)
        if (message.data && message.data.content) {
          await initSuperdoc(message.data.content, currentFileName);
        }
        break;
    }
  });

  // Handle keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + S to save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveDocument();
    }
  });

  // Signal that the webview is ready
  vscode.postMessage({ type: 'ready' });
  setStatus('Initializing...');

})();
