/**
 * Content Controls API — interface, adapter, and execute functions.
 *
 * Each public method delegates to an `execute*` function that validates input
 * before calling the adapter. The adapter is implemented by the engine layer
 * (super-editor).
 */

import type { MutationOptions } from '../write/write.js';
import type {
  ContentControlInfo,
  ContentControlMutationResult,
  ContentControlsListResult,
  ContentControlsListQuery,
  ContentControlsGetInput,
  ContentControlsListInRangeInput,
  ContentControlsSelectByTagInput,
  ContentControlsSelectByTitleInput,
  ContentControlsListChildrenInput,
  ContentControlsGetParentInput,
  ContentControlsWrapInput,
  ContentControlsUnwrapInput,
  ContentControlsDeleteInput,
  ContentControlsCopyInput,
  ContentControlsMoveInput,
  ContentControlsPatchInput,
  ContentControlsSetLockModeInput,
  ContentControlsSetTypeInput,
  ContentControlsGetContentInput,
  ContentControlsGetContentResult,
  ContentControlsReplaceContentInput,
  ContentControlsClearContentInput,
  ContentControlsAppendContentInput,
  ContentControlsPrependContentInput,
  ContentControlsInsertBeforeInput,
  ContentControlsInsertAfterInput,
  ContentControlsGetBindingInput,
  ContentControlBinding,
  ContentControlsSetBindingInput,
  ContentControlsClearBindingInput,
  ContentControlsGetRawPropertiesInput,
  ContentControlsGetRawPropertiesResult,
  ContentControlsPatchRawPropertiesInput,
  ContentControlsValidateWordCompatibilityInput,
  ContentControlsValidateWordCompatibilityResult,
  ContentControlsNormalizeWordCompatibilityInput,
  ContentControlsNormalizeTagPayloadInput,
  ContentControlsTextSetMultilineInput,
  ContentControlsTextSetValueInput,
  ContentControlsTextClearValueInput,
  ContentControlsDateSetValueInput,
  ContentControlsDateClearValueInput,
  ContentControlsDateSetDisplayFormatInput,
  ContentControlsDateSetDisplayLocaleInput,
  ContentControlsDateSetStorageFormatInput,
  ContentControlsDateSetCalendarInput,
  ContentControlsCheckboxGetStateInput,
  ContentControlsCheckboxGetStateResult,
  ContentControlsCheckboxSetStateInput,
  ContentControlsCheckboxToggleInput,
  ContentControlsCheckboxSetSymbolPairInput,
  ContentControlsChoiceListGetItemsInput,
  ContentControlsChoiceListGetItemsResult,
  ContentControlsChoiceListSetItemsInput,
  ContentControlsChoiceListSetSelectedInput,
  ContentControlsRepeatingSectionListItemsInput,
  ContentControlsRepeatingSectionListItemsResult,
  ContentControlsRepeatingSectionInsertItemBeforeInput,
  ContentControlsRepeatingSectionInsertItemAfterInput,
  ContentControlsRepeatingSectionCloneItemInput,
  ContentControlsRepeatingSectionDeleteItemInput,
  ContentControlsRepeatingSectionSetAllowInsertDeleteInput,
  ContentControlsGroupWrapInput,
  ContentControlsGroupUngroupInput,
  CreateContentControlInput,
} from './content-controls.types.js';

// ---------------------------------------------------------------------------
// Public API interface
// ---------------------------------------------------------------------------

export interface ContentControlsTextApi {
  setMultiline(input: ContentControlsTextSetMultilineInput, options?: MutationOptions): ContentControlMutationResult;
  setValue(input: ContentControlsTextSetValueInput, options?: MutationOptions): ContentControlMutationResult;
  clearValue(input: ContentControlsTextClearValueInput, options?: MutationOptions): ContentControlMutationResult;
}

export interface ContentControlsDateApi {
  setValue(input: ContentControlsDateSetValueInput, options?: MutationOptions): ContentControlMutationResult;
  clearValue(input: ContentControlsDateClearValueInput, options?: MutationOptions): ContentControlMutationResult;
  setDisplayFormat(
    input: ContentControlsDateSetDisplayFormatInput,
    options?: MutationOptions,
  ): ContentControlMutationResult;
  setDisplayLocale(
    input: ContentControlsDateSetDisplayLocaleInput,
    options?: MutationOptions,
  ): ContentControlMutationResult;
  setStorageFormat(
    input: ContentControlsDateSetStorageFormatInput,
    options?: MutationOptions,
  ): ContentControlMutationResult;
  setCalendar(input: ContentControlsDateSetCalendarInput, options?: MutationOptions): ContentControlMutationResult;
}

