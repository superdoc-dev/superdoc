// ============================================================
// CONFIGURATION
// ============================================================
const CONFIG = {
  // WebSocket sync server (wss:// for secure connection)
  serverUrl: 'wss://localhost:8080'
};

// ============================================================
// STATE
// ============================================================
let superdoc = null;
let websocket = null;
let isReceivingUpdate = false;

// ============================================================
// UI HELPERS
// ============================================================
function setStatus(text, state) {
  document.getElementById('statusDot').className = 'status-dot ' + state;
  document.getElementById('statusText').textContent = text;
}

// ============================================================
// SUPERDOC
// ============================================================
function initSuperDoc(documentFile = null) {
  const config = {
    selector: '#superdoc',
    toolbar: '#toolbar',
    toolbarGroups: ['center'],
    modules: {
      toolbar: {
        selector: '#toolbar',
        excludeItems: ['image', 'ruler', 'link', 'zoom', 'copyFormat', 'clearFormatting', 'indentleft', 'indentright'],
      }
    },
    role: 'editor',
    documentMode: 'editing',
    user: { name: 'Web User', email: 'user@example.com' },
    pagination: true,
    rulers: true,
    onEditorUpdate: debounce(sendDocument, 1000)
  };

  if (documentFile) {
    config.document = documentFile;
  }

  superdoc = new SuperDocLibrary.SuperDoc(config);
  window.superdoc = superdoc; // For debugging
}

// ============================================================
// WEBSOCKET
// ============================================================
function connectWebSocket() {
  websocket = new WebSocket(CONFIG.serverUrl);

  websocket.onopen = () => {
    console.log('WebSocket connected');
    setStatus('Connected', 'connected');
    websocket.send(JSON.stringify({ type: 'client_ready' }));
  };

  websocket.onmessage = (event) => {
    const message = JSON.parse(event.data);

    if (message.type === 'document_update' && message.author !== 'web-editor') {
      console.log('Received document from:', message.author);
      receiveDocument(message.document);
    }
  };

  websocket.onclose = () => {
    console.log('WebSocket disconnected');
    setStatus('Disconnected', 'disconnected');
  };

  websocket.onerror = () => {
    setStatus('Connection error', 'disconnected');
  };
}

// ============================================================
// DOCUMENT SYNC
// ============================================================
async function sendDocument() {
  if (!websocket || websocket.readyState !== WebSocket.OPEN) return;
  if (!superdoc || isReceivingUpdate) return;

  try {
    const blob = await superdoc.activeEditor.exportDocx();
    const base64 = await blobToBase64(blob);

    websocket.send(JSON.stringify({
      type: 'document_update',
      document: base64,
      author: 'web-editor'
    }));

    console.log('Document sent');
    flashStatus('Syncing...', 'syncing');
  } catch (error) {
    console.error('Error sending document:', error);
  }
}

function receiveDocument(base64) {
  if (!base64) return;

  isReceivingUpdate = true;
  flashStatus('Syncing...', 'syncing');

  try {
    const file = base64ToFile(base64);
    initSuperDoc(file);
  } catch (error) {
    console.error('Error receiving document:', error);
  } finally {
    setTimeout(() => { isReceivingUpdate = false; }, 500);
  }
}

// ============================================================
// UTILITIES
// ============================================================
function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function base64ToFile(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], 'document.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });
}

function flashStatus(text, state) {
  setStatus(text, state);
  setTimeout(() => {
    if (websocket?.readyState === WebSocket.OPEN) {
      setStatus('Connected', 'connected');
    }
  }, 1000);
}

// ============================================================
// INIT
// ============================================================
initSuperDoc();
connectWebSocket();
