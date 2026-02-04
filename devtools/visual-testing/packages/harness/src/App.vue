<script setup lang="ts">
/**
 * SuperDoc Test Harness - Main Application Component
 *
 * Provides a configurable environment for visual regression testing of SuperDoc.
 * All configuration is driven by URL parameters parsed via config-parser.
 *
 * @see ./config-parser.ts for configuration options
 */
import 'superdoc/style.css';
import BlankDOCX from '../../../../../shared/common/data/blank.docx?url';
import { onMounted, shallowRef, computed } from 'vue';
import { SuperDoc } from 'superdoc';
import { parseConfig, type HarnessConfig } from './config-parser';

// ============================================================================
// Type Declarations
// ============================================================================

/** SuperDoc instance type (from superdoc package) */
type SuperDocInstance = InstanceType<typeof SuperDoc>;

/** Font resolution callback data */
interface FontsResolvedData {
  documentFonts: string[];
  unsupportedFonts: string[];
}

/** Transaction callback data */
interface TransactionData {
  duration: number;
}

/** SuperDoc configuration object */
interface SuperDocConfig {
  selector: string;
  pagination: boolean;
  useLayoutEngine: boolean;
  onReady: () => void;
  onTransaction: (data: TransactionData) => void;
  onFontsResolved?: (data: FontsResolvedData) => void;
  toolbar?: string | null;
  toolbarGroups?: string[];
  modules: {
    comments?: boolean;
    commentsReadonly?: boolean;
    trackChanges?: boolean;
  };
  document?: {
    data: File;
    type?: 'docx' | 'pdf';
    html?: string;
  };
}

/**
 * Extend Window interface with harness globals.
 * These are exposed for test automation tools (Playwright, etc.)
 */
declare global {
  interface Window {
    /** Current SuperDoc instance */
    superdoc: SuperDocInstance | null;
    /** Active ProseMirror editor instance */
    editor: unknown;
    /** Currently loaded file data */
    fileData: File | null;
    /** Parsed harness configuration */
    harnessConfig: HarnessConfig;
    /** True when SuperDoc is fully initialized and ready */
    superdocReady: boolean;
    /** Callback invoked on document transactions */
    onTransaction?: (data: TransactionData) => void;
    /** Callback invoked when fonts are resolved */
    onFontsResolved?: (data: FontsResolvedData) => void;
  }
}

// ============================================================================
// Configuration & State
// ============================================================================

/** Parse configuration from URL parameters */
const config: HarnessConfig = parseConfig(window.location.search);

// Expose config for debugging
window.harnessConfig = config;

/** Reactive reference to the SuperDoc instance */
const superdoc = shallowRef<SuperDocInstance | null>(null);

// Initialize window globals
window.fileData = null;
window.superdocReady = false;

// ============================================================================
// Computed Properties
// ============================================================================

/**
 * CSS classes for the container based on configuration.
 * Controls visual testing modes like hidden caret/selection.
 */
const containerClasses = computed(() => ({
  'harness-container': true,
  'no-layout': !config.layout,
  'hide-caret': config.hideCaret,
  'hide-selection': config.hideSelection,
  'no-caret-blink': !config.caretBlink,
}));

/** Whether to show the toolbar based on configuration */
const showToolbar = computed(() => config.toolbar !== 'none');

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Initialize SuperDoc with the current configuration.
 * Destroys any existing instance before creating a new one.
 */
async function init(): Promise<void> {
  if (superdoc.value) {
    superdoc.value.destroy();
  }

  const superdocConfig = buildSuperdocConfig();

  // Load document if one is set
  if (window.fileData) {
    await attachDocument(superdocConfig, window.fileData);
  }

  superdoc.value = new SuperDoc(superdocConfig);
}

/**
 * Build SuperDoc configuration object from harness config.
 *
 * @returns Configuration object ready for SuperDoc constructor
 */
function buildSuperdocConfig(): SuperDocConfig {
  const superdocConfig: SuperDocConfig = {
    selector: '#editor',
    pagination: config.layout,
    useLayoutEngine: config.layout,
    onReady,
    onTransaction,
    modules: {},
  };

  // Toolbar configuration
  if (config.toolbar === 'none') {
    superdocConfig.toolbar = null;
  } else {
    superdocConfig.toolbar = '#toolbar';
    if (config.toolbar === 'minimal') {
      superdocConfig.toolbarGroups = ['center'];
    }
  }

  // Comments module
  if (config.comments !== 'off') {
    superdocConfig.modules.comments = true;

    if (config.comments === 'readonly') {
      superdocConfig.modules.commentsReadonly = true;
    }
  }

  // Track changes
  if (config.trackChanges) {
    superdocConfig.modules.trackChanges = true;
  }

  // Font resolution callback
  if (config.waitForFonts) {
    superdocConfig.onFontsResolved = onFontsResolved;
  }

  return superdocConfig;
}

