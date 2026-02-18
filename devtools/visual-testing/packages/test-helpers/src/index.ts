/**
 * @superdoc-testing/helpers
 *
 * Playwright helpers for SuperDoc visual testing.
 */

// Shared types
export type { TestEditor, TestSuperdoc, LayoutStableState } from './types.js';

// Stability helpers
export {
  sleep,
  ptToPx,
  waitForFontsReady,
  waitForLayoutStable,
  waitForEditorIdle,
  type WaitForFontsOptions,
  type WaitForLayoutStableOptions,
} from './stability.js';

// Navigation helpers
export {
  DEFAULT_BASE_URL,
  goToHarness,
  waitForEditor,
  waitForSuperdocReady,
  uploadDocument,
  type GoToHarnessOptions,
  type WaitForEditorOptions,
  type WaitForSuperdocReadyOptions,
  type UploadDocumentOptions,
} from './navigation.js';

// Interaction helpers
export { createInteractionHelpers, type InteractionHelpers, type TypeOptions } from './interactions.js';

// Story helpers
export { defineStory, type InteractionStory, type StoryHelpers } from './story.js';

// Capture helpers
export {
  getPageLocators,
  getPageCount,
  capturePage,
  capturePageToFile,
  getPageFilename,
  captureAllPages,
  type CapturePageOptions,
  type CaptureResult,
} from './capture.js';