export interface ContentControlsCheckboxApi {
  getState(input: ContentControlsCheckboxGetStateInput): ContentControlsCheckboxGetStateResult;
  setState(input: ContentControlsCheckboxSetStateInput, options?: MutationOptions): ContentControlMutationResult;
  toggle(input: ContentControlsCheckboxToggleInput, options?: MutationOptions): ContentControlMutationResult;
  setSymbolPair(
    input: ContentControlsCheckboxSetSymbolPairInput,
    options?: MutationOptions,
  ): ContentControlMutationResult;
}

export interface ContentControlsChoiceListApi {
  getItems(input: ContentControlsChoiceListGetItemsInput): ContentControlsChoiceListGetItemsResult;
  setItems(input: ContentControlsChoiceListSetItemsInput, options?: MutationOptions): ContentControlMutationResult;
  setSelected(
    input: ContentControlsChoiceListSetSelectedInput,
    options?: MutationOptions,
  ): ContentControlMutationResult;
}

export interface ContentControlsRepeatingSectionApi {
  listItems(input: ContentControlsRepeatingSectionListItemsInput): ContentControlsRepeatingSectionListItemsResult;
  insertItemBefore(
    input: ContentControlsRepeatingSectionInsertItemBeforeInput,
    options?: MutationOptions,
  ): ContentControlMutationResult;
  insertItemAfter(
    input: ContentControlsRepeatingSectionInsertItemAfterInput,
    options?: MutationOptions,
  ): ContentControlMutationResult;
  cloneItem(
    input: ContentControlsRepeatingSectionCloneItemInput,
    options?: MutationOptions,
  ): ContentControlMutationResult;
  deleteItem(
    input: ContentControlsRepeatingSectionDeleteItemInput,
    options?: MutationOptions,
  ): ContentControlMutationResult;
  setAllowInsertDelete(
    input: ContentControlsRepeatingSectionSetAllowInsertDeleteInput,
    options?: MutationOptions,
  ): ContentControlMutationResult;
}

export interface ContentControlsGroupApi {
  wrap(input: ContentControlsGroupWrapInput, options?: MutationOptions): ContentControlMutationResult;
  ungroup(input: ContentControlsGroupUngroupInput, options?: MutationOptions): ContentControlMutationResult;
}

export interface ContentControlsApi {
  // A. Core CRUD + Discovery
  list(query?: ContentControlsListQuery): ContentControlsListResult;
  get(input: ContentControlsGetInput): ContentControlInfo;
  listInRange(input: ContentControlsListInRangeInput): ContentControlsListResult;
  selectByTag(input: ContentControlsSelectByTagInput): ContentControlsListResult;
  selectByTitle(input: ContentControlsSelectByTitleInput): ContentControlsListResult;
  listChildren(input: ContentControlsListChildrenInput): ContentControlsListResult;
  getParent(input: ContentControlsGetParentInput): ContentControlInfo | null;
  wrap(input: ContentControlsWrapInput, options?: MutationOptions): ContentControlMutationResult;
  unwrap(input: ContentControlsUnwrapInput, options?: MutationOptions): ContentControlMutationResult;
  delete(input: ContentControlsDeleteInput, options?: MutationOptions): ContentControlMutationResult;
  copy(input: ContentControlsCopyInput, options?: MutationOptions): ContentControlMutationResult;
  move(input: ContentControlsMoveInput, options?: MutationOptions): ContentControlMutationResult;
  patch(input: ContentControlsPatchInput, options?: MutationOptions): ContentControlMutationResult;
  setLockMode(input: ContentControlsSetLockModeInput, options?: MutationOptions): ContentControlMutationResult;
  setType(input: ContentControlsSetTypeInput, options?: MutationOptions): ContentControlMutationResult;
  getContent(input: ContentControlsGetContentInput): ContentControlsGetContentResult;
  replaceContent(input: ContentControlsReplaceContentInput, options?: MutationOptions): ContentControlMutationResult;
  clearContent(input: ContentControlsClearContentInput, options?: MutationOptions): ContentControlMutationResult;
  appendContent(input: ContentControlsAppendContentInput, options?: MutationOptions): ContentControlMutationResult;
  prependContent(input: ContentControlsPrependContentInput, options?: MutationOptions): ContentControlMutationResult;
  insertBefore(input: ContentControlsInsertBeforeInput, options?: MutationOptions): ContentControlMutationResult;
  insertAfter(input: ContentControlsInsertAfterInput, options?: MutationOptions): ContentControlMutationResult;

