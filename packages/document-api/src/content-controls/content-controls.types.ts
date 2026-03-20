/**
 * Types for the `contentControls` namespace.
 *
 * Canonical shapes for content control (SDT) discovery, mutation, and
 * typed-control operations. All downstream types reference these definitions.
 */

import type { NodeKind } from '../types/base.js';
import type { ReceiptFailure } from '../types/receipt.js';

// ---------------------------------------------------------------------------
// Enums and constants
// ---------------------------------------------------------------------------

/** Semantic SDT subtype derived from `w:sdtPr` children. */
export type ContentControlType =
  | 'text'
  | 'date'
  | 'checkbox'
  | 'comboBox'
  | 'dropDownList'
  | 'repeatingSection'
  | 'repeatingSectionItem'
  | 'group'
  | 'unknown';

export const CONTENT_CONTROL_TYPES = [
  'text',
  'date',
  'checkbox',
  'comboBox',
  'dropDownList',
  'repeatingSection',
  'repeatingSectionItem',
  'group',
  'unknown',
] as const satisfies readonly ContentControlType[];

/** ECMA-376 `w:lock` modes. */
export type LockMode = 'unlocked' | 'sdtLocked' | 'contentLocked' | 'sdtContentLocked';

export const LOCK_MODES = [
  'unlocked',
  'sdtLocked',
  'contentLocked',
  'sdtContentLocked',
] as const satisfies readonly LockMode[];

/** Visual appearance of the content control wrapper in Word. */
export type ContentControlAppearance = 'boundingBox' | 'tags' | 'hidden';

export const CONTENT_CONTROL_APPEARANCES = [
  'boundingBox',
  'tags',
  'hidden',
] as const satisfies readonly ContentControlAppearance[];

// ---------------------------------------------------------------------------
// Shared sub-shapes
// ---------------------------------------------------------------------------

/** Symbol specification for checkbox checked/unchecked glyphs. */
export interface ContentControlSymbol {
  font: string;
  char: string;
}

/** Choice list item (shared by comboBox and dropDownList). */
export interface ContentControlListItem {
  displayText: string;
  value: string;
}

/** Data binding metadata from `w:dataBinding`. */
export interface ContentControlBinding {
  storeItemId: string;
  xpath: string;
  prefixMappings?: string;
}

// ---------------------------------------------------------------------------
// Subtype-specific property bags
// ---------------------------------------------------------------------------

export interface TextControlProperties {
  multiline?: boolean;
}

export interface DateControlProperties {
  dateFormat?: string;
  dateLocale?: string;
  storageFormat?: string;
  calendar?: string;
}

export interface CheckboxControlProperties {
  checked?: boolean;
  checkedSymbol?: ContentControlSymbol;
  uncheckedSymbol?: ContentControlSymbol;
}

export interface ChoiceControlProperties {
  items?: ContentControlListItem[];
  selectedValue?: string;
}

export interface RepeatingSectionControlProperties {
  allowInsertDelete?: boolean;
}

// ---------------------------------------------------------------------------
// ContentControlProperties — the typed property bag
// ---------------------------------------------------------------------------

export interface ContentControlProperties {
  tag?: string;
  alias?: string;
  appearance?: ContentControlAppearance;
  color?: string;
  placeholder?: string;
  showingPlaceholder?: boolean;
  temporary?: boolean;
  tabIndex?: number;

  // Subtype-specific (populated when matching controlType)
  multiline?: boolean;
  dateFormat?: string;
  dateLocale?: string;
  storageFormat?: string;
  calendar?: string;
  checked?: boolean;
  checkedSymbol?: ContentControlSymbol;
  uncheckedSymbol?: ContentControlSymbol;
  items?: ContentControlListItem[];
  selectedValue?: string;
  allowInsertDelete?: boolean;
}

// ---------------------------------------------------------------------------
// ContentControlInfo — the canonical read shape
// ---------------------------------------------------------------------------

export interface ContentControlTarget {
  kind: NodeKind;
  nodeType: 'sdt';
  nodeId: string;
}

/**
 * Canonical content control info returned by all read/list operations.
 * Replaces the old `SdtNodeInfo`.
 */
export interface ContentControlInfo {
  nodeType: 'sdt';
  kind: NodeKind;
  id: string;
  controlType: ContentControlType;
  lockMode: LockMode;
  properties: ContentControlProperties;
  binding?: ContentControlBinding;
  raw?: Record<string, unknown>;
  target: ContentControlTarget;
  text?: string;
}

