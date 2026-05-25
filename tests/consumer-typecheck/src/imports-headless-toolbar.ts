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

// SD-3213: ToolbarTarget.commands is the documented escape hatch for
// direct command access when execute() doesn't cover the use case
// (see headless-toolbar/README.md). The index-signature value is
// `(...args: unknown[]) => unknown`, not `(...args: any[]) => any`,
// so consumers narrow before reading return values.
declare const ctx: ToolbarContext;
const targetCommands = ctx.target.commands;
const someCommand = targetCommands['someCommand'];
if (someCommand) {
  // Return is `unknown`, not `any`. Reading a property without
  // narrowing must error; if a future PR widens back to `any`, the
  // directive becomes unused and tsc fails (TS2578).
  const result = someCommand('arg1', 42);
  // @ts-expect-error SD-3213: target.commands[id] returns unknown, not any.
  result.foo;
  // Narrowing works as expected.
  const _untyped: unknown = result;
  void _untyped;
}
void targetCommands;
void execFn;

// SD-3213: a consumer constructing a custom ToolbarTarget (e.g. for
// tests or a non-Editor command source) can still satisfy the
// tightened signature by typing their commands with the same
// `(...args: unknown[]) => unknown` shape. This pins the most common
// custom-stub construction so a future re-widening or narrowing
// would surface here.
const customTarget: ToolbarTarget = {
  commands: {
    arbitrary: (...args) => {
      // `args` is `unknown[]`; reading args[0].foo would error
      // without narrowing.
      return args.length;
    },
  },
};
void customTarget;
