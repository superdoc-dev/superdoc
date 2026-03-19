import type { MutationOptions } from '../write/write.js';
import { normalizeMutationOptions } from '../write/write.js';
import { DocumentApiValidationError } from '../errors.js';
import type {
  ListInsertInput,
  ListsGetInput,
  ListsInsertResult,
  ListsListQuery,
  ListsListResult,
  ListsMutateItemResult,
  ListTargetInput,
  ListItemInfo,
  ListsCreateInput,
  ListsCreateResult,
  ListsAttachInput,
  ListsDetachInput,
  ListsDetachResult,
  ListsJoinInput,
  ListsJoinResult,
  ListsCanJoinInput,
  ListsCanJoinResult,
  ListsSeparateInput,
  ListsSeparateResult,
  ListsSetLevelInput,
  ListsSetValueInput,
  ListsContinuePreviousInput,
  ListsCanContinuePreviousInput,
  ListsCanContinuePreviousResult,
  ListsSetLevelRestartInput,
  ListsConvertToTextInput,
  ListsConvertToTextResult,
  ListsApplyTemplateInput,
  ListsApplyPresetInput,
  ListsCaptureTemplateInput,
  ListsCaptureTemplateResult,
  ListsSetLevelNumberingInput,
  ListsSetLevelBulletInput,
  ListsSetLevelPictureBulletInput,
  ListsSetLevelAlignmentInput,
  ListsSetLevelIndentsInput,
  ListsSetLevelTrailingCharacterInput,
  ListsSetLevelMarkerFontInput,
  ListsClearLevelOverridesInput,
  ListsSetTypeInput,
  ListsGetStyleInput,
  ListsGetStyleResult,
  ListsApplyStyleInput,
  ListsRestartAtInput,
  ListsSetLevelNumberStyleInput,
  ListsSetLevelTextInput,
  ListsSetLevelStartInput,
  ListsSetLevelLayoutInput,
} from './lists.types.js';

export type {
  ListInsertInput,
  ListsGetInput,
  ListsInsertResult,
  ListsListQuery,
  ListsListResult,
  ListsMutateItemResult,
  ListTargetInput,
  ListItemInfo,
  ListsCreateInput,
  ListsCreateResult,
  ListsAttachInput,
  ListsDetachInput,
  ListsDetachResult,
  ListsJoinInput,
  ListsJoinResult,
  ListsCanJoinInput,
  ListsCanJoinResult,
  ListsSeparateInput,
  ListsSeparateResult,
  ListsSetLevelInput,
  ListsSetValueInput,
  ListsContinuePreviousInput,
  ListsCanContinuePreviousInput,
  ListsCanContinuePreviousResult,
  ListsSetLevelRestartInput,
  ListsConvertToTextInput,
  ListsConvertToTextResult,
  ListsApplyTemplateInput,
  ListsApplyPresetInput,
  ListsCaptureTemplateInput,
  ListsCaptureTemplateResult,
  ListsSetLevelNumberingInput,
  ListsSetLevelBulletInput,
  ListsSetLevelPictureBulletInput,
  ListsSetLevelAlignmentInput,
  ListsSetLevelIndentsInput,
  ListsSetLevelTrailingCharacterInput,
  ListsSetLevelMarkerFontInput,
  ListsClearLevelOverridesInput,
  ListsSetTypeInput,
  ListsGetStyleInput,
  ListsGetStyleResult,
  ListsApplyStyleInput,
  ListsRestartAtInput,
  ListsSetLevelNumberStyleInput,
  ListsSetLevelTextInput,
  ListsSetLevelStartInput,
  ListsSetLevelLayoutInput,
} from './lists.types.js';

/**
 * Validates that a list operation input has a target locator.
 */
function validateListTarget(input: { target?: unknown }, operationName: string): void {
  if (input.target === undefined) {
    throw new DocumentApiValidationError('INVALID_TARGET', `${operationName} requires a target.`);
  }
}

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

export interface ListsAdapter {
  // Discovery
  list(query?: ListsListQuery): ListsListResult;
  get(input: ListsGetInput): ListItemInfo;

  // Kept operations
  insert(input: ListInsertInput, options?: MutationOptions): ListsInsertResult;
  indent(input: ListTargetInput, options?: MutationOptions): ListsMutateItemResult;
  outdent(input: ListTargetInput, options?: MutationOptions): ListsMutateItemResult;

