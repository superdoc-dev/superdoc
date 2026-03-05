import type { BlockNodeType, ReceiptFailure, ReceiptInsert, TextAddress } from '../types/index.js';
import type { DiscoveryOutput } from '../types/discovery.js';

// ---------------------------------------------------------------------------
// Address types
// ---------------------------------------------------------------------------

export type ListItemAddress = {
  kind: 'block';
  nodeType: 'listItem';
  nodeId: string;
};

/** Any block-level paragraph, whether or not it is a list item. */
export type BlockAddress = {
  kind: 'block';
  nodeType: 'paragraph';
  nodeId: string;
};

/** Contiguous range of paragraphs. */
export type BlockRange = {
  from: BlockAddress;
  to: BlockAddress;
};

export type ListWithinAddress = {
  kind: 'block';
  nodeType: BlockNodeType;
  nodeId: string;
};

// ---------------------------------------------------------------------------
// Enums and constants
// ---------------------------------------------------------------------------

export type ListKind = 'ordered' | 'bullet';
export type ListInsertPosition = 'before' | 'after';
export type JoinDirection = 'withPrevious' | 'withNext';
export type MutationScope = 'definition' | 'instance';

export type LevelAlignment = 'left' | 'center' | 'right';
export type TrailingCharacter = 'tab' | 'space' | 'nothing';

export type ListPresetId =
  | 'decimal'
  | 'decimalParenthesis'
  | 'lowerLetter'
  | 'upperLetter'
  | 'lowerRoman'
  | 'upperRoman'
  | 'disc'
  | 'circle'
  | 'square'
  | 'dash';

export const LIST_KINDS = ['ordered', 'bullet'] as const satisfies readonly ListKind[];
export const LIST_INSERT_POSITIONS = ['before', 'after'] as const satisfies readonly ListInsertPosition[];
export const JOIN_DIRECTIONS = ['withPrevious', 'withNext'] as const satisfies readonly JoinDirection[];
export const MUTATION_SCOPES = ['definition', 'instance'] as const satisfies readonly MutationScope[];
export const LEVEL_ALIGNMENTS = ['left', 'center', 'right'] as const satisfies readonly LevelAlignment[];
export const TRAILING_CHARACTERS = ['tab', 'space', 'nothing'] as const satisfies readonly TrailingCharacter[];
export const LIST_PRESET_IDS = [
  'decimal',
  'decimalParenthesis',
  'lowerLetter',
  'upperLetter',
  'lowerRoman',
  'upperRoman',
  'disc',
  'circle',
  'square',
  'dash',
] as const satisfies readonly ListPresetId[];

// ---------------------------------------------------------------------------
// Failure code enums
// ---------------------------------------------------------------------------

export type ListsFailureCode =
  | 'NO_OP'
  | 'INVALID_TARGET'
  | 'INCOMPATIBLE_DEFINITIONS'
  | 'NO_COMPATIBLE_PREVIOUS'
  | 'ALREADY_CONTINUOUS'
  | 'NO_PREVIOUS_LIST'
  | 'NO_ADJACENT_SEQUENCE'
  | 'ALREADY_SAME_SEQUENCE'
  | 'LEVEL_OUT_OF_RANGE'
  | 'LEVEL_NOT_FOUND'
  | 'CAPABILITY_UNAVAILABLE'
  | 'INVALID_INPUT';

export type CanContinueReason = 'NO_PREVIOUS_LIST' | 'INCOMPATIBLE_DEFINITIONS' | 'ALREADY_CONTINUOUS';

export type CanJoinReason = 'NO_ADJACENT_SEQUENCE' | 'INCOMPATIBLE_DEFINITIONS' | 'ALREADY_SAME_SEQUENCE';

// ---------------------------------------------------------------------------
// Discovery / query types
// ---------------------------------------------------------------------------

export interface ListsListQuery {
  within?: ListWithinAddress;
  limit?: number;
  offset?: number;
  kind?: ListKind;
  level?: number;
  ordinal?: number;
}

export interface ListsGetInput {
  address: ListItemAddress;
}

export interface ListItemInfo {
  address: ListItemAddress;
  listId: string;
  marker?: string;
  ordinal?: number;
  path?: number[];
  level?: number;
  kind?: ListKind;
  text?: string;
}

export interface ListItemDomain {
  address: ListItemAddress;
  listId: string;
  marker?: string;
  ordinal?: number;
  path?: number[];
  level?: number;
  kind?: ListKind;
  text?: string;
}

export type ListsListResult = DiscoveryOutput<ListItemDomain>;

// ---------------------------------------------------------------------------
// Input types — kept operations
// ---------------------------------------------------------------------------

export interface ListInsertInput {
  target: ListItemAddress;
  position: ListInsertPosition;
  text?: string;
}

export interface ListTargetInput {
  target: ListItemAddress;
}

// ---------------------------------------------------------------------------
// Input types — new SD-1272 operations
// ---------------------------------------------------------------------------

export type ListsCreateInput =
  | { mode: 'empty'; at: BlockAddress; kind: ListKind; level?: number }
  | { mode: 'fromParagraphs'; target: BlockAddress | BlockRange; kind: ListKind; level?: number };

export interface ListsAttachInput {
  target: BlockAddress | BlockRange;
  attachTo: ListItemAddress;
  level?: number;
}

export interface ListsDetachInput {
  target: ListItemAddress;
}

export interface ListsJoinInput {
  target: ListItemAddress;
  direction: JoinDirection;
}

export interface ListsCanJoinInput {
  target: ListItemAddress;
  direction: JoinDirection;
}