// ---------------------------------------------------------------------------
// Mutation result envelope
// ---------------------------------------------------------------------------

export interface ContentControlMutationSuccess {
  success: true;
  contentControl: ContentControlTarget;
  updatedRef?: ContentControlTarget;
}

export interface ContentControlMutationFailure {
  success: false;
  failure: ReceiptFailure;
}

export type ContentControlMutationResult = ContentControlMutationSuccess | ContentControlMutationFailure;

// ---------------------------------------------------------------------------
// Discovery list result
// ---------------------------------------------------------------------------

export interface ContentControlsListResult {
  items: ContentControlInfo[];
  total: number;
}

// ---------------------------------------------------------------------------
// Pagination options (shared across list/select operations)
// ---------------------------------------------------------------------------

export interface ContentControlsPaginationOptions {
  offset?: number;
  limit?: number;
}

// ---------------------------------------------------------------------------
// A. Core CRUD + Discovery — Input types
// ---------------------------------------------------------------------------

export interface CreateContentControlInput {
  kind: NodeKind;
  controlType?: ContentControlType;
  target?: ContentControlTarget;
  tag?: string;
  alias?: string;
  lockMode?: LockMode;
  content?: string;
}

export interface ContentControlsListQuery extends ContentControlsPaginationOptions {
  controlType?: ContentControlType;
  tag?: string;
}

export interface ContentControlsGetInput {
  target: ContentControlTarget;
}

export interface ContentControlsListInRangeInput extends ContentControlsPaginationOptions {
  startBlockId: string;
  endBlockId: string;
}

export interface ContentControlsSelectByTagInput extends ContentControlsPaginationOptions {
  tag: string;
}

export interface ContentControlsSelectByTitleInput extends ContentControlsPaginationOptions {
  title: string;
}

export interface ContentControlsListChildrenInput extends ContentControlsPaginationOptions {
  target: ContentControlTarget;
}

export interface ContentControlsGetParentInput {
  target: ContentControlTarget;
}

export interface ContentControlsWrapInput {
  kind: NodeKind;
  target: ContentControlTarget;
  tag?: string;
  alias?: string;
  lockMode?: LockMode;
}

export interface ContentControlsUnwrapInput {
  target: ContentControlTarget;
}

export interface ContentControlsDeleteInput {
  target: ContentControlTarget;
}

export interface ContentControlsCopyInput {
  target: ContentControlTarget;
  destination: ContentControlTarget;
}

export interface ContentControlsMoveInput {
  target: ContentControlTarget;
  destination: ContentControlTarget;
}

export interface ContentControlsPatchInput {
  target: ContentControlTarget;
  alias?: string | null;
  tag?: string | null;
  appearance?: ContentControlAppearance | null;
  color?: string | null;
  placeholder?: string | null;
  showingPlaceholder?: boolean;
  temporary?: boolean;
  tabIndex?: number | null;
}

export interface ContentControlsSetLockModeInput {
  target: ContentControlTarget;
  lockMode: LockMode;
}

export interface ContentControlsSetTypeInput {
  target: ContentControlTarget;
  controlType: ContentControlType;
}

export interface ContentControlsGetContentInput {
  target: ContentControlTarget;
}

export interface ContentControlsGetContentResult {
  content: string;
  format: 'text' | 'html';
}

export interface ContentControlsReplaceContentInput {
  target: ContentControlTarget;
  content: string;
  format?: 'text' | 'html';
}

export interface ContentControlsClearContentInput {
  target: ContentControlTarget;
}

export interface ContentControlsAppendContentInput {
  target: ContentControlTarget;
  content: string;
  format?: 'text' | 'html';
}

export interface ContentControlsPrependContentInput {
  target: ContentControlTarget;
  content: string;
  format?: 'text' | 'html';
}

export interface ContentControlsInsertBeforeInput {
  target: ContentControlTarget;
  content: string;
  format?: 'text' | 'html';
}

export interface ContentControlsInsertAfterInput {
  target: ContentControlTarget;
  content: string;
  format?: 'text' | 'html';
}

// ---------------------------------------------------------------------------
// B. Data Binding + Raw/Compatibility — Input types
// ---------------------------------------------------------------------------

export interface ContentControlsGetBindingInput {
  target: ContentControlTarget;
}

export interface ContentControlsSetBindingInput {
  target: ContentControlTarget;
  storeItemId: string;
  xpath: string;
  prefixMappings?: string;
}

export interface ContentControlsClearBindingInput {
  target: ContentControlTarget;
}

