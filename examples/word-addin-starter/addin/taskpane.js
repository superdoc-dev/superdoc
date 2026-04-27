/* global Office, Word */

// ============================================================
// CONFIGURATION - Update these for your environment
// ============================================================
const CONFIG = {
  // WebSocket server for sync (wss:// required for Word's secure WebView)
  serverUrl: 'https://localhost:8080',

  // Where the web editor is hosted
  webEditorUrl: 'http://localhost:5173',

  // Debounce delay for document changes (ms)
  syncDelay: 1000
};

// ============================================================
// STATE
// ============================================================
let websocket = null;
let isReceivingUpdate = false;

// ============================================================
// OFFICE.JS ENTRY POINT
// ============================================================
Office.onReady((info) => {
  const inWord = info.host === Office.HostType.Word;

  if (!inWord) {
    console.log('Not running in Word - debug mode enabled');
    setStatus('Debug mode (not in Word)', 'connecting');
  } else {
    console.log('Office.js ready in Word');
  }

  // Always wire up buttons - for debugging WebSocket outside Word
  document.getElementById('startSync').onclick = startSync;
  document.getElementById('openWebEditor').onclick = () => {
    window.open(CONFIG.webEditorUrl, '_blank');
  };
});

// ============================================================
// UI HELPERS
// ============================================================
function setStatus(text, state = 'disconnected') {
  const dot = document.getElementById('statusDot');
  const textEl = document.getElementById('statusText');

  dot.className = 'status-dot ' + state;
  textEl.textContent = text;
}

function debugLog(msg) {
  console.log('[DEBUG]', msg);
  let log = document.getElementById('debugLog');
  if (!log) {
    log = document.createElement('pre');
    log.id = 'debugLog';
    log.style.cssText = 'margin-top:12px;padding:8px;background:#f0f0f0;border-radius:4px;font-size:11px;max-height:150px;overflow:auto;';
    document.getElementById('status').after(log);
  }
  log.textContent += new Date().toLocaleTimeString() + ' ' + msg + '\n';
  log.scrollTop = log.scrollHeight;
}

// ============================================================
// WEBSOCKET CONNECTION
// ============================================================
let connectionAttempts = 0;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 2000;

