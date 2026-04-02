/**
 * Consumer typecheck: "superdoc/headless-toolbar" sub-export.
 *
 * Verifies that the headless toolbar API types resolve correctly
 * for consumers using the sub-path import.
 */

// Runtime imports
import { createHeadlessToolbar, headlessToolbarConstants, headlessToolbarHelpers } from 'superdoc/headless-toolbar';

// Type imports
import type {
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
} from 'superdoc/headless-toolbar';

// Verify constants are accessible
const fontSizes = headlessToolbarConstants.DEFAULT_FONT_SIZE_OPTIONS;
const fontFamilies = headlessToolbarConstants.DEFAULT_FONT_FAMILY_OPTIONS;
const textAligns = headlessToolbarConstants.DEFAULT_TEXT_ALIGN_OPTIONS;
const lineHeights = headlessToolbarConstants.DEFAULT_LINE_HEIGHT_OPTIONS;
const zoomLevels = headlessToolbarConstants.DEFAULT_ZOOM_OPTIONS;
const docModes = headlessToolbarConstants.DEFAULT_DOCUMENT_MODE_OPTIONS;
const textColors = headlessToolbarConstants.DEFAULT_TEXT_COLOR_OPTIONS;
const highlightColors = headlessToolbarConstants.DEFAULT_HIGHLIGHT_COLOR_OPTIONS;

// Verify types are usable
const surface: HeadlessToolbarSurface = 'body';
const id: PublicToolbarItemId = 'bold';
const snapshot: ToolbarSnapshot = { context: null, commands: {} };

// Verify typed snapshot values
const boldState = snapshot.commands['bold'];
const fontSizeValue: string | undefined = snapshot.commands['font-size']?.value;
const zoomValue: number | undefined = snapshot.commands['zoom']?.value;
const linkValue: string | null | undefined = snapshot.commands['link']?.value;

// Verify ToolbarExecuteFn type
const execFn: ToolbarExecuteFn = (id, payload?) => true;
