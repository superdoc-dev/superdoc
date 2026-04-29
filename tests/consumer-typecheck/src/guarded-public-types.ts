/**
 * Consumer typecheck: guarded public types must not collapse to `any`.
 *
 * The published superdoc types currently route some surfaces (notably the
 * Document API, layout contracts, and a few editor primitives) through
 * private workspace packages that get aliased to `any` in the shim file
 * shipped under `dist/_internal-shims.d.ts`. Customers see the consequences
 * as `any`-typed values where they expect real types.
 *
 * This file is the regression net. It uses the `@ts-expect-error` trick:
 * if the imported type is real, the assignment is an error and the directive
 * suppresses it. If the type is `any`, the assignment passes and the
 * directive itself becomes an unused-directive error (TS2578), failing the
 * scenario.
 *
 * The list below is the "guarded public types" surface referenced by the
 * package boundary RFC (SD-2829, deliverable 4).
 *
 * STATE: this scenario is currently INFORMATIONAL in the matrix. Most
 * assertions are expected to fail today because the bundling/curated-emit
 * work in SD-2830 has not landed yet. Once SD-2830 ships and the leaks are
 * resolved, flip the matrix entry from `mustPass: false` to `mustPass: true`
 * so further regressions break CI.
 */

import type {
  // Document API surface (subset reachable from `superdoc` today;
  // `DocumentApi`, `BlocksListResult`, `BookmarkInfo` are not yet
  // exported from `superdoc` and are tracked separately under the RFC's
  // Decision 2 -- they belong in `@superdoc-dev/document-api` once that
  // package ships).
  TextSegment,
  ResolveRangeOutput,
  // Selection / range primitives
  SelectionApi,
  SelectionInfo,
  // Editor lifecycle / options
  EditorOptions,
  OpenOptions,
  SaveOptions,
  ExportOptions,
  // Command surface
  CommandProps,
  EditorCommands,
  ChainedCommand,
  CanObject,
  // Layout-facing types reachable from public surface
  Layout,
  LayoutPage,
  FlowBlock,
} from 'superdoc';

// --------------------------------------------------------------------------
// Document API surface
// --------------------------------------------------------------------------

// @ts-expect-error — TextSegment is an object, not assignable from string
const _textSegment: TextSegment = 'not a segment';

// @ts-expect-error — ResolveRangeOutput is an object, not assignable from number
const _resolveRangeOutput: ResolveRangeOutput = 0;

// --------------------------------------------------------------------------
// Selection / range primitives
// --------------------------------------------------------------------------

// @ts-expect-error — SelectionApi has methods, not assignable from string
const _selectionApi: SelectionApi = 'not a selection api';

// @ts-expect-error — SelectionInfo is an object, not assignable from number
const _selectionInfo: SelectionInfo = 0;

// --------------------------------------------------------------------------
// Editor lifecycle / options
// --------------------------------------------------------------------------

// @ts-expect-error — EditorOptions is an object, not assignable from string
const _editorOptions: EditorOptions = 'not options';

// @ts-expect-error — OpenOptions is an object, not assignable from boolean
const _openOptions: OpenOptions = false;

// @ts-expect-error — SaveOptions is an object, not assignable from number
const _saveOptions: SaveOptions = 1;

// @ts-expect-error — ExportOptions is an object, not assignable from string
const _exportOptions: ExportOptions = 'not export options';

// --------------------------------------------------------------------------
// Command surface
// --------------------------------------------------------------------------

// @ts-expect-error — CommandProps is an object, not assignable from string
const _commandProps: CommandProps = 'not command props';

// @ts-expect-error — EditorCommands is a record of functions, not assignable from number
const _editorCommands: EditorCommands = 7;

// @ts-expect-error — ChainedCommand is a function/object, not assignable from boolean
const _chainedCommand: ChainedCommand = false;

// @ts-expect-error — CanObject is an object, not assignable from string
const _canObject: CanObject = 'not a can object';

// --------------------------------------------------------------------------
// Layout-facing types reachable from public surface
// --------------------------------------------------------------------------

// @ts-expect-error — Layout is an object, not assignable from string
const _layout: Layout = 'not a layout';

// @ts-expect-error — LayoutPage is an object, not assignable from number
const _layoutPage: LayoutPage = 0;

// @ts-expect-error — FlowBlock is an object, not assignable from boolean
const _flowBlock: FlowBlock = true;