  // SD-1272 operations
  create(input: ListsCreateInput, options?: MutationOptions): ListsCreateResult;
  attach(input: ListsAttachInput, options?: MutationOptions): ListsMutateItemResult;
  detach(input: ListsDetachInput, options?: MutationOptions): ListsDetachResult;
  join(input: ListsJoinInput, options?: MutationOptions): ListsJoinResult;
  canJoin(input: ListsCanJoinInput): ListsCanJoinResult;
  separate(input: ListsSeparateInput, options?: MutationOptions): ListsSeparateResult;
  setLevel(input: ListsSetLevelInput, options?: MutationOptions): ListsMutateItemResult;
  setValue(input: ListsSetValueInput, options?: MutationOptions): ListsMutateItemResult;
  continuePrevious(input: ListsContinuePreviousInput, options?: MutationOptions): ListsMutateItemResult;
  canContinuePrevious(input: ListsCanContinuePreviousInput): ListsCanContinuePreviousResult;
  setLevelRestart(input: ListsSetLevelRestartInput, options?: MutationOptions): ListsMutateItemResult;
  convertToText(input: ListsConvertToTextInput, options?: MutationOptions): ListsConvertToTextResult;

  // SD-1973 formatting operations
  applyTemplate(input: ListsApplyTemplateInput, options?: MutationOptions): ListsMutateItemResult;
  applyPreset(input: ListsApplyPresetInput, options?: MutationOptions): ListsMutateItemResult;
  captureTemplate(input: ListsCaptureTemplateInput): ListsCaptureTemplateResult;
  setLevelNumbering(input: ListsSetLevelNumberingInput, options?: MutationOptions): ListsMutateItemResult;
  setLevelBullet(input: ListsSetLevelBulletInput, options?: MutationOptions): ListsMutateItemResult;
  setLevelPictureBullet(input: ListsSetLevelPictureBulletInput, options?: MutationOptions): ListsMutateItemResult;
  setLevelAlignment(input: ListsSetLevelAlignmentInput, options?: MutationOptions): ListsMutateItemResult;
  setLevelIndents(input: ListsSetLevelIndentsInput, options?: MutationOptions): ListsMutateItemResult;
  setLevelTrailingCharacter(
    input: ListsSetLevelTrailingCharacterInput,
    options?: MutationOptions,
  ): ListsMutateItemResult;
  setLevelMarkerFont(input: ListsSetLevelMarkerFontInput, options?: MutationOptions): ListsMutateItemResult;
  clearLevelOverrides(input: ListsClearLevelOverridesInput, options?: MutationOptions): ListsMutateItemResult;

  // SD-2052 compound operation
  setType(input: ListsSetTypeInput, options?: MutationOptions): ListsMutateItemResult;

  // SD-2025 user-facing operations
  getStyle(input: ListsGetStyleInput): ListsGetStyleResult;
  applyStyle(input: ListsApplyStyleInput, options?: MutationOptions): ListsMutateItemResult;
  restartAt(input: ListsRestartAtInput, options?: MutationOptions): ListsMutateItemResult;
  setLevelNumberStyle(input: ListsSetLevelNumberStyleInput, options?: MutationOptions): ListsMutateItemResult;
  setLevelText(input: ListsSetLevelTextInput, options?: MutationOptions): ListsMutateItemResult;
  setLevelStart(input: ListsSetLevelStartInput, options?: MutationOptions): ListsMutateItemResult;
  setLevelLayout(input: ListsSetLevelLayoutInput, options?: MutationOptions): ListsMutateItemResult;
}

export type ListsApi = ListsAdapter;

// ---------------------------------------------------------------------------
// Execute wrappers — discovery
// ---------------------------------------------------------------------------

export function executeListsList(adapter: ListsAdapter, query?: ListsListQuery): ListsListResult {
  return adapter.list(query);
}

export function executeListsGet(adapter: ListsAdapter, input: ListsGetInput): ListItemInfo {
  return adapter.get(input);
}

// ---------------------------------------------------------------------------
// Execute wrappers — kept operations
// ---------------------------------------------------------------------------

export function executeListsInsert(
  adapter: ListsAdapter,
  input: ListInsertInput,
  options?: MutationOptions,
): ListsInsertResult {
  validateListTarget(input, 'lists.insert');
  return adapter.insert(input, normalizeMutationOptions(options));
}