  // B. Data Binding + Raw/Compatibility
  getBinding(input: ContentControlsGetBindingInput): ContentControlBinding | null;
  setBinding(input: ContentControlsSetBindingInput, options?: MutationOptions): ContentControlMutationResult;
  clearBinding(input: ContentControlsClearBindingInput, options?: MutationOptions): ContentControlMutationResult;
  getRawProperties(input: ContentControlsGetRawPropertiesInput): ContentControlsGetRawPropertiesResult;
  patchRawProperties(
    input: ContentControlsPatchRawPropertiesInput,
    options?: MutationOptions,
  ): ContentControlMutationResult;
  validateWordCompatibility(
    input: ContentControlsValidateWordCompatibilityInput,
  ): ContentControlsValidateWordCompatibilityResult;
  normalizeWordCompatibility(
    input: ContentControlsNormalizeWordCompatibilityInput,
    options?: MutationOptions,
  ): ContentControlMutationResult;
  normalizeTagPayload(
    input: ContentControlsNormalizeTagPayloadInput,
    options?: MutationOptions,
  ): ContentControlMutationResult;

  // C. Typed Controls (nested sub-APIs)
  text: ContentControlsTextApi;
  date: ContentControlsDateApi;
  checkbox: ContentControlsCheckboxApi;
  choiceList: ContentControlsChoiceListApi;

  // D. Repeating Section + Group (nested sub-APIs)
  repeatingSection: ContentControlsRepeatingSectionApi;
  group: ContentControlsGroupApi;
}

// ---------------------------------------------------------------------------
// Adapter interface — implemented by the engine layer
// ---------------------------------------------------------------------------

export type ContentControlsAdapter = ContentControlsApi;

// ---------------------------------------------------------------------------
// Execute functions — thin validation + delegation
// ---------------------------------------------------------------------------

export function executeContentControlsList(
  adapter: ContentControlsAdapter,
  query?: ContentControlsListQuery,
): ContentControlsListResult {
  return adapter.list(query);
}

export function executeContentControlsGet(
  adapter: ContentControlsAdapter,
  input: ContentControlsGetInput,
): ContentControlInfo {
  return adapter.get(input);
}

export function executeContentControlsListInRange(
  adapter: ContentControlsAdapter,
  input: ContentControlsListInRangeInput,
): ContentControlsListResult {
  return adapter.listInRange(input);
}

export function executeContentControlsSelectByTag(
  adapter: ContentControlsAdapter,
  input: ContentControlsSelectByTagInput,
): ContentControlsListResult {
  return adapter.selectByTag(input);
}

export function executeContentControlsSelectByTitle(
  adapter: ContentControlsAdapter,
  input: ContentControlsSelectByTitleInput,
): ContentControlsListResult {
  return adapter.selectByTitle(input);
}

export function executeContentControlsListChildren(
  adapter: ContentControlsAdapter,
  input: ContentControlsListChildrenInput,
): ContentControlsListResult {
  return adapter.listChildren(input);
}

export function executeContentControlsGetParent(
  adapter: ContentControlsAdapter,
  input: ContentControlsGetParentInput,
): ContentControlInfo | null {
  return adapter.getParent(input);
}

export function executeContentControlsWrap(
  adapter: ContentControlsAdapter,
  input: ContentControlsWrapInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  return adapter.wrap(input, options);
}

export function executeContentControlsUnwrap(
  adapter: ContentControlsAdapter,
  input: ContentControlsUnwrapInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  return adapter.unwrap(input, options);
}

export function executeContentControlsDelete(
  adapter: ContentControlsAdapter,
  input: ContentControlsDeleteInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  return adapter.delete(input, options);
}

export function executeContentControlsCopy(
  adapter: ContentControlsAdapter,
  input: ContentControlsCopyInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  return adapter.copy(input, options);
}

export function executeContentControlsMove(
  adapter: ContentControlsAdapter,
  input: ContentControlsMoveInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  return adapter.move(input, options);
}

export function executeContentControlsPatch(
  adapter: ContentControlsAdapter,
  input: ContentControlsPatchInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  return adapter.patch(input, options);
}