function startSync() {
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    console.log('Already connected');
    return;
  }

  connectionAttempts++;
  const attemptText = connectionAttempts > 1 ? ` (attempt ${connectionAttempts}/${MAX_RETRY_ATTEMPTS})` : '';
  setStatus(`Connecting...${attemptText}`, 'connecting');

  const wsUrl = CONFIG.serverUrl.replace(/^http/, 'ws');

  try {
    debugLog(`Connecting to ${wsUrl}...`);
    websocket = new WebSocket(wsUrl);
  } catch (error) {
    console.error('Failed to create WebSocket:', error);
    debugLog(`WebSocket error: ${error.message}`);
    handleConnectionFailure('Failed to connect to server');
    return;
  }

  // Timeout for connection attempt
  const connectionTimeout = setTimeout(() => {
    if (websocket.readyState !== WebSocket.OPEN) {
      websocket.close();
      handleConnectionFailure('Connection timed out');
    }
  }, 5000);

  websocket.onopen = async () => {
    clearTimeout(connectionTimeout);
    connectionAttempts = 0;
    clearErrorDetails();
    console.log('WebSocket connected');
    debugLog('WebSocket OPEN');
    setStatus('Connected', 'connected');

    // Send current document to server
    try {
      await sendDocument();
      // Start listening for document changes
      startDocumentChangeListener();
    } catch (error) {
      console.error('Failed to send initial document:', error);
      setStatus('Failed to sync document', 'error');
    }
  };

  websocket.onmessage = async (event) => {
    try {
      const message = JSON.parse(event.data);

      if (message.type === 'document_update' && message.author !== 'word-addin') {
        console.log('Received update from:', message.author);
        await receiveDocument(message.document);
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  };

  websocket.onclose = (event) => {
    clearTimeout(connectionTimeout);
    console.log('WebSocket disconnected', event.code, event.reason);
    debugLog(`WebSocket CLOSED: code=${event.code} reason=${event.reason || 'none'}`);

    if (event.code === 1006) {
      // Abnormal closure - server probably not running
      handleConnectionFailure('Server unavailable');
    } else {
      setStatus('Disconnected', 'disconnected');
    }
  };

  websocket.onerror = (error) => {
    clearTimeout(connectionTimeout);
    console.error('WebSocket error:', error);
    debugLog(`WebSocket ERROR: ${error.message || error.type || 'unknown'}`);
    // Error details come through onclose, so we don't set status here
  };
}

function handleConnectionFailure(reason) {
  if (connectionAttempts < MAX_RETRY_ATTEMPTS) {
    setStatus(`${reason}. Retrying...`, 'error');
    setTimeout(startSync, RETRY_DELAY);
  } else {
    setStatus(`${reason}. Is the server running?`, 'error');
    connectionAttempts = 0;
    showErrorDetails(`Could not connect to ${CONFIG.serverUrl}.\n\nMake sure the sync server is running:\n  cd server && npm start`);
  }
}

function showErrorDetails(message) {
  // Show error in a more visible way
  let errorDiv = document.getElementById('errorDetails');
  if (!errorDiv) {
    errorDiv = document.createElement('div');
    errorDiv.id = 'errorDetails';
    errorDiv.style.cssText = 'margin-top:12px;padding:12px;background:#fff3f3;border:1px solid #dc3545;border-radius:6px;font-size:12px;color:#721c24;white-space:pre-wrap;';
    document.getElementById('status').after(errorDiv);
  }
  errorDiv.textContent = message;
}

function clearErrorDetails() {
  const errorDiv = document.getElementById('errorDetails');
  if (errorDiv) errorDiv.remove();
}

// ============================================================
// DOCUMENT SYNC: WORD → SERVER
// ============================================================
async function sendDocument() {
  if (!websocket || websocket.readyState !== WebSocket.OPEN) {
    console.warn('Cannot send: WebSocket not connected');
    return;
  }
  if (isReceivingUpdate) return; // Don't echo back received updates

  try {
    setStatus('Syncing...', 'connected');

    const base64 = await getDocumentAsBase64();

    websocket.send(JSON.stringify({
      type: 'document_update',
      document: base64,
      author: 'word-addin'
    }));

    console.log('Document sent to server');
    clearErrorDetails();
    setTimeout(() => setStatus('Connected', 'connected'), 500);
  } catch (error) {
    console.error('Error sending document:', error);
    setStatus('Sync failed', 'error');
    showErrorDetails(`Failed to sync document:\n${error.message || 'Unknown error'}`);
  }
}

function getDocumentAsBase64() {
  return new Promise((resolve, reject) => {
    Office.context.document.getFileAsync(
      Office.FileType.Compressed,
      { sliceSize: 65536 },
      async (result) => {
        if (result.status !== Office.AsyncResultStatus.Succeeded) {
          reject(new Error('Failed to get document'));
          return;
        }

        const file = result.value;
        const slices = [];

        for (let i = 0; i < file.sliceCount; i++) {
          const slice = await new Promise((res, rej) => {
            file.getSliceAsync(i, (r) => {
              r.status === Office.AsyncResultStatus.Succeeded
                ? res(r.value.data)
                : rej(new Error('Failed to get slice'));
            });
          });
          slices.push(slice);
        }

        file.closeAsync();

        // Combine slices into single Uint8Array
        const totalLength = slices.reduce((sum, s) => sum + s.length, 0);
        const combined = new Uint8Array(totalLength);
        let offset = 0;
        for (const slice of slices) {
          combined.set(slice, offset);
          offset += slice.length;
        }

        // Convert to base64
        let binary = '';
        for (let i = 0; i < combined.length; i++) {
          binary += String.fromCharCode(combined[i]);
        }

        resolve(btoa(binary));
      }
    );
  });
}

// ============================================================
// DOCUMENT SYNC: SERVER → WORD
// ============================================================
async function receiveDocument(base64) {
  if (!base64) {
    console.warn('Received empty document, skipping');
    return;
  }

  try {
    isReceivingUpdate = true;
    setStatus('Receiving...', 'connected');

    await Word.run(async (context) => {
      context.document.insertFileFromBase64(base64, Word.InsertLocation.replace, {
        importTheme: true,
        importStyles: true,
        importParagraphSpacing: true,
        importPageColor: true,
        importChangeTrackingMode: true
      });
      await context.sync();
    });

    console.log('Document updated from server');
    clearErrorDetails();
    setTimeout(() => setStatus('Connected', 'connected'), 500);
  } catch (error) {
    console.error('Error receiving document:', error);
    setStatus('Update failed', 'error');
    showErrorDetails(`Failed to apply update from web editor:\n${error.message || 'Unknown error'}`);
  } finally {
    // Small delay before allowing sends again (avoid echo)
    setTimeout(() => { isReceivingUpdate = false; }, 1000);
  }
}

// ============================================================
// CHANGE DETECTION
// ============================================================
let changeTimer = null;

function startDocumentChangeListener() {
  Office.context.document.addHandlerAsync(
    Office.EventType.DocumentSelectionChanged,
    () => {
      if (isReceivingUpdate) return;

      // Debounce: wait for user to stop making changes
      clearTimeout(changeTimer);
      changeTimer = setTimeout(sendDocument, CONFIG.syncDelay);
    }
  );

  console.log('Document change listener active');
}

// ============================================================
// EXTERNAL ACTIONS
// ============================================================
function openWebEditor() {
  // Opens the web editor in the system browser
  Office.context.ui.openBrowserWindow(CONFIG.webEditorUrl);
}
