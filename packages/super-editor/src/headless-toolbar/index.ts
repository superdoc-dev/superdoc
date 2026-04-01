import { generateLinkedStyleString, getQuickFormatList } from '../editors/v1/extensions/linked-styles/helpers.js';
import { getFileOpener, processAndInsertImageFile } from '../editors/v1/extensions/image/imageHelpers/index.js';

export { createHeadlessToolbar } from './create-headless-toolbar.js';
export { headlessToolbarConstants } from './constants.js';

export const headlessToolbarHelpers = {
  // linked-style helpers
  getQuickFormatList,
  generateLinkedStyleString,
  // image helpers
  getFileOpener,
  processAndInsertImageFile,
};

export type {
  CreateHeadlessToolbarOptions,
  HeadlessToolbarController,
  HeadlessToolbarSurface,
  HeadlessToolbarSuperdocHost,
  PublicToolbarItemId,
  ToolbarCommandState,
  ToolbarCommandStates,
  ToolbarContext,
  ToolbarExecuteFn,
  ToolbarPayloadMap,
  ToolbarSnapshot,
  ToolbarTarget,
  ToolbarValueMap,
} from './types.js';