export function executeContentControlsSetLockMode(
  adapter: ContentControlsAdapter,
  input: ContentControlsSetLockModeInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  return adapter.setLockMode(input, options);
}

export function executeContentControlsSetType(
  adapter: ContentControlsAdapter,
  input: ContentControlsSetTypeInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  return adapter.setType(input, options);
}

export function executeContentControlsGetContent(
  adapter: ContentControlsAdapter,
  input: ContentControlsGetContentInput,
): ContentControlsGetContentResult {
  return adapter.getContent(input);
}

export function executeContentControlsReplaceContent(
  adapter: ContentControlsAdapter,
  input: ContentControlsReplaceContentInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  return adapter.replaceContent(input, options);
}

export function executeContentControlsClearContent(
  adapter: ContentControlsAdapter,
  input: ContentControlsClearContentInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  return adapter.clearContent(input, options);
}

export function executeContentControlsAppendContent(
  adapter: ContentControlsAdapter,
  input: ContentControlsAppendContentInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  return adapter.appendContent(input, options);
}

export function executeContentControlsPrependContent(
  adapter: ContentControlsAdapter,
  input: ContentControlsPrependContentInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  return adapter.prependContent(input, options);
}

export function executeContentControlsInsertBefore(
  adapter: ContentControlsAdapter,
  input: ContentControlsInsertBeforeInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  return adapter.insertBefore(input, options);
}

export function executeContentControlsInsertAfter(
  adapter: ContentControlsAdapter,
  input: ContentControlsInsertAfterInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  return adapter.insertAfter(input, options);
}

export function executeContentControlsGetBinding(
  adapter: ContentControlsAdapter,
  input: ContentControlsGetBindingInput,
): ContentControlBinding | null {
  return adapter.getBinding(input);
}

export function executeContentControlsSetBinding(
  adapter: ContentControlsAdapter,
  input: ContentControlsSetBindingInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  return adapter.setBinding(input, options);
}

export function executeContentControlsClearBinding(
  adapter: ContentControlsAdapter,
  input: ContentControlsClearBindingInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  return adapter.clearBinding(input, options);
}

export function executeContentControlsGetRawProperties(
  adapter: ContentControlsAdapter,
  input: ContentControlsGetRawPropertiesInput,
): ContentControlsGetRawPropertiesResult {
  return adapter.getRawProperties(input);
}

export function executeContentControlsPatchRawProperties(
  adapter: ContentControlsAdapter,
  input: ContentControlsPatchRawPropertiesInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  return adapter.patchRawProperties(input, options);
}

export function executeContentControlsValidateWordCompatibility(
  adapter: ContentControlsAdapter,
  input: ContentControlsValidateWordCompatibilityInput,
): ContentControlsValidateWordCompatibilityResult {
  return adapter.validateWordCompatibility(input);
}

export function executeContentControlsNormalizeWordCompatibility(
  adapter: ContentControlsAdapter,
  input: ContentControlsNormalizeWordCompatibilityInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  return adapter.normalizeWordCompatibility(input, options);
}

export function executeContentControlsNormalizeTagPayload(
  adapter: ContentControlsAdapter,
  input: ContentControlsNormalizeTagPayloadInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  return adapter.normalizeTagPayload(input, options);
}

// Typed controls
export function executeContentControlsTextSetMultiline(
  adapter: ContentControlsAdapter,
  input: ContentControlsTextSetMultilineInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  return adapter.text.setMultiline(input, options);
}

export function executeContentControlsTextSetValue(
  adapter: ContentControlsAdapter,
  input: ContentControlsTextSetValueInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  return adapter.text.setValue(input, options);
}

export function executeContentControlsTextClearValue(
  adapter: ContentControlsAdapter,
  input: ContentControlsTextClearValueInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  return adapter.text.clearValue(input, options);
}

export function executeContentControlsDateSetValue(
  adapter: ContentControlsAdapter,
  input: ContentControlsDateSetValueInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  return adapter.date.setValue(input, options);
}

export function executeContentControlsDateClearValue(
  adapter: ContentControlsAdapter,
  input: ContentControlsDateClearValueInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  return adapter.date.clearValue(input, options);
}

export function executeContentControlsDateSetDisplayFormat(
  adapter: ContentControlsAdapter,
  input: ContentControlsDateSetDisplayFormatInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  return adapter.date.setDisplayFormat(input, options);
}

