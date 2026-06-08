/**
 * Consumer typecheck: "superdoc/ui" sub-export.
 *
 * The `superdoc/ui` entry exposes the browser-only UI controller
 * (`createSuperDocUI`) and the slice/handle types it produces. Consumers
 * use it to subscribe to selection, comments, track-changes, and toolbar
 * state without reaching into internal packages.
 *
 * The fixture imports a representative slice of the surface and asserts
 * each type is real. The subpath is supported public per the RFC.
 */
import { createSuperDocUI, shallowEqual } from 'superdoc/ui';
import type {
  SuperDocUI,
  SuperDocUIOptions,
  SuperDocUIState,
  SuperDocLike,
  SuperDocEditorLike,
  SelectionHandle,
  SelectionSlice,
  CommandHandle,
  CommandsHandle,
  ToolbarHandle,
  ToolbarSnapshotSlice,
  CommentsHandle,
  CommentsSlice,
  TrackChangesHandle,
  TrackChangesSlice,
  ContentControlsHandle,
  ContentControlsSlice,
  ContentControlViewportAddress,
  ViewportEntityAddress,
  ViewportHandle,
  ViewportRect,
  DocumentHandle,
  ZoomHandle,
  ZoomSlice,
  DocumentSlice,
  // Document API shapes re-exported through ui
  CommentInfo,
  CommentsListResult,
  TrackChangeInfo,
  TrackChangesListResult,
  Receipt,
  TextTarget,
  EntityAddress,
  ScrollIntoViewInput,
} from 'superdoc/ui';

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertNotAny<T> = IsAny<T> extends true ? never : true;

const _real_createSuperDocUI: AssertNotAny<typeof createSuperDocUI> = true;
const _real_shallowEqual: AssertNotAny<typeof shallowEqual> = true;

const _real_SuperDocUI: AssertNotAny<SuperDocUI> = true;
const _real_SuperDocUIOptions: AssertNotAny<SuperDocUIOptions> = true;
const _real_SuperDocUIState: AssertNotAny<SuperDocUIState> = true;
const _real_SuperDocLike: AssertNotAny<SuperDocLike> = true;
const _real_SuperDocEditorLike: AssertNotAny<SuperDocEditorLike> = true;

const _real_SelectionHandle: AssertNotAny<SelectionHandle> = true;
const _real_SelectionSlice: AssertNotAny<SelectionSlice> = true;
const _real_CommandHandle: AssertNotAny<CommandHandle<'bold'>> = true;
const _real_CommandsHandle: AssertNotAny<CommandsHandle> = true;
const _real_ToolbarHandle: AssertNotAny<ToolbarHandle> = true;
const _real_ToolbarSnapshotSlice: AssertNotAny<ToolbarSnapshotSlice> = true;
const _real_CommentsHandle: AssertNotAny<CommentsHandle> = true;
const _real_CommentsSlice: AssertNotAny<CommentsSlice> = true;
const _real_TrackChangesHandle: AssertNotAny<TrackChangesHandle> = true;
const _real_TrackChangesSlice: AssertNotAny<TrackChangesSlice> = true;
const _real_ContentControlsHandle: AssertNotAny<ContentControlsHandle> = true;
const _real_ContentControlsSlice: AssertNotAny<ContentControlsSlice> = true;
const _real_ContentControlViewportAddress: AssertNotAny<ContentControlViewportAddress> = true;
const _real_ViewportEntityAddress: AssertNotAny<ViewportEntityAddress> = true;
const _real_ViewportHandle: AssertNotAny<ViewportHandle> = true;
const _real_ViewportRect: AssertNotAny<ViewportRect> = true;
const _real_DocumentHandle: AssertNotAny<DocumentHandle> = true;
const _real_ZoomHandle: AssertNotAny<ZoomHandle> = true;
const _real_ZoomSlice: AssertNotAny<ZoomSlice> = true;
const _real_DocumentSlice: AssertNotAny<DocumentSlice> = true;

const _real_CommentInfo: AssertNotAny<CommentInfo> = true;
const _real_CommentsListResult: AssertNotAny<CommentsListResult> = true;
const _real_TrackChangeInfo: AssertNotAny<TrackChangeInfo> = true;
const _real_TrackChangesListResult: AssertNotAny<TrackChangesListResult> = true;
const _real_Receipt: AssertNotAny<Receipt> = true;
const _real_TextTarget: AssertNotAny<TextTarget> = true;
const _real_EntityAddress: AssertNotAny<EntityAddress> = true;
const _real_ScrollIntoViewInput: AssertNotAny<ScrollIntoViewInput> = true;

void _real_createSuperDocUI;
void _real_shallowEqual;
void _real_SuperDocUI;
void _real_SuperDocUIOptions;
void _real_SuperDocUIState;
void _real_SuperDocLike;
void _real_SuperDocEditorLike;
void _real_SelectionHandle;
void _real_SelectionSlice;
void _real_CommandHandle;
void _real_CommandsHandle;
void _real_ToolbarHandle;
void _real_ToolbarSnapshotSlice;
void _real_CommentsHandle;
void _real_CommentsSlice;
void _real_TrackChangesHandle;
void _real_TrackChangesSlice;
void _real_ContentControlsHandle;
void _real_ContentControlsSlice;
void _real_ContentControlViewportAddress;
void _real_ViewportEntityAddress;
void _real_ViewportHandle;
void _real_ViewportRect;
void _real_DocumentHandle;
void _real_ZoomHandle;
void _real_ZoomSlice;
void _real_DocumentSlice;
void _real_CommentInfo;
void _real_CommentsListResult;
void _real_TrackChangeInfo;
void _real_TrackChangesListResult;
void _real_Receipt;
void _real_TextTarget;
void _real_EntityAddress;
void _real_ScrollIntoViewInput;
