/**
 * Consumer typecheck: root SuperDoc method coverage.
 *
 * This file satisfies the strict public-method coverage gate for root
 * members that do not need scenario-specific fixtures. It deliberately
 * asserts the consumer-visible method/getter types without executing the
 * methods.
 */
import type { SuperDoc } from 'superdoc';

type AddSharedUserParameters = Parameters<SuperDoc['addSharedUser']>;
type AddSharedUserReturn = ReturnType<SuperDoc['addSharedUser']>;

type FontsGetter = SuperDoc['fonts'];

type FocusParameters = Parameters<SuperDoc['focus']>;

type GetCommentParameters = Parameters<SuperDoc['getComment']>;
type GetCommentReturn = ReturnType<SuperDoc['getComment']>;

type GetHtmlParameters = Parameters<SuperDoc['getHTML']>;

type GetDocumentRuntimeForDocumentParameters = Parameters<SuperDoc['getDocumentRuntimeForDocument']>;
type GetDocumentRuntimeForDocumentReturn = ReturnType<SuperDoc['getDocumentRuntimeForDocument']>;

type GoToSearchResultReturn = ReturnType<SuperDoc['goToSearchResult']>;

type BroadcastSourceCompleteReturn = ReturnType<SuperDoc['broadcastSourceComplete']>;
type BroadcastSourceSignalsCompleteReturn = ReturnType<SuperDoc['broadcastSourceSignalsComplete']>;

type LockSuperdocParameters = Parameters<SuperDoc['lockSuperdoc']>;

type RemoveSharedUserParameters = Parameters<SuperDoc['removeSharedUser']>;
type RemoveSharedUserReturn = ReturnType<SuperDoc['removeSharedUser']>;

type ReplaceFileParameters = Parameters<SuperDoc['replaceFile']>;
type ReplaceFileReturn = ReturnType<SuperDoc['replaceFile']>;

type SetDocumentModeParameters = Parameters<SuperDoc['setDocumentMode']>;
type SetDocumentModeReturn = ReturnType<SuperDoc['setDocumentMode']>;

type SetLockedParameters = Parameters<SuperDoc['setLocked']>;

type StateGetter = SuperDoc['state'];

type UiGetter = SuperDoc['ui'];
type UiConfigGetter = SuperDoc['uiConfig'];

type UpgradeToCollaborationParameters = Parameters<SuperDoc['upgradeToCollaboration']>;

declare const addSharedUserParameters: AddSharedUserParameters;
declare const addSharedUserReturn: AddSharedUserReturn;
declare const fontsGetter: FontsGetter;
declare const focusParameters: FocusParameters;
declare const getCommentParameters: GetCommentParameters;
declare const getCommentReturn: GetCommentReturn;
declare const getHtmlParameters: GetHtmlParameters;
declare const getDocumentRuntimeForDocumentParameters: GetDocumentRuntimeForDocumentParameters;
declare const getDocumentRuntimeForDocumentReturn: GetDocumentRuntimeForDocumentReturn;
declare const goToSearchResultReturn: GoToSearchResultReturn;
declare const broadcastSourceCompleteReturn: BroadcastSourceCompleteReturn;
declare const broadcastSourceSignalsCompleteReturn: BroadcastSourceSignalsCompleteReturn;
declare const lockSuperdocParameters: LockSuperdocParameters;
declare const removeSharedUserParameters: RemoveSharedUserParameters;
declare const removeSharedUserReturn: RemoveSharedUserReturn;
declare const replaceFileParameters: ReplaceFileParameters;
declare const replaceFileReturn: ReplaceFileReturn;
declare const setDocumentModeParameters: SetDocumentModeParameters;
declare const setDocumentModeReturn: SetDocumentModeReturn;
declare const setLockedParameters: SetLockedParameters;
declare const stateGetter: StateGetter;
declare const uiGetter: UiGetter;
declare const uiConfigGetter: UiConfigGetter;
declare const upgradeToCollaborationParameters: UpgradeToCollaborationParameters;

void [
  addSharedUserParameters,
  addSharedUserReturn,
  fontsGetter,
  focusParameters,
  getCommentParameters,
  getCommentReturn,
  getHtmlParameters,
  getDocumentRuntimeForDocumentParameters,
  getDocumentRuntimeForDocumentReturn,
  goToSearchResultReturn,
  broadcastSourceCompleteReturn,
  broadcastSourceSignalsCompleteReturn,
  lockSuperdocParameters,
  removeSharedUserParameters,
  removeSharedUserReturn,
  replaceFileParameters,
  replaceFileReturn,
  setDocumentModeParameters,
  setDocumentModeReturn,
  setLockedParameters,
  stateGetter,
  uiGetter,
  uiConfigGetter,
  upgradeToCollaborationParameters,
];