export function executeContentControlsDateSetDisplayLocale(
  adapter: ContentControlsAdapter,
  input: ContentControlsDateSetDisplayLocaleInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  return adapter.date.setDisplayLocale(input, options);
}

export function executeContentControlsDateSetStorageFormat(
  adapter: ContentControlsAdapter,
  input: ContentControlsDateSetStorageFormatInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  return adapter.date.setStorageFormat(input, options);
}

export function executeContentControlsDateSetCalendar(
  adapter: ContentControlsAdapter,
  input: ContentControlsDateSetCalendarInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  return adapter.date.setCalendar(input, options);
}

export function executeContentControlsCheckboxGetState(
  adapter: ContentControlsAdapter,
  input: ContentControlsCheckboxGetStateInput,
): ContentControlsCheckboxGetStateResult {
  return adapter.checkbox.getState(input);
}

export function executeContentControlsCheckboxSetState(
  adapter: ContentControlsAdapter,
  input: ContentControlsCheckboxSetStateInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  return adapter.checkbox.setState(input, options);
}

export function executeContentControlsCheckboxToggle(
  adapter: ContentControlsAdapter,
  input: ContentControlsCheckboxToggleInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  return adapter.checkbox.toggle(input, options);
}

export function executeContentControlsCheckboxSetSymbolPair(
  adapter: ContentControlsAdapter,
  input: ContentControlsCheckboxSetSymbolPairInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  return adapter.checkbox.setSymbolPair(input, options);
}

export function executeContentControlsChoiceListGetItems(
  adapter: ContentControlsAdapter,
  input: ContentControlsChoiceListGetItemsInput,
): ContentControlsChoiceListGetItemsResult {
  return adapter.choiceList.getItems(input);
}

export function executeContentControlsChoiceListSetItems(
  adapter: ContentControlsAdapter,
  input: ContentControlsChoiceListSetItemsInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  return adapter.choiceList.setItems(input, options);
}

export function executeContentControlsChoiceListSetSelected(
  adapter: ContentControlsAdapter,
  input: ContentControlsChoiceListSetSelectedInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  return adapter.choiceList.setSelected(input, options);
}

export function executeContentControlsRepeatingSectionListItems(
  adapter: ContentControlsAdapter,
  input: ContentControlsRepeatingSectionListItemsInput,
): ContentControlsRepeatingSectionListItemsResult {
  return adapter.repeatingSection.listItems(input);
}

export function executeContentControlsRepeatingSectionInsertItemBefore(
  adapter: ContentControlsAdapter,
  input: ContentControlsRepeatingSectionInsertItemBeforeInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  return adapter.repeatingSection.insertItemBefore(input, options);
}

export function executeContentControlsRepeatingSectionInsertItemAfter(
  adapter: ContentControlsAdapter,
  input: ContentControlsRepeatingSectionInsertItemAfterInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  return adapter.repeatingSection.insertItemAfter(input, options);
}

export function executeContentControlsRepeatingSectionCloneItem(
  adapter: ContentControlsAdapter,
  input: ContentControlsRepeatingSectionCloneItemInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  return adapter.repeatingSection.cloneItem(input, options);
}

export function executeContentControlsRepeatingSectionDeleteItem(
  adapter: ContentControlsAdapter,
  input: ContentControlsRepeatingSectionDeleteItemInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  return adapter.repeatingSection.deleteItem(input, options);
}

export function executeContentControlsRepeatingSectionSetAllowInsertDelete(
  adapter: ContentControlsAdapter,
  input: ContentControlsRepeatingSectionSetAllowInsertDeleteInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  return adapter.repeatingSection.setAllowInsertDelete(input, options);
}

export function executeContentControlsGroupWrap(
  adapter: ContentControlsAdapter,
  input: ContentControlsGroupWrapInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  return adapter.group.wrap(input, options);
}

export function executeContentControlsGroupUngroup(
  adapter: ContentControlsAdapter,
  input: ContentControlsGroupUngroupInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  return adapter.group.ungroup(input, options);
}

// Create (lives under create.* namespace, not contentControls.*)
export function executeCreateContentControl(
  adapter: ContentControlsCreateAdapter,
  input: CreateContentControlInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  return adapter.create(input, options);
}

/** Adapter extension for create.contentControl. */
export interface ContentControlsCreateAdapter {
  create(input: CreateContentControlInput, options?: MutationOptions): ContentControlMutationResult;
}
