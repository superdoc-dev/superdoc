/**
 * Shared type definitions for SuperDoc visual testing helpers.
 */

import type { HarnessConfig } from '@superdoc-testing/harness/src/config-parser';

/**
 * Shape of the editor object exposed on window in the test harness.
 * Used for programmatic editor interactions.
 */
export interface TestEditor {
  commands?: Record<string, (args?: unknown) => void>;
  state?: {
    selection?: { from: number; to: number };
    doc?: { textContent?: string };
  };
}

/**
 * Shape of the superdoc object exposed on window in the test harness.
 * Used for document-level operations.
 */
export interface TestSuperdoc {
  setDocumentMode?: (mode: string) => void;
  getActiveComment?: () => string | null;
}

/**
 * Internal state used by waitForLayoutStable to track layout dimensions.
 */
export interface LayoutStableState {
  w: number;
  h: number;
  scrollW: number;
  scrollH: number;
}

// Extend Window interface for TypeScript
declare global {
  interface Window {
    /** SuperDoc instance exposed by the test harness */
    superdoc: TestSuperdoc | null;
    /** Editor instance exposed by the test harness */
    editor: TestEditor | null;
    /** Callback fired when SuperDoc is ready */
    superdocReady?: () => void;
    /** Callback fired on editor transactions */
    onTransaction?: (data: { duration: number }) => void;
    /** Callback fired when fonts are resolved */
    onFontsResolved?: (data: { documentFonts: unknown; unsupportedFonts: unknown }) => void;
    /** File data for document upload */
    fileData: File | null;
    /** Current harness configuration */
    harnessConfig: HarnessConfig;
    /** Internal: previous layout state for stability detection */
    __layoutPrevState?: LayoutStableState;
    /** Internal: timestamp when layout became stable */
    __layoutStableSince?: number;
  }
}

export {};