/**
 * Attach a document to the SuperDoc configuration.
 * Handles both DOCX/PDF files and HTML content.
 *
 * @param superdocConfig - Configuration object to modify
 * @param file - File to attach
 */
async function attachDocument(superdocConfig: SuperDocConfig, file: File): Promise<void> {
  const fileExtension = file.name.split('.').pop()?.toLowerCase();
  const isHtml = fileExtension === 'html' || fileExtension === 'htm';

  if (isHtml) {
    // HTML files need a blank DOCX as base
    const blankFile = await fetchFileAsObject(
      BlankDOCX,
      'blank.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    const htmlContent = await readFileAsText(file);
    superdocConfig.document = { data: blankFile, html: htmlContent };
  } else {
    // DOCX/PDF files load directly
    superdocConfig.document = {
      data: new File([file], file.name, { type: file.type }),
      type: fileExtension === 'pdf' ? 'pdf' : 'docx',
    };
  }
}

// ============================================================================
// Event Handlers
// ============================================================================

/**
 * Called when SuperDoc is fully initialized and ready.
 * Sets up editor reference and opens comments panel if configured.
 */
function onReady(): void {
  superdoc.value?.activeEditor.on('create', ({ editor }: { editor: unknown }) => {
    window.editor = editor;
    window.superdoc = superdoc.value;
  });

  // Open comments panel if configured
  if (config.comments === 'panel' && superdoc.value?.comments) {
    superdoc.value.comments.openPanel?.();
  }

  // Signal that harness is ready for test automation
  window.superdocReady = true;
}

/**
 * Called on document transactions.
 * Forwards to window callback if registered.
 *
 * @param data - Transaction data including duration
 */
function onTransaction(data: TransactionData): void {
  window.onTransaction?.(data);
}

/**
 * Called when fonts are resolved.
 * Forwards to window callback if registered.
 *
 * @param data - Font resolution data
 */
function onFontsResolved(data: FontsResolvedData): void {
  window.onFontsResolved?.(data);
}

/**
 * Handle file input change event.
 * Stores the file and reinitializes SuperDoc.
 *
 * @param event - File input change event
 */
async function handleFileChange(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) {
    window.fileData = file;
    await init();
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Fetch a file from URL and convert to File object.
 *
 * @param fileUrl - URL to fetch
 * @param name - Filename for the resulting File object
 * @param type - MIME type for the resulting File object
 * @returns File object containing the fetched content
 */
async function fetchFileAsObject(fileUrl: string, name: string, type: string): Promise<File> {
  const response = await fetch(fileUrl);
  const blob = await response.blob();
  return new File([blob], name, { type });
}

/**
 * Read file contents as text.
 *
 * @param file - File to read
 * @returns Promise resolving to file contents as string
 */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = (e) => reject(e);
    reader.readAsText(file);
  });
}

// ============================================================================
// Lifecycle
// ============================================================================

onMounted(() => {
  init();
});
</script>

<template>
  <div :class="containerClasses" data-testid="harness-container">
    <header class="harness-header">
      <h1>SuperDoc Test Harness</h1>
      <input
        type="file"
        ref="fileInput"
        accept=".docx,.pdf,.html"
        @change="handleFileChange"
        data-testid="file-input"
      />
    </header>

    <div v-if="showToolbar" id="toolbar" class="harness-toolbar" data-testid="toolbar"></div>

    <main class="harness-main">
      <div id="editor" class="harness-editor" data-testid="editor"></div>
    </main>
  </div>
</template>

<style>
/* Container styles */
.harness-container {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  width: 100%;
}

.harness-header {
  padding: 1rem;
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  align-items: center;
  gap: 1rem;
}

.harness-header h1 {
  font-size: 1.25rem;
  margin: 0;
}

.harness-toolbar {
  border-bottom: 1px solid #e0e0e0;
}

.harness-main {
  flex: 1;
  display: flex;
  justify-content: center;
  padding: 1rem;
}

.harness-editor {
  width: 100%;
  max-width: 1200px;
}

/* Non-layout mode styling */
.no-layout .super-editor {
  border: 1px solid #999;
}

/* Visual testing: hide caret */
.hide-caret .superdoc-layout,
.hide-caret .superdoc-layout * {
  caret-color: transparent !important;
}

/* Visual testing: hide selection overlays */
.hide-selection .presentation-editor__selection-caret,
.hide-selection .presentation-editor__selection-overlay {
  display: none !important;
  visibility: hidden !important;
  opacity: 0 !important;
  animation: none !important;
}

/* Visual testing: disable caret blink */
.no-caret-blink .presentation-editor__selection-caret {
  animation: none !important;
  opacity: 1 !important;
}
</style>