export interface ContentControlsGetRawPropertiesInput {
  target: ContentControlTarget;
}

export interface ContentControlsGetRawPropertiesResult {
  properties: Record<string, unknown>;
}

export type RawPatchOp =
  | { op: 'set'; name: string; element: Record<string, unknown> }
  | { op: 'remove'; name: string }
  | { op: 'setAttr'; name: string; attr: string; value: string }
  | { op: 'removeAttr'; name: string; attr: string };

export interface ContentControlsPatchRawPropertiesInput {
  target: ContentControlTarget;
  patches: RawPatchOp[];
}

export interface ContentControlsValidateWordCompatibilityInput {
  target: ContentControlTarget;
}

export interface WordCompatibilityDiagnostic {
  code: string;
  severity: 'error' | 'warning';
  message: string;
}

export interface ContentControlsValidateWordCompatibilityResult {
  compatible: boolean;
  diagnostics: WordCompatibilityDiagnostic[];
}

export interface ContentControlsNormalizeWordCompatibilityInput {
  target: ContentControlTarget;
}

export interface ContentControlsNormalizeTagPayloadInput {
  target: ContentControlTarget;
}

// ---------------------------------------------------------------------------
// C. Typed Controls — Input types
// ---------------------------------------------------------------------------

// Text
export interface ContentControlsTextSetMultilineInput {
  target: ContentControlTarget;
  multiline: boolean;
}

export interface ContentControlsTextSetValueInput {
  target: ContentControlTarget;
  value: string;
}

export interface ContentControlsTextClearValueInput {
  target: ContentControlTarget;
}

// Date
export interface ContentControlsDateSetValueInput {
  target: ContentControlTarget;
  value: string;
}

export interface ContentControlsDateClearValueInput {
  target: ContentControlTarget;
}

export interface ContentControlsDateSetDisplayFormatInput {
  target: ContentControlTarget;
  format: string;
}

export interface ContentControlsDateSetDisplayLocaleInput {
  target: ContentControlTarget;
  locale: string;
}

export interface ContentControlsDateSetStorageFormatInput {
  target: ContentControlTarget;
  format: string;
}

export interface ContentControlsDateSetCalendarInput {
  target: ContentControlTarget;
  calendar: string;
}

// Checkbox
export interface ContentControlsCheckboxGetStateInput {
  target: ContentControlTarget;
}

export interface ContentControlsCheckboxGetStateResult {
  checked: boolean;
}

export interface ContentControlsCheckboxSetStateInput {
  target: ContentControlTarget;
  checked: boolean;
}

export interface ContentControlsCheckboxToggleInput {
  target: ContentControlTarget;
}

export interface ContentControlsCheckboxSetSymbolPairInput {
  target: ContentControlTarget;
  checkedSymbol: ContentControlSymbol;
  uncheckedSymbol: ContentControlSymbol;
}

// Choice list (comboBox + dropDownList)
export interface ContentControlsChoiceListGetItemsInput {
  target: ContentControlTarget;
}

export interface ContentControlsChoiceListGetItemsResult {
  items: ContentControlListItem[];
  selectedValue?: string;
}

export interface ContentControlsChoiceListSetItemsInput {
  target: ContentControlTarget;
  items: ContentControlListItem[];
}

export interface ContentControlsChoiceListSetSelectedInput {
  target: ContentControlTarget;
  value: string;
}

// ---------------------------------------------------------------------------
// D. Repeating Section + Group — Input types
// ---------------------------------------------------------------------------

export interface ContentControlsRepeatingSectionListItemsInput {
  target: ContentControlTarget;
}

export interface ContentControlsRepeatingSectionListItemsResult {
  items: ContentControlInfo[];
  total: number;
}

export interface ContentControlsRepeatingSectionInsertItemBeforeInput {
  target: ContentControlTarget;
  index: number;
}

export interface ContentControlsRepeatingSectionInsertItemAfterInput {
  target: ContentControlTarget;
  index: number;
}

export interface ContentControlsRepeatingSectionCloneItemInput {
  target: ContentControlTarget;
  index: number;
}

export interface ContentControlsRepeatingSectionDeleteItemInput {
  target: ContentControlTarget;
  index: number;
}

export interface ContentControlsRepeatingSectionSetAllowInsertDeleteInput {
  target: ContentControlTarget;
  allow: boolean;
}

export interface ContentControlsGroupWrapInput {
  target: ContentControlTarget;
}

export interface ContentControlsGroupUngroupInput {
  target: ContentControlTarget;
}