export function executeListsIndent(
  adapter: ListsAdapter,
  input: ListTargetInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  validateListTarget(input, 'lists.indent');
  return adapter.indent(input, normalizeMutationOptions(options));
}

export function executeListsOutdent(
  adapter: ListsAdapter,
  input: ListTargetInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  validateListTarget(input, 'lists.outdent');
  return adapter.outdent(input, normalizeMutationOptions(options));
}

// ---------------------------------------------------------------------------
// Execute wrappers — SD-1272 operations
// ---------------------------------------------------------------------------

export function executeListsCreate(
  adapter: ListsAdapter,
  input: ListsCreateInput,
  options?: MutationOptions,
): ListsCreateResult {
  return adapter.create(input, normalizeMutationOptions(options));
}

export function executeListsAttach(
  adapter: ListsAdapter,
  input: ListsAttachInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  validateListTarget(input, 'lists.attach');
  return adapter.attach(input, normalizeMutationOptions(options));
}

export function executeListsDetach(
  adapter: ListsAdapter,
  input: ListsDetachInput,
  options?: MutationOptions,
): ListsDetachResult {
  validateListTarget(input, 'lists.detach');
  return adapter.detach(input, normalizeMutationOptions(options));
}

export function executeListsJoin(
  adapter: ListsAdapter,
  input: ListsJoinInput,
  options?: MutationOptions,
): ListsJoinResult {
  validateListTarget(input, 'lists.join');
  return adapter.join(input, normalizeMutationOptions(options));
}

export function executeListsCanJoin(adapter: ListsAdapter, input: ListsCanJoinInput): ListsCanJoinResult {
  validateListTarget(input, 'lists.canJoin');
  return adapter.canJoin(input);
}

export function executeListsSeparate(
  adapter: ListsAdapter,
  input: ListsSeparateInput,
  options?: MutationOptions,
): ListsSeparateResult {
  validateListTarget(input, 'lists.separate');
  return adapter.separate(input, normalizeMutationOptions(options));
}

export function executeListsSetLevel(
  adapter: ListsAdapter,
  input: ListsSetLevelInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  validateListTarget(input, 'lists.setLevel');
  return adapter.setLevel(input, normalizeMutationOptions(options));
}

export function executeListsSetValue(
  adapter: ListsAdapter,
  input: ListsSetValueInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  validateListTarget(input, 'lists.setValue');
  return adapter.setValue(input, normalizeMutationOptions(options));
}

export function executeListsContinuePrevious(
  adapter: ListsAdapter,
  input: ListsContinuePreviousInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  validateListTarget(input, 'lists.continuePrevious');
  return adapter.continuePrevious(input, normalizeMutationOptions(options));
}

export function executeListsCanContinuePrevious(
  adapter: ListsAdapter,
  input: ListsCanContinuePreviousInput,
): ListsCanContinuePreviousResult {
  validateListTarget(input, 'lists.canContinuePrevious');
  return adapter.canContinuePrevious(input);
}

export function executeListsSetLevelRestart(
  adapter: ListsAdapter,
  input: ListsSetLevelRestartInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  validateListTarget(input, 'lists.setLevelRestart');
  return adapter.setLevelRestart(input, normalizeMutationOptions(options));
}

export function executeListsConvertToText(
  adapter: ListsAdapter,
  input: ListsConvertToTextInput,
  options?: MutationOptions,
): ListsConvertToTextResult {
  validateListTarget(input, 'lists.convertToText');
  return adapter.convertToText(input, normalizeMutationOptions(options));
}

// ---------------------------------------------------------------------------
// Execute wrappers — SD-1973 formatting operations
// ---------------------------------------------------------------------------

export function executeListsApplyTemplate(
  adapter: ListsAdapter,
  input: ListsApplyTemplateInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  validateListTarget(input, 'lists.applyTemplate');
  return adapter.applyTemplate(input, normalizeMutationOptions(options));
}

export function executeListsApplyPreset(
  adapter: ListsAdapter,
  input: ListsApplyPresetInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  validateListTarget(input, 'lists.applyPreset');
  return adapter.applyPreset(input, normalizeMutationOptions(options));
}

export function executeListsCaptureTemplate(
  adapter: ListsAdapter,
  input: ListsCaptureTemplateInput,
): ListsCaptureTemplateResult {
  validateListTarget(input, 'lists.captureTemplate');
  return adapter.captureTemplate(input);
}

