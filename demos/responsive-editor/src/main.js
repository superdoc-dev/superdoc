import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

// =============================================================================
// Configuration
// =============================================================================

const CONFIG = {
  editorSelector: '#editor',
  toolbarSelector: '#toolbar',
  versionSelector: '#version',
  fileInputSelector: '#file-input',
  exportBtnSelector: '#export-btn',
  defaultDocument: '/default.docx',
};

// Responsive zoom configuration
const ZOOM_CONFIG = {
  debounceMs: 100,
  defaultZoom: 100,
  minZoom: 10,
  fallbackZoom: 25,
  // Threshold for detecting extra-wide documents that need dynamic scaling
  wideDocumentThreshold: 1000,
  // Scale factor for fitting wide documents (0.45 = 45% of calculated fit)
  wideDocumentScaleFactor: 0.45,
  // Breakpoints checked in descending order
  breakpoints: [
    { minWidth: 1300, zoom: 100 },
    { minWidth: 1200, zoom: 80 },
    { minWidth: 1100, zoom: 70 },
    { minWidth: 600, zoom: 55 },
    { minWidth: 400, zoom: 35 },
    { minWidth: 350, zoom: 30 },
    { minWidth: 0, zoom: 25 },
  ],
};

// =============================================================================
// Responsive Zoom
// =============================================================================

let superdoc = null;
let zoomTimeoutId = null;

/**
 * Calculate the appropriate zoom level based on viewport and document width.
 */
function getZoomForWidth(viewportWidth, pageWidth) {
  // Dynamic zoom for extra-wide documents
  if (pageWidth > ZOOM_CONFIG.wideDocumentThreshold) {
    const ratio = viewportWidth / pageWidth;
    const zoom = Math.round(ratio * ZOOM_CONFIG.wideDocumentScaleFactor * 100);
    return Math.max(ZOOM_CONFIG.minZoom, zoom);
  }

  // Breakpoint-based zoom for standard documents
  if (!viewportWidth) return ZOOM_CONFIG.defaultZoom;

  for (const { minWidth, zoom } of ZOOM_CONFIG.breakpoints) {
    if (viewportWidth > minWidth) return zoom;
  }

  return ZOOM_CONFIG.fallbackZoom;
}

/**
 * Apply zoom to fit the document in the viewport. Debounced for performance.
 */
function applyResponsiveZoom() {
  clearTimeout(zoomTimeoutId);
  zoomTimeoutId = setTimeout(() => {
    if (!superdoc) return;

    const editorEl = document.querySelector(CONFIG.editorSelector);
    const viewportWidth = document.documentElement.clientWidth;
    const pageWidth = editorEl?.querySelector('.superdoc-page')?.clientWidth;
    const zoom = getZoomForWidth(viewportWidth, pageWidth);

    superdoc.setZoom(zoom);
  }, ZOOM_CONFIG.debounceMs);
}

/**
 * Set up responsive zoom listeners and apply initial zoom if needed.
 */
function setupResponsiveZoom() {
  window.addEventListener('resize', applyResponsiveZoom);

  const viewportWidth = document.documentElement.clientWidth;
  const editorEl = document.querySelector(CONFIG.editorSelector);
  const pageWidth = editorEl?.querySelector('.superdoc-page')?.clientWidth;

  // Apply initial zoom if viewport is narrow or document is wide
  const needsInitialZoom =
    viewportWidth < ZOOM_CONFIG.breakpoints[0].minWidth ||
    (pageWidth && pageWidth > ZOOM_CONFIG.wideDocumentThreshold);

  if (needsInitialZoom) {
    applyResponsiveZoom();
  }
}

// =============================================================================
// SuperDoc Initialization
// =============================================================================

function initSuperdoc(file = null) {
  superdoc?.destroy();

  const config = {
    selector: CONFIG.editorSelector,
    documentMode: 'editing',
    modules: {
      toolbar: { selector: CONFIG.toolbarSelector },
    },
  };

  if (file) {
    config.document = file;
  }

  superdoc = new SuperDoc(config);
  window.superdoc = superdoc;

  superdoc.on('ready', () => {
    // Update version display
    const versionEl = document.querySelector(CONFIG.versionSelector);
    if (versionEl && superdoc.version) {
      versionEl.textContent = `v${superdoc.version}`;
    }

    setupResponsiveZoom();
  });
}

async function loadDefaultDocument() {
  try {
    const response = await fetch(CONFIG.defaultDocument);
    const blob = await response.blob();
    const file = new File([blob], 'default.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    initSuperdoc(file);
  } catch (err) {
    console.warn('Could not load default document, starting blank:', err);
    initSuperdoc();
  }
}

// =============================================================================
// Event Handlers
// =============================================================================

document.querySelector(CONFIG.fileInputSelector).addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  initSuperdoc(file);
  e.target.value = '';
});

document.querySelector(CONFIG.exportBtnSelector).addEventListener('click', async () => {
  if (!superdoc) return;

  try {
    await superdoc.export();
  } catch (err) {
    console.error('Export failed:', err);
    alert('Export failed: ' + err.message);
  }
});

// =============================================================================
// Start
// =============================================================================

loadDefaultDocument();