export interface ListsSeparateInput {
  target: ListItemAddress;
  copyOverrides?: boolean;
}

export interface ListsSetLevelInput {
  target: ListItemAddress;
  level: number;
}

export interface ListsSetValueInput {
  target: ListItemAddress;
  value: number | null;
}

export interface ListsContinuePreviousInput {
  target: ListItemAddress;
}

export interface ListsCanContinuePreviousInput {
  target: ListItemAddress;
}

export interface ListsSetLevelRestartInput {
  target: ListItemAddress;
  level: number;
  restartAfterLevel: number | null;
  scope?: MutationScope;
}

export interface ListsConvertToTextInput {
  target: ListItemAddress;
  includeMarker?: boolean;
}

// ---------------------------------------------------------------------------
// SD-1973 template and formatting types
// ---------------------------------------------------------------------------

/** A captured snapshot of one level's formatting properties. */
export interface ListLevelTemplate {
  level: number;
  numFmt?: string;
  lvlText?: string;
  start?: number;
  alignment?: LevelAlignment;
  indents?: {
    left?: number;
    hanging?: number;
    firstLine?: number;
  };
  trailingCharacter?: TrailingCharacter;
  markerFont?: string;
  pictureBulletId?: number;
}

/** A full list template: an array of level snapshots. */
export interface ListTemplate {
  version: 1;
  levels: ListLevelTemplate[];
}

// ---------------------------------------------------------------------------
// Input types — SD-1973 formatting operations
// ---------------------------------------------------------------------------

export interface ListsApplyTemplateInput {
  target: ListItemAddress;
  template: ListTemplate;
  levels?: number[];
}

export interface ListsApplyPresetInput {
  target: ListItemAddress;
  preset: ListPresetId;
  levels?: number[];
}

export interface ListsSetTypeInput {
  target: ListItemAddress;
  kind: ListKind;
  /** Controls whether adjacent sequences of the same kind are merged after conversion.
   *  - `'preserve'` (default): merge adjacent compatible sequences to maintain continuous numbering.
   *  - `'none'`: only apply the preset, do not merge sequences. */
  continuity?: 'preserve' | 'none';
}

export interface ListsCaptureTemplateInput {
  target: ListItemAddress;
  levels?: number[];
}

export interface ListsSetLevelNumberingInput {
  target: ListItemAddress;
  level: number;
  numFmt: string;
  lvlText: string;
  start?: number;
}

export interface ListsSetLevelBulletInput {
  target: ListItemAddress;
  level: number;
  markerText: string;
}

export interface ListsSetLevelPictureBulletInput {
  target: ListItemAddress;
  level: number;
  pictureBulletId: number;
}

export interface ListsSetLevelAlignmentInput {
  target: ListItemAddress;
  level: number;
  alignment: LevelAlignment;
}

export interface ListsSetLevelIndentsInput {
  target: ListItemAddress;
  level: number;
  left?: number;
  hanging?: number;
  firstLine?: number;
}

export interface ListsSetLevelTrailingCharacterInput {
  target: ListItemAddress;
  level: number;
  trailingCharacter: TrailingCharacter;
}

export interface ListsSetLevelMarkerFontInput {
  target: ListItemAddress;
  level: number;
  fontFamily: string;
}

export interface ListsClearLevelOverridesInput {
  target: ListItemAddress;
  level: number;
}

// ---------------------------------------------------------------------------
// Result types — SD-1973
// ---------------------------------------------------------------------------

export interface ListsCaptureTemplateSuccessResult {
  success: true;
  template: ListTemplate;
}

export type ListsCaptureTemplateResult = ListsCaptureTemplateSuccessResult | ListsFailureResult;

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface ListsInsertSuccessResult {
  success: true;
  item: ListItemAddress;
  insertionPoint: TextAddress;
  trackedChangeRefs?: ReceiptInsert[];
}

export interface ListsMutateItemSuccessResult {
  success: true;
  item: ListItemAddress;
}

export interface ListsCreateSuccessResult {
  success: true;
  listId: string;
  item: ListItemAddress;
}

export interface ListsJoinSuccessResult {
  success: true;
  listId: string;
}

export interface ListsSeparateSuccessResult {
  success: true;
  listId: string;
  numId: number;
}

export interface ListsDetachSuccessResult {
  success: true;
  paragraph: {
    kind: 'block';
    nodeType: 'paragraph';
    nodeId: string;
  };
}

export interface ListsConvertToTextSuccessResult {
  success: true;
  paragraph: {
    kind: 'block';
    nodeType: 'paragraph';
    nodeId: string;
  };
}

export interface ListsCanJoinResult {
  canJoin: boolean;
  reason?: CanJoinReason;
  adjacentListId?: string;
}

export interface ListsCanContinuePreviousResult {
  canContinue: boolean;
  reason?: CanContinueReason;
  previousListId?: string;
}

export interface ListsFailureResult {
  success: false;
  failure: ReceiptFailure;
}

export type ListsInsertResult = ListsInsertSuccessResult | ListsFailureResult;
export type ListsMutateItemResult = ListsMutateItemSuccessResult | ListsFailureResult;
export type ListsCreateResult = ListsCreateSuccessResult | ListsFailureResult;
export type ListsJoinResult = ListsJoinSuccessResult | ListsFailureResult;
export type ListsSeparateResult = ListsSeparateSuccessResult | ListsFailureResult;
export type ListsDetachResult = ListsDetachSuccessResult | ListsFailureResult;
export type ListsConvertToTextResult = ListsConvertToTextSuccessResult | ListsFailureResult;