export function executeListsSetLevelNumbering(
  adapter: ListsAdapter,
  input: ListsSetLevelNumberingInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  validateListTarget(input, 'lists.setLevelNumbering');
  return adapter.setLevelNumbering(input, normalizeMutationOptions(options));
}

export function executeListsSetLevelBullet(
  adapter: ListsAdapter,
  input: ListsSetLevelBulletInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  validateListTarget(input, 'lists.setLevelBullet');
  return adapter.setLevelBullet(input, normalizeMutationOptions(options));
}

export function executeListsSetLevelPictureBullet(
  adapter: ListsAdapter,
  input: ListsSetLevelPictureBulletInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  validateListTarget(input, 'lists.setLevelPictureBullet');
  return adapter.setLevelPictureBullet(input, normalizeMutationOptions(options));
}

export function executeListsSetLevelAlignment(
  adapter: ListsAdapter,
  input: ListsSetLevelAlignmentInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  validateListTarget(input, 'lists.setLevelAlignment');
  return adapter.setLevelAlignment(input, normalizeMutationOptions(options));
}

export function executeListsSetLevelIndents(
  adapter: ListsAdapter,
  input: ListsSetLevelIndentsInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  validateListTarget(input, 'lists.setLevelIndents');
  return adapter.setLevelIndents(input, normalizeMutationOptions(options));
}

export function executeListsSetLevelTrailingCharacter(
  adapter: ListsAdapter,
  input: ListsSetLevelTrailingCharacterInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  validateListTarget(input, 'lists.setLevelTrailingCharacter');
  return adapter.setLevelTrailingCharacter(input, normalizeMutationOptions(options));
}

export function executeListsSetLevelMarkerFont(
  adapter: ListsAdapter,
  input: ListsSetLevelMarkerFontInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  validateListTarget(input, 'lists.setLevelMarkerFont');
  return adapter.setLevelMarkerFont(input, normalizeMutationOptions(options));
}

export function executeListsClearLevelOverrides(
  adapter: ListsAdapter,
  input: ListsClearLevelOverridesInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  validateListTarget(input, 'lists.clearLevelOverrides');
  return adapter.clearLevelOverrides(input, normalizeMutationOptions(options));
}

export function executeListsSetType(
  adapter: ListsAdapter,
  input: ListsSetTypeInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  validateListTarget(input, 'lists.setType');
  return adapter.setType(input, normalizeMutationOptions(options));
}

// ---------------------------------------------------------------------------
// Execute wrappers — SD-2025 user-facing operations
// ---------------------------------------------------------------------------

export function executeListsGetStyle(adapter: ListsAdapter, input: ListsGetStyleInput): ListsGetStyleResult {
  validateListTarget(input, 'lists.getStyle');
  return adapter.getStyle(input);
}

export function executeListsApplyStyle(
  adapter: ListsAdapter,
  input: ListsApplyStyleInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  validateListTarget(input, 'lists.applyStyle');
  return adapter.applyStyle(input, normalizeMutationOptions(options));
}

export function executeListsRestartAt(
  adapter: ListsAdapter,
  input: ListsRestartAtInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  validateListTarget(input, 'lists.restartAt');
  return adapter.restartAt(input, normalizeMutationOptions(options));
}

export function executeListsSetLevelNumberStyle(
  adapter: ListsAdapter,
  input: ListsSetLevelNumberStyleInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  validateListTarget(input, 'lists.setLevelNumberStyle');
  return adapter.setLevelNumberStyle(input, normalizeMutationOptions(options));
}

export function executeListsSetLevelText(
  adapter: ListsAdapter,
  input: ListsSetLevelTextInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  validateListTarget(input, 'lists.setLevelText');
  return adapter.setLevelText(input, normalizeMutationOptions(options));
}

export function executeListsSetLevelStart(
  adapter: ListsAdapter,
  input: ListsSetLevelStartInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  validateListTarget(input, 'lists.setLevelStart');
  return adapter.setLevelStart(input, normalizeMutationOptions(options));
}

export function executeListsSetLevelLayout(
  adapter: ListsAdapter,
  input: ListsSetLevelLayoutInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  validateListTarget(input, 'lists.setLevelLayout');
  return adapter.setLevelLayout(input, normalizeMutationOptions(options));
}
