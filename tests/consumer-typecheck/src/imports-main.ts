/**
 * Consumer typecheck: main "superdoc" entry point.
 *
 * Exercises every public runtime export and type import.
 * If this file compiles, consumers can use these APIs.
 */

// Runtime imports
import {
  Editor,
  PresentationEditor,
  SuperDoc,
  superEditorHelpers,
  createTheme,
  buildTheme,
  getRichTextExtensions,
  getStarterExtensions,
  Extensions,
  createZip,
  DOCX,
  PDF,
  HTML,
  getMarksFromSelection,
  getActiveFormatting,
  getAllowedImageDimensions,
  isNodeType,
  isMarkType,
  defineNode,
  defineMark,
  TrackChangesBasePluginKey,
  CommentsPluginKey,
  DocxZipper,
  SuperToolbar,
} from 'superdoc';

// Type imports
import type {
  EditorState,
  Transaction,
  Schema,
  EditorView,
  EditorCommands,
  ChainableCommandObject,
  ChainedCommand,
  CommandProps,
  Command,
  CanObject,
  CoreCommandMap,
  ExtensionCommandMap,
  OpenOptions,
  DocxFileEntry,
  BinaryData,
  SaveOptions,
  ExportOptions,
  PresentationEditorOptions,
  LayoutEngineOptions,
  PageSize,
  PageMargins,
  VirtualizationOptions,
  TrackedChangesMode,
  TrackedChangesOverrides,
  LayoutMode,
  PresenceOptions,
  RemoteUserInfo,
  RemoteCursorState,
  Layout,
  LayoutPage,
  LayoutFragment,
  RangeRect,
  BoundingRect,
  LayoutError,
  LayoutMetrics,
  PositionHit,
  FlowBlock,
  Measure,
  SectionMetadata,
  PaintSnapshot,
  LayoutUpdatePayload,
  UnsupportedContentItem,
  SelectionHandle,
  SelectionCommandContext,
  ResolveRangeOutput,
} from 'superdoc';

// Verify types are usable (not just importable)
const pageSize: PageSize = { w: 612, h: 792 };
const margins: PageMargins = { top: 72, right: 72, bottom: 72, left: 72 };
const saveOpts: SaveOptions = {
  isFinalDoc: true,
  fieldsHighlightColor: '#ff0',
  compression: 'DEFLATE',
};
const binaryData: BinaryData = new ArrayBuffer(10);
const rect: BoundingRect = {
  top: 0,
  left: 0,
  bottom: 100,
  right: 100,
  width: 100,
  height: 100,
};
const unsupported: UnsupportedContentItem = {
  tagName: 'HR',
  outerHTML: '<hr>',
  count: 1,
};
