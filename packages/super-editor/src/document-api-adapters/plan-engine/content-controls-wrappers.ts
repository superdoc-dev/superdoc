/**
 * Content Controls plan-engine wrappers — bridge the contentControls namespace
 * operations to the underlying ProseMirror editor.
 *
 * Read operations (list, get, selectByTag, etc.) are pure document queries.
 * Mutation operations delegate to editor commands via executeDomainCommand
 * with revision-guard support.
 *
 * All mutations are direct-mode-only (supportsTrackedMode: false).
 *
 * This file is orchestration-only — all shared logic lives in
 * helpers/content-controls/*.ts per the DRY architecture plan.
 */

import { Fragment, type Node as ProseMirrorNode, type Schema } from 'prosemirror-model';
import type { Editor } from '../../core/Editor.js';
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
  ContentControlTarget,
  ContentControlsAdapter,
  ContentControlsCreateAdapter,
  MutationOptions,
  CreateContentControlInput,
} from '@superdoc/document-api';
import { DocumentApiAdapterError } from '../errors.js';
import { executeDomainCommand } from './plan-wrappers.js';
import { clearIndexCache } from '../helpers/index-cache.js';

// Shared helpers — single source of truth for SDT logic
import {
  SDT_BLOCK_NAME,
  isSdtNode,
  findAllSdtNodes,
  resolveSdtByTarget,
  resolveControlType,
  resolveBinding,
  readCheckboxChecked,
  readChoiceListData,
  buildTarget,
  buildContentControlInfoFromNode,
  assertNotSdtLocked,
  assertNotContentLocked,
  assertControlType,
  buildMutationSuccess,
  buildMutationFailure,
  applyPagination,
  applyAttrsUpdate,
  updateSdtPrChild,
  updateSdtPrSubElementAttr,
  removeSdtPrSubElement,
  replaceSdtPrSubElements,
  findSdtPrChild,
  upsertSdtPrChild,
  removeSdtPrChild,
  type SdtPrElement,
} from '../helpers/content-controls/index.js';
import { buildBlockIndex, findBlockByNodeIdOnly } from '../helpers/node-address-resolver.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateSdtId(): string {
  return String(Math.floor(Math.random() * 2147483647));
}

/** Names that are forbidden from patchRawProperties per §10 of the plan. */
const FORBIDDEN_RAW_PATCH_NAMES = new Set([
  'w:sdtContent',
  'w:id',
  'w:sdtPr', // cannot replace the entire sdtPr wholesale
]);

/**
 * Recursively regenerate IDs for all descendant SDT nodes within a cloned tree.
 * The root node's ID is assumed to already be set by the caller.
 */
function reIdDescendantSdts(node: ProseMirrorNode, schema: Schema): ProseMirrorNode {
  if (node.childCount === 0) return node;

  const children: ProseMirrorNode[] = [];
  let changed = false;

  node.forEach((child) => {
    let result = child;
    if (isSdtNode(child)) {
      result = child.type.create({ ...child.attrs, id: generateSdtId() }, child.content, child.marks);
      changed = true;
    }
    const recursed = reIdDescendantSdts(result, schema);
    if (recursed !== result) changed = true;
    children.push(recursed);
  });

  if (!changed) return node;
  return node.copy(Fragment.from(children));
}

// ---------------------------------------------------------------------------
// Mutation execution helper
// ---------------------------------------------------------------------------

/**
 * Execute an SDT mutation with dryRun / changeMode guards.
 *
 * The handler returns `boolean` for simple mutations, or a `ContentControlTarget`
 * when the mutation produces a new identity (copy, move, group.wrap, etc.),
 * which is surfaced as `updatedRef` on the success envelope.
 */
function executeSdtMutation(
  editor: Editor,
  target: ContentControlTarget,
  options: MutationOptions | undefined,
  handler: () => boolean | ContentControlTarget,
): ContentControlMutationResult {
  const mode = options?.changeMode ?? 'direct';
  if (mode !== 'direct') {
    throw new DocumentApiAdapterError(
      'CAPABILITY_UNAVAILABLE',
      `Content control mutations only support changeMode "direct", got "${mode}".`,
      { changeMode: mode },
    );
  }

  if (options?.dryRun) {
    return buildMutationSuccess(target);
  }

  let updatedRef: ContentControlTarget | undefined;

  const receipt = executeDomainCommand(
    editor,
    (): boolean => {
      const result = handler();
      if (typeof result === 'boolean') {
        return result;
      }
      updatedRef = result;
      return true;
    },
    {
      expectedRevision: options?.expectedRevision,
    },
  );

  clearIndexCache(editor);

  if (receipt.steps[0]?.effect !== 'changed') {
    return buildMutationFailure('NO_OP', 'The mutation had no effect.');
  }

  return buildMutationSuccess(target, updatedRef);
}

/**
 * Dispatch a transaction in both UI-attached and headless adapter contexts.
 * Stories and CLI calls can run without a mounted editor view, so fall back to
 * the editor-level dispatch when view dispatch is unavailable.
 */
function dispatchTransaction(editor: Editor, tr: Editor['state']['tr']): void {
  if (editor.view?.dispatch) {
    editor.view.dispatch(tr);
    return;
  }

  if (typeof editor.dispatch === 'function') {
    editor.dispatch(tr);
    return;
  }

  throw new DocumentApiAdapterError(
    'CAPABILITY_UNAVAILABLE',
    'Content-control mutation requires an editor dispatch function.',
  );
}

// ---------------------------------------------------------------------------
// A. Core CRUD + Discovery — Read operations
// ---------------------------------------------------------------------------

function listWrapper(editor: Editor, query?: ContentControlsListQuery): ContentControlsListResult {
  const allSdts = findAllSdtNodes(editor.state.doc);
  let infos = allSdts.map(buildContentControlInfoFromNode);

  if (query?.controlType) {
    infos = infos.filter((info) => info.controlType === query.controlType);
  }
  if (query?.tag) {
    infos = infos.filter((info) => info.properties.tag === query.tag);
  }

  return applyPagination(infos, query);
}

function getWrapper(editor: Editor, input: ContentControlsGetInput): ContentControlInfo {
  const sdt = resolveSdtByTarget(editor.state.doc, input.target);
  return buildContentControlInfoFromNode(sdt);
}

function listInRangeWrapper(editor: Editor, input: ContentControlsListInRangeInput): ContentControlsListResult {
  const doc = editor.state.doc;
  const allSdts = findAllSdtNodes(doc);

  // Resolve block range bounds via the block index (block IDs, not SDT IDs).
  let rangeStart = 0;
  let rangeEnd = doc.content.size;

  if (input.startBlockId || input.endBlockId) {
    const blockIndex = buildBlockIndex(editor);
    if (input.startBlockId) {
      const startBlock = findBlockByNodeIdOnly(blockIndex, input.startBlockId);
      rangeStart = startBlock.pos;
    }
    if (input.endBlockId) {
      const endBlock = findBlockByNodeIdOnly(blockIndex, input.endBlockId);
      rangeEnd = endBlock.end;
    }
  }

  const filtered = allSdts.filter((sdt) => {
    const sdtEnd = sdt.pos + sdt.node.nodeSize;
    return sdt.pos >= rangeStart && sdtEnd <= rangeEnd;
  });

  const infos = filtered.map(buildContentControlInfoFromNode);
  return applyPagination(infos, input);
}

function selectByTagWrapper(editor: Editor, input: ContentControlsSelectByTagInput): ContentControlsListResult {
  const allSdts = findAllSdtNodes(editor.state.doc);
  const infos = allSdts.map(buildContentControlInfoFromNode).filter((info) => info.properties.tag === input.tag);
  return applyPagination(infos, input);
}

function selectByTitleWrapper(editor: Editor, input: ContentControlsSelectByTitleInput): ContentControlsListResult {
  const allSdts = findAllSdtNodes(editor.state.doc);
  const infos = allSdts.map(buildContentControlInfoFromNode).filter((info) => info.properties.alias === input.title);
  return applyPagination(infos, input);
}

function listChildrenWrapper(editor: Editor, input: ContentControlsListChildrenInput): ContentControlsListResult {
  const parent = resolveSdtByTarget(editor.state.doc, input.target);
  const children: { node: typeof parent.node; pos: number; kind: 'block' | 'inline' }[] = [];

  parent.node.forEach((child, offset) => {
    if (isSdtNode(child)) {
      children.push({
        node: child,
        pos: parent.pos + 1 + offset,
        kind: child.type.name === SDT_BLOCK_NAME ? 'block' : 'inline',
      });
    }
  });

  const infos = children.map(buildContentControlInfoFromNode);
  return applyPagination(infos, input);
}

function getParentWrapper(editor: Editor, input: ContentControlsGetParentInput): ContentControlInfo | null {
  const sdt = resolveSdtByTarget(editor.state.doc, input.target);
  const $pos = editor.state.doc.resolve(sdt.pos);

  for (let depth = $pos.depth - 1; depth >= 0; depth--) {
    const ancestor = $pos.node(depth);
    if (isSdtNode(ancestor)) {
      return buildContentControlInfoFromNode({
        node: ancestor,
        pos: $pos.before(depth),
        kind: ancestor.type.name === SDT_BLOCK_NAME ? 'block' : 'inline',
      });
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// A. Core CRUD — Mutation operations
// ---------------------------------------------------------------------------

function wrapWrapper(
  editor: Editor,
  input: ContentControlsWrapInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  // Validate the target exists before mutating.
  resolveSdtByTarget(editor.state.doc, input.target);

  const id = generateSdtId();
  const wrapperTarget: ContentControlTarget = { kind: input.kind, nodeType: 'sdt', nodeId: id };

  return executeSdtMutation(editor, input.target, options, () => {
    const resolved = resolveSdtByTarget(editor.state.doc, input.target);
    const nodeTypeName = input.kind === 'block' ? SDT_BLOCK_NAME : 'structuredContent';
    const nodeType = editor.schema.nodes[nodeTypeName];
    if (!nodeType) return false;

    const wrapperNode = nodeType.create(
      { id, tag: input.tag, alias: input.alias, lockMode: input.lockMode ?? 'unlocked' },
      resolved.node,
    );
    const { tr } = editor.state;
    tr.replaceWith(resolved.pos, resolved.pos + resolved.node.nodeSize, wrapperNode);
    dispatchTransaction(editor, tr);
    return wrapperTarget;
  });
}

function unwrapWrapper(
  editor: Editor,
  input: ContentControlsUnwrapInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  const sdt = resolveSdtByTarget(editor.state.doc, input.target);
  assertNotSdtLocked(sdt, 'unwrap');
  const target = buildTarget(sdt);

  return executeSdtMutation(editor, target, options, () => {
    const resolved = resolveSdtByTarget(editor.state.doc, input.target);
    const { tr } = editor.state;
    tr.replaceWith(resolved.pos, resolved.pos + resolved.node.nodeSize, resolved.node.content);
    dispatchTransaction(editor, tr);
    return true;
  });
}

function deleteWrapper(
  editor: Editor,
  input: ContentControlsDeleteInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  const sdt = resolveSdtByTarget(editor.state.doc, input.target);
  assertNotSdtLocked(sdt, 'delete');
  const target = buildTarget(sdt);

  const deleteCmd = editor.commands?.deleteStructuredContentById;
  if (typeof deleteCmd !== 'function') {
    throw new DocumentApiAdapterError('CAPABILITY_UNAVAILABLE', 'deleteStructuredContentById command not available.');
  }

  return executeSdtMutation(editor, target, options, () => {
    return Boolean(deleteCmd(input.target.nodeId));
  });
}

function copyWrapper(
  editor: Editor,
  input: ContentControlsCopyInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  resolveSdtByTarget(editor.state.doc, input.target);
  const target = input.target;

  return executeSdtMutation(editor, target, options, () => {
    const source = resolveSdtByTarget(editor.state.doc, input.target);
    const dest = resolveSdtByTarget(editor.state.doc, input.destination);
    const newId = generateSdtId();
    const cloned = reIdDescendantSdts(
      source.node.type.create({ ...source.node.attrs, id: newId }, source.node.content, source.node.marks),
      editor.schema,
    );
    const { tr } = editor.state;
    const insertPos = dest.pos + dest.node.nodeSize;
    tr.insert(insertPos, cloned);
    dispatchTransaction(editor, tr);
    return { kind: source.kind, nodeType: 'sdt' as const, nodeId: newId };
  });
}

function moveWrapper(
  editor: Editor,
  input: ContentControlsMoveInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  const sdt = resolveSdtByTarget(editor.state.doc, input.target);
  assertNotSdtLocked(sdt, 'move');
  const target = buildTarget(sdt);

  return executeSdtMutation(editor, target, options, () => {
    const source = resolveSdtByTarget(editor.state.doc, input.target);
    const { tr } = editor.state;
    tr.delete(source.pos, source.pos + source.node.nodeSize);
    const destAfterDelete = resolveSdtByTarget(tr.doc, input.destination);
    const insertPos = destAfterDelete.pos + destAfterDelete.node.nodeSize;
    tr.insert(insertPos, source.node);
    dispatchTransaction(editor, tr);
    return true;
  });
}

function patchWrapper(
  editor: Editor,
  input: ContentControlsPatchInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  const sdt = resolveSdtByTarget(editor.state.doc, input.target);
  assertNotSdtLocked(sdt, 'patch');
  const target = buildTarget(sdt);

  const patchFields: Record<string, unknown> = {};
  if (input.alias !== undefined) patchFields.alias = input.alias;
  if (input.tag !== undefined) patchFields.tag = input.tag;
  if (input.appearance !== undefined) patchFields.appearance = input.appearance;
  if (input.color !== undefined) patchFields.color = input.color;
  if (input.placeholder !== undefined) patchFields.placeholder = input.placeholder;
  if (input.showingPlaceholder !== undefined) patchFields.showingPlaceholder = input.showingPlaceholder;
  if (input.temporary !== undefined) patchFields.temporary = input.temporary;
  if (input.tabIndex !== undefined) patchFields.tabIndex = input.tabIndex;

  return executeSdtMutation(editor, target, options, () => {
    return applyAttrsUpdate(editor, input.target.nodeId, patchFields);
  });
}

function setLockModeWrapper(
  editor: Editor,
  input: ContentControlsSetLockModeInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  const sdt = resolveSdtByTarget(editor.state.doc, input.target);
  const target = buildTarget(sdt);

  return executeSdtMutation(editor, target, options, () => {
    return applyAttrsUpdate(editor, input.target.nodeId, { lockMode: input.lockMode });
  });
}

/** Maps control types to their sdtPr element name. Types not listed have no element. */
const CONTROL_TYPE_SDT_PR_ELEMENTS: Record<string, string> = {
  text: 'w:text',
  date: 'w:date',
  checkbox: 'w14:checkbox',
  comboBox: 'w:comboBox',
  dropDownList: 'w:dropDownList',
  repeatingSection: 'w15:repeatingSection',
  repeatingSectionItem: 'w15:repeatingSectionItem',
  group: 'w:group',
};

function setTypeWrapper(
  editor: Editor,
  input: ContentControlsSetTypeInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  const sdt = resolveSdtByTarget(editor.state.doc, input.target);
  assertNotSdtLocked(sdt, 'setType');
  const currentType = resolveControlType(sdt.node.attrs as Record<string, unknown>);

  if (currentType === input.controlType) {
    return buildMutationFailure('NO_OP', `Control type is already "${currentType}".`);
  }

  const target = buildTarget(sdt);

  return executeSdtMutation(editor, target, options, () => {
    // Remove the old type-specific element from sdtPr (if any)
    const oldElementName = CONTROL_TYPE_SDT_PR_ELEMENTS[currentType];
    if (oldElementName) {
      updateSdtPrChild(editor, input.target, oldElementName, () => null);
    }

    // Add the new type-specific element to sdtPr (if applicable)
    const newElementName = CONTROL_TYPE_SDT_PR_ELEMENTS[input.controlType];
    if (newElementName) {
      updateSdtPrChild(
        editor,
        input.target,
        newElementName,
        (existing) => existing ?? { name: newElementName, type: 'element' },
      );
    }

    return applyAttrsUpdate(editor, input.target.nodeId, {
      controlType: input.controlType,
      type: input.controlType,
    });
  });
}

// ---------------------------------------------------------------------------
// Content IO operations
// ---------------------------------------------------------------------------

function getContentWrapper(editor: Editor, input: ContentControlsGetContentInput): ContentControlsGetContentResult {
  const sdt = resolveSdtByTarget(editor.state.doc, input.target);
  return { content: sdt.node.textContent, format: 'text' };
}

function replaceContentWrapper(
  editor: Editor,
  input: ContentControlsReplaceContentInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  const sdt = resolveSdtByTarget(editor.state.doc, input.target);
  assertNotContentLocked(sdt, 'replaceContent');
  const target = buildTarget(sdt);

  return executeSdtMutation(editor, target, options, () => {
    return Boolean(editor.commands?.updateStructuredContentById?.(input.target.nodeId, { text: input.content }));
  });
}

function clearContentWrapper(
  editor: Editor,
  input: ContentControlsClearContentInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  const sdt = resolveSdtByTarget(editor.state.doc, input.target);
  assertNotContentLocked(sdt, 'clearContent');
  const target = buildTarget(sdt);

  return executeSdtMutation(editor, target, options, () => {
    return Boolean(editor.commands?.updateStructuredContentById?.(input.target.nodeId, { text: '' }));
  });
}

function appendContentWrapper(
  editor: Editor,
  input: ContentControlsAppendContentInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  const sdt = resolveSdtByTarget(editor.state.doc, input.target);
  assertNotContentLocked(sdt, 'appendContent');
  const target = buildTarget(sdt);

  return executeSdtMutation(editor, target, options, () => {
    const resolved = resolveSdtByTarget(editor.state.doc, input.target);
    const currentText = resolved.node.textContent;
    return Boolean(
      editor.commands?.updateStructuredContentById?.(input.target.nodeId, { text: currentText + input.content }),
    );
  });
}

function prependContentWrapper(
  editor: Editor,
  input: ContentControlsPrependContentInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  const sdt = resolveSdtByTarget(editor.state.doc, input.target);
  assertNotContentLocked(sdt, 'prependContent');
  const target = buildTarget(sdt);

  return executeSdtMutation(editor, target, options, () => {
    const resolved = resolveSdtByTarget(editor.state.doc, input.target);
    const currentText = resolved.node.textContent;
    return Boolean(
      editor.commands?.updateStructuredContentById?.(input.target.nodeId, { text: input.content + currentText }),
    );
  });
}

function insertBeforeWrapper(
  editor: Editor,
  input: ContentControlsInsertBeforeInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  const sdt = resolveSdtByTarget(editor.state.doc, input.target);
  const target = buildTarget(sdt);

  return executeSdtMutation(editor, target, options, () => {
    const resolved = resolveSdtByTarget(editor.state.doc, input.target);
    const textNode = editor.schema.text(input.content);
    const { tr } = editor.state;
    tr.insert(resolved.pos, textNode);
    dispatchTransaction(editor, tr);
    return true;
  });
}

function insertAfterWrapper(
  editor: Editor,
  input: ContentControlsInsertAfterInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  const sdt = resolveSdtByTarget(editor.state.doc, input.target);
  const target = buildTarget(sdt);

  return executeSdtMutation(editor, target, options, () => {
    const resolved = resolveSdtByTarget(editor.state.doc, input.target);
    const insertPos = resolved.pos + resolved.node.nodeSize;
    const textNode = editor.schema.text(input.content);
    const { tr } = editor.state;
    tr.insert(insertPos, textNode);
    dispatchTransaction(editor, tr);
    return true;
  });
}

// ---------------------------------------------------------------------------
// B. Data Binding + Raw/Compatibility
// ---------------------------------------------------------------------------

function getBindingWrapper(editor: Editor, input: ContentControlsGetBindingInput): ContentControlBinding | null {
  const sdt = resolveSdtByTarget(editor.state.doc, input.target);
  return resolveBinding(sdt.node.attrs as Record<string, unknown>) ?? null;
}

function setBindingWrapper(
  editor: Editor,
  input: ContentControlsSetBindingInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  const sdt = resolveSdtByTarget(editor.state.doc, input.target);
  assertNotSdtLocked(sdt, 'setBinding');
  const target = buildTarget(sdt);

  return executeSdtMutation(editor, target, options, () => {
    const bindingAttrs: Record<string, string> = {
      'w:storeItemID': input.storeItemId,
      'w:xpath': input.xpath,
    };
    if (input.prefixMappings) bindingAttrs['w:prefixMappings'] = input.prefixMappings;

    return updateSdtPrChild(editor, input.target, 'w:dataBinding', () => ({
      name: 'w:dataBinding',
      type: 'element',
      attributes: bindingAttrs,
    }));
  });
}

function clearBindingWrapper(
  editor: Editor,
  input: ContentControlsClearBindingInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  const sdt = resolveSdtByTarget(editor.state.doc, input.target);
  assertNotSdtLocked(sdt, 'clearBinding');
  const target = buildTarget(sdt);

  return executeSdtMutation(editor, target, options, () => {
    return updateSdtPrChild(editor, input.target, 'w:dataBinding', () => null);
  });
}

function getRawPropertiesWrapper(
  editor: Editor,
  input: ContentControlsGetRawPropertiesInput,
): ContentControlsGetRawPropertiesResult {
  const sdt = resolveSdtByTarget(editor.state.doc, input.target);
  const sdtPr = sdt.node.attrs.sdtPr;
  const properties = typeof sdtPr === 'object' && sdtPr !== null ? ({ ...sdtPr } as Record<string, unknown>) : {};
  return { properties };
}

function patchRawPropertiesWrapper(
  editor: Editor,
  input: ContentControlsPatchRawPropertiesInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  const sdt = resolveSdtByTarget(editor.state.doc, input.target);
  const target = buildTarget(sdt);

  // Validate forbidden mutations per §10 of the plan
  const seenNames = new Set<string>();
  for (const patch of input.patches) {
    if (seenNames.has(patch.name)) {
      throw new DocumentApiAdapterError(
        'INVALID_INPUT',
        `Duplicate patch name "${patch.name}" in the same patch array.`,
      );
    }
    seenNames.add(patch.name);

    if (FORBIDDEN_RAW_PATCH_NAMES.has(patch.name)) {
      throw new DocumentApiAdapterError(
        'INVALID_INPUT',
        `Patching "${patch.name}" is not allowed via patchRawProperties.`,
        { name: patch.name },
      );
    }

    if (patch.name.startsWith('r:')) {
      throw new DocumentApiAdapterError(
        'INVALID_INPUT',
        `Injecting relationship references ("${patch.name}") is not allowed.`,
        { name: patch.name },
      );
    }

    if (patch.name.startsWith('cp:') || patch.name === 'Types' || patch.name === '[Content_Types]') {
      throw new DocumentApiAdapterError(
        'INVALID_INPUT',
        `Injecting package-level elements ("${patch.name}") is not allowed.`,
        { name: patch.name },
      );
    }
  }

  return executeSdtMutation(editor, target, options, () => {
    const resolved = resolveSdtByTarget(editor.state.doc, input.target);
    let currentSdtPr = (resolved.node.attrs.sdtPr ?? { name: 'w:sdtPr', elements: [] }) as SdtPrElement;

    for (const patch of input.patches) {
      switch (patch.op) {
        case 'set': {
          const el = patch.element as SdtPrElement;
          // Normalize to a well-formed XML element: ensure name matches patch.name and type is 'element'.
          const normalized: SdtPrElement = { ...el, name: patch.name, type: el.type ?? 'element' };
          currentSdtPr = upsertSdtPrChild(currentSdtPr, patch.name, normalized);
          break;
        }
        case 'remove':
          currentSdtPr = removeSdtPrChild(currentSdtPr, patch.name);
          break;
        case 'setAttr': {
          const existing = findSdtPrChild(currentSdtPr, patch.name);
          if (!existing) {
            throw new DocumentApiAdapterError('INVALID_TARGET', `Element "${patch.name}" does not exist in sdtPr.`);
          }
          currentSdtPr = upsertSdtPrChild(currentSdtPr, patch.name, {
            ...existing,
            attributes: { ...(existing.attributes ?? {}), [patch.attr]: patch.value },
          });
          break;
        }
        case 'removeAttr': {
          const existingEl = findSdtPrChild(currentSdtPr, patch.name);
          if (!existingEl) {
            throw new DocumentApiAdapterError('INVALID_TARGET', `Element "${patch.name}" does not exist in sdtPr.`);
          }
          const attrs = { ...(existingEl.attributes ?? {}) };
          delete attrs[patch.attr];
          currentSdtPr = upsertSdtPrChild(currentSdtPr, patch.name, { ...existingEl, attributes: attrs });
          break;
        }
      }
    }

    return applyAttrsUpdate(editor, input.target.nodeId, { sdtPr: currentSdtPr });
  });
}

function validateWordCompatibilityWrapper(
  editor: Editor,
  input: ContentControlsValidateWordCompatibilityInput,
): ContentControlsValidateWordCompatibilityResult {
  const sdt = resolveSdtByTarget(editor.state.doc, input.target);
  const attrs = sdt.node.attrs as Record<string, unknown>;
  const diagnostics: ContentControlsValidateWordCompatibilityResult['diagnostics'] = [];
  const id = String(attrs.id ?? '');

  if (!/^-?\d+$/.test(id)) {
    diagnostics.push({
      code: 'INVALID_ID_FORMAT',
      severity: 'error',
      message: `Content control id "${id}" is not a valid signed 32-bit integer.`,
    });
  }

  return { compatible: diagnostics.length === 0, diagnostics };
}

function normalizeWordCompatibilityWrapper(
  editor: Editor,
  input: ContentControlsNormalizeWordCompatibilityInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  const sdt = resolveSdtByTarget(editor.state.doc, input.target);
  const target = buildTarget(sdt);
  const id = String(sdt.node.attrs.id ?? '');

  if (/^-?\d+$/.test(id)) {
    return buildMutationFailure('NO_OP', 'Content control ID is already Word-compatible.');
  }

  return executeSdtMutation(editor, target, options, () => {
    const newId = generateSdtId();
    return applyAttrsUpdate(editor, input.target.nodeId, { id: newId });
  });
}

function normalizeTagPayloadWrapper(
  editor: Editor,
  input: ContentControlsNormalizeTagPayloadInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  const sdt = resolveSdtByTarget(editor.state.doc, input.target);
  const target = buildTarget(sdt);
  const tag = sdt.node.attrs.tag as string | undefined;

  if (tag) {
    try {
      JSON.parse(tag);
      return buildMutationFailure('NO_OP', 'Tag payload is already valid JSON.');
    } catch {
      // Not JSON — will normalize
    }
  }

  return executeSdtMutation(editor, target, options, () => {
    const resolved = resolveSdtByTarget(editor.state.doc, input.target);
    const currentTag = resolved.node.attrs.tag ?? '';
    return applyAttrsUpdate(editor, input.target.nodeId, { tag: JSON.stringify({ value: currentTag }) });
  });
}

// ---------------------------------------------------------------------------
// C. Typed Controls — Text
// ---------------------------------------------------------------------------

function textSetMultilineWrapper(
  editor: Editor,
  input: ContentControlsTextSetMultilineInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  const sdt = resolveSdtByTarget(editor.state.doc, input.target);
  assertControlType(sdt, 'text', 'text.setMultiline');
  assertNotSdtLocked(sdt, 'text.setMultiline');
  const target = buildTarget(sdt);

  return executeSdtMutation(editor, target, options, () => {
    return updateSdtPrChild(editor, input.target, 'w:text', (existing) => ({
      name: 'w:text',
      type: 'element',
      ...existing,
      attributes: { ...(existing?.attributes ?? {}), 'w:multiLine': input.multiline ? '1' : '0' },
    }));
  });
}

function textSetValueWrapper(
  editor: Editor,
  input: ContentControlsTextSetValueInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  const sdt = resolveSdtByTarget(editor.state.doc, input.target);
  assertControlType(sdt, 'text', 'text.setValue');
  assertNotContentLocked(sdt, 'text.setValue');
  const target = buildTarget(sdt);

  return executeSdtMutation(editor, target, options, () => {
    return Boolean(editor.commands?.updateStructuredContentById?.(input.target.nodeId, { text: input.value }));
  });
}

function textClearValueWrapper(
  editor: Editor,
  input: ContentControlsTextClearValueInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  const sdt = resolveSdtByTarget(editor.state.doc, input.target);
  assertControlType(sdt, 'text', 'text.clearValue');
  assertNotContentLocked(sdt, 'text.clearValue');
  const target = buildTarget(sdt);

  return executeSdtMutation(editor, target, options, () => {
    return Boolean(editor.commands?.updateStructuredContentById?.(input.target.nodeId, { text: '' }));
  });
}

// ---------------------------------------------------------------------------
// C. Typed Controls — Date
// ---------------------------------------------------------------------------

/** Set a sub-element with w:val attribute inside the w:date element. */
function updateDateSubElement(
  editor: Editor,
  target: ContentControlTarget,
  subName: string,
  value: string,
  operation: string,
  options?: MutationOptions,
): ContentControlMutationResult {
  const sdt = resolveSdtByTarget(editor.state.doc, target);
  assertControlType(sdt, 'date', operation);
  assertNotSdtLocked(sdt, operation);
  const resolvedTarget = buildTarget(sdt);

  return executeSdtMutation(editor, resolvedTarget, options, () => {
    return updateSdtPrSubElementAttr(editor, target, 'w:date', subName, 'w:val', value);
  });
}

function dateSetValueWrapper(
  editor: Editor,
  input: ContentControlsDateSetValueInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  const sdt = resolveSdtByTarget(editor.state.doc, input.target);
  assertControlType(sdt, 'date', 'date.setValue');
  assertNotSdtLocked(sdt, 'date.setValue');
  const target = buildTarget(sdt);

  // w:fullDate is an attribute on w:date itself, not a sub-element
  return executeSdtMutation(editor, target, options, () => {
    return updateSdtPrChild(editor, input.target, 'w:date', (existing) => ({
      name: 'w:date',
      type: 'element',
      ...existing,
      attributes: { ...(existing?.attributes ?? {}), 'w:fullDate': input.value },
    }));
  });
}

function dateClearValueWrapper(
  editor: Editor,
  input: ContentControlsDateClearValueInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  const sdt = resolveSdtByTarget(editor.state.doc, input.target);
  assertControlType(sdt, 'date', 'date.clearValue');
  assertNotSdtLocked(sdt, 'date.clearValue');
  const target = buildTarget(sdt);

  return executeSdtMutation(editor, target, options, () => {
    return updateSdtPrChild(editor, input.target, 'w:date', (existing) => {
      if (!existing) return null;
      const attrs = { ...(existing.attributes ?? {}) } as Record<string, unknown>;
      delete attrs['w:fullDate'];
      return { ...existing, attributes: attrs };
    });
  });
}

function dateSetDisplayFormatWrapper(
  editor: Editor,
  input: ContentControlsDateSetDisplayFormatInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  return updateDateSubElement(editor, input.target, 'w:dateFormat', input.format, 'date.setDisplayFormat', options);
}

function dateSetDisplayLocaleWrapper(
  editor: Editor,
  input: ContentControlsDateSetDisplayLocaleInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  return updateDateSubElement(editor, input.target, 'w:lid', input.locale, 'date.setDisplayLocale', options);
}

function dateSetStorageFormatWrapper(
  editor: Editor,
  input: ContentControlsDateSetStorageFormatInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  return updateDateSubElement(
    editor,
    input.target,
    'w:storeMappedDataAs',
    input.format,
    'date.setStorageFormat',
    options,
  );
}

function dateSetCalendarWrapper(
  editor: Editor,
  input: ContentControlsDateSetCalendarInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  return updateDateSubElement(editor, input.target, 'w:calendar', input.calendar, 'date.setCalendar', options);
}

// ---------------------------------------------------------------------------
// C. Typed Controls — Checkbox
// ---------------------------------------------------------------------------

function checkboxGetStateWrapper(
  editor: Editor,
  input: ContentControlsCheckboxGetStateInput,
): ContentControlsCheckboxGetStateResult {
  const sdt = resolveSdtByTarget(editor.state.doc, input.target);
  assertControlType(sdt, 'checkbox', 'checkbox.getState');
  const sdtPr = sdt.node.attrs.sdtPr as SdtPrElement | undefined;
  return { checked: readCheckboxChecked(sdtPr) };
}

function checkboxSetStateWrapper(
  editor: Editor,
  input: ContentControlsCheckboxSetStateInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  const sdt = resolveSdtByTarget(editor.state.doc, input.target);
  assertControlType(sdt, 'checkbox', 'checkbox.setState');
  assertNotSdtLocked(sdt, 'checkbox.setState');
  const target = buildTarget(sdt);

  return executeSdtMutation(editor, target, options, () => {
    return updateSdtPrSubElementAttr(
      editor,
      input.target,
      'w14:checkbox',
      'w14:checked',
      'w14:val',
      input.checked ? '1' : '0',
    );
  });
}

function checkboxToggleWrapper(
  editor: Editor,
  input: ContentControlsCheckboxToggleInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  const currentState = checkboxGetStateWrapper(editor, input);
  return checkboxSetStateWrapper(editor, { target: input.target, checked: !currentState.checked }, options);
}

function checkboxSetSymbolPairWrapper(
  editor: Editor,
  input: ContentControlsCheckboxSetSymbolPairInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  const sdt = resolveSdtByTarget(editor.state.doc, input.target);
  assertControlType(sdt, 'checkbox', 'checkbox.setSymbolPair');
  assertNotSdtLocked(sdt, 'checkbox.setSymbolPair');
  const target = buildTarget(sdt);

  return executeSdtMutation(editor, target, options, () => {
    return updateSdtPrChild(editor, input.target, 'w14:checkbox', (existing) => {
      const el: SdtPrElement = existing ?? { name: 'w14:checkbox', type: 'element', elements: [] };
      const elements = (el.elements ?? []).filter(
        (e) => e.name !== 'w14:checkedState' && e.name !== 'w14:uncheckedState',
      );
      elements.push({
        name: 'w14:checkedState',
        type: 'element',
        attributes: { 'w14:font': input.checkedSymbol.font, 'w14:val': input.checkedSymbol.char },
      });
      elements.push({
        name: 'w14:uncheckedState',
        type: 'element',
        attributes: { 'w14:font': input.uncheckedSymbol.font, 'w14:val': input.uncheckedSymbol.char },
      });
      return { ...el, elements };
    });
  });
}

// ---------------------------------------------------------------------------
// C. Typed Controls — Choice List
// ---------------------------------------------------------------------------

function choiceListGetItemsWrapper(
  editor: Editor,
  input: ContentControlsChoiceListGetItemsInput,
): ContentControlsChoiceListGetItemsResult {
  const sdt = resolveSdtByTarget(editor.state.doc, input.target);
  assertControlType(sdt, ['comboBox', 'dropDownList'], 'choiceList.getItems');
  const sdtPr = sdt.node.attrs.sdtPr as SdtPrElement | undefined;
  const controlType = resolveControlType(sdt.node.attrs as Record<string, unknown>) as 'comboBox' | 'dropDownList';
  return readChoiceListData(sdtPr, controlType);
}

function choiceListSetItemsWrapper(
  editor: Editor,
  input: ContentControlsChoiceListSetItemsInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  const sdt = resolveSdtByTarget(editor.state.doc, input.target);
  assertControlType(sdt, ['comboBox', 'dropDownList'], 'choiceList.setItems');
  assertNotSdtLocked(sdt, 'choiceList.setItems');
  const target = buildTarget(sdt);
  const ct = resolveControlType(sdt.node.attrs as Record<string, unknown>);

  return executeSdtMutation(editor, target, options, () => {
    const childName = `w:${ct}`;
    const itemElements: SdtPrElement[] = input.items.map((item) => ({
      name: 'w:listItem',
      type: 'element',
      attributes: { 'w:displayText': item.displayText, 'w:value': item.value },
    }));
    return replaceSdtPrSubElements(editor, input.target, childName, itemElements);
  });
}

function choiceListSetSelectedWrapper(
  editor: Editor,
  input: ContentControlsChoiceListSetSelectedInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  const sdt = resolveSdtByTarget(editor.state.doc, input.target);
  assertControlType(sdt, ['comboBox', 'dropDownList'], 'choiceList.setSelected');
  assertNotSdtLocked(sdt, 'choiceList.setSelected');
  const target = buildTarget(sdt);
  const ct = resolveControlType(sdt.node.attrs as Record<string, unknown>);

  return executeSdtMutation(editor, target, options, () => {
    return updateSdtPrChild(editor, input.target, `w:${ct}`, (existing) => ({
      name: `w:${ct}`,
      type: 'element',
      ...existing,
      attributes: { ...(existing?.attributes ?? {}), 'w:lastValue': input.value },
    }));
  });
}

// ---------------------------------------------------------------------------
// D. Repeating Section
// ---------------------------------------------------------------------------

function getRepeatingSectionItems(sdt: {
  node: import('prosemirror-model').Node;
  pos: number;
}): Array<{ node: import('prosemirror-model').Node; pos: number; kind: 'block' | 'inline' }> {
  const items: Array<{ node: import('prosemirror-model').Node; pos: number; kind: 'block' | 'inline' }> = [];
  sdt.node.forEach((child, offset) => {
    if (isSdtNode(child)) {
      const ct = resolveControlType(child.attrs as Record<string, unknown>);
      if (ct === 'repeatingSectionItem') {
        items.push({
          node: child,
          pos: sdt.pos + 1 + offset,
          kind: child.type.name === SDT_BLOCK_NAME ? 'block' : 'inline',
        });
      }
    }
  });
  return items;
}

function repeatingSectionListItemsWrapper(
  editor: Editor,
  input: ContentControlsRepeatingSectionListItemsInput,
): ContentControlsRepeatingSectionListItemsResult {
  const sdt = resolveSdtByTarget(editor.state.doc, input.target);
  assertControlType(sdt, 'repeatingSection', 'repeatingSection.listItems');
  const items = getRepeatingSectionItems(sdt);
  const infos = items.map(buildContentControlInfoFromNode);
  return { items: infos, total: infos.length };
}

function repeatingSectionInsertItemBeforeWrapper(
  editor: Editor,
  input: ContentControlsRepeatingSectionInsertItemBeforeInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  const sdt = resolveSdtByTarget(editor.state.doc, input.target);
  assertControlType(sdt, 'repeatingSection', 'repeatingSection.insertItemBefore');
  assertNotContentLocked(sdt, 'repeatingSection.insertItemBefore');
  const target = buildTarget(sdt);

  return executeSdtMutation(editor, target, options, () => {
    const resolved = resolveSdtByTarget(editor.state.doc, input.target);
    const items = getRepeatingSectionItems(resolved);
    if (input.index < 0 || input.index > items.length) {
      throw new DocumentApiAdapterError('INVALID_INPUT', `Index ${input.index} out of range [0, ${items.length}].`);
    }
    const insertPos = input.index < items.length ? items[input.index].pos : resolved.pos + resolved.node.nodeSize - 1;
    const nodeType = editor.schema.nodes[SDT_BLOCK_NAME];
    const paragraph = editor.schema.nodes.paragraph.create();
    const newItem = nodeType.create(
      { id: generateSdtId(), controlType: 'repeatingSectionItem', type: 'repeatingSectionItem' },
      paragraph,
    );
    const { tr } = editor.state;
    tr.insert(insertPos, newItem);
    dispatchTransaction(editor, tr);
    return true;
  });
}

function repeatingSectionInsertItemAfterWrapper(
  editor: Editor,
  input: ContentControlsRepeatingSectionInsertItemAfterInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  const sdt = resolveSdtByTarget(editor.state.doc, input.target);
  assertControlType(sdt, 'repeatingSection', 'repeatingSection.insertItemAfter');
  assertNotContentLocked(sdt, 'repeatingSection.insertItemAfter');
  const target = buildTarget(sdt);

  return executeSdtMutation(editor, target, options, () => {
    const resolved = resolveSdtByTarget(editor.state.doc, input.target);
    const items = getRepeatingSectionItems(resolved);
    if (input.index < 0 || input.index >= items.length) {
      throw new DocumentApiAdapterError('INVALID_INPUT', `Index ${input.index} out of range [0, ${items.length - 1}].`);
    }
    const afterItem = items[input.index];
    const insertPos = afterItem.pos + afterItem.node.nodeSize;
    const nodeType = editor.schema.nodes[SDT_BLOCK_NAME];
    const paragraph = editor.schema.nodes.paragraph.create();
    const newItem = nodeType.create(
      { id: generateSdtId(), controlType: 'repeatingSectionItem', type: 'repeatingSectionItem' },
      paragraph,
    );
    const { tr } = editor.state;
    tr.insert(insertPos, newItem);
    dispatchTransaction(editor, tr);
    return true;
  });
}

function repeatingSectionCloneItemWrapper(
  editor: Editor,
  input: ContentControlsRepeatingSectionCloneItemInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  const sdt = resolveSdtByTarget(editor.state.doc, input.target);
  assertControlType(sdt, 'repeatingSection', 'repeatingSection.cloneItem');
  assertNotContentLocked(sdt, 'repeatingSection.cloneItem');
  const target = buildTarget(sdt);

  return executeSdtMutation(editor, target, options, () => {
    const resolved = resolveSdtByTarget(editor.state.doc, input.target);
    const items = getRepeatingSectionItems(resolved);
    if (input.index < 0 || input.index >= items.length) {
      throw new DocumentApiAdapterError('INVALID_INPUT', `Index ${input.index} out of range [0, ${items.length - 1}].`);
    }
    const sourceItem = items[input.index];
    const cloned = reIdDescendantSdts(
      sourceItem.node.type.create(
        { ...sourceItem.node.attrs, id: generateSdtId() },
        sourceItem.node.content,
        sourceItem.node.marks,
      ),
      editor.schema,
    );
    const insertPos = sourceItem.pos + sourceItem.node.nodeSize;
    const { tr } = editor.state;
    tr.insert(insertPos, cloned);
    dispatchTransaction(editor, tr);
    return true;
  });
}

function repeatingSectionDeleteItemWrapper(
  editor: Editor,
  input: ContentControlsRepeatingSectionDeleteItemInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  const sdt = resolveSdtByTarget(editor.state.doc, input.target);
  assertControlType(sdt, 'repeatingSection', 'repeatingSection.deleteItem');
  assertNotContentLocked(sdt, 'repeatingSection.deleteItem');
  const target = buildTarget(sdt);

  return executeSdtMutation(editor, target, options, () => {
    const resolved = resolveSdtByTarget(editor.state.doc, input.target);
    const items = getRepeatingSectionItems(resolved);
    if (input.index < 0 || input.index >= items.length) {
      throw new DocumentApiAdapterError('INVALID_INPUT', `Index ${input.index} out of range [0, ${items.length - 1}].`);
    }
    const item = items[input.index];
    const { tr } = editor.state;
    tr.delete(item.pos, item.pos + item.node.nodeSize);
    dispatchTransaction(editor, tr);
    return true;
  });
}

function repeatingSectionSetAllowInsertDeleteWrapper(
  editor: Editor,
  input: ContentControlsRepeatingSectionSetAllowInsertDeleteInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  const sdt = resolveSdtByTarget(editor.state.doc, input.target);
  assertControlType(sdt, 'repeatingSection', 'repeatingSection.setAllowInsertDelete');
  assertNotSdtLocked(sdt, 'repeatingSection.setAllowInsertDelete');
  const target = buildTarget(sdt);

  return executeSdtMutation(editor, target, options, () => {
    return updateSdtPrSubElementAttr(
      editor,
      input.target,
      'w15:repeatingSection',
      'w15:allowInsertDeleteSection',
      'w15:val',
      input.allow ? '1' : '0',
    );
  });
}

// ---------------------------------------------------------------------------
// D. Group
// ---------------------------------------------------------------------------

function groupWrapWrapper(
  editor: Editor,
  input: ContentControlsGroupWrapInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  resolveSdtByTarget(editor.state.doc, input.target);
  const target = input.target;

  return executeSdtMutation(editor, target, options, () => {
    const resolved = resolveSdtByTarget(editor.state.doc, input.target);
    const groupNodeType = editor.schema.nodes[SDT_BLOCK_NAME];
    if (!groupNodeType) return false;

    const groupId = generateSdtId();
    const groupNode = groupNodeType.create({ id: groupId, controlType: 'group', type: 'group' }, resolved.node);

    const { tr } = editor.state;
    tr.replaceWith(resolved.pos, resolved.pos + resolved.node.nodeSize, groupNode);
    dispatchTransaction(editor, tr);
    return { kind: 'block' as const, nodeType: 'sdt' as const, nodeId: groupId };
  });
}

function groupUngroupWrapper(
  editor: Editor,
  input: ContentControlsGroupUngroupInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  const sdt = resolveSdtByTarget(editor.state.doc, input.target);
  assertControlType(sdt, 'group', 'group.ungroup');
  assertNotSdtLocked(sdt, 'group.ungroup');
  const target = buildTarget(sdt);

  return executeSdtMutation(editor, target, options, () => {
    const resolved = resolveSdtByTarget(editor.state.doc, input.target);
    const { tr } = editor.state;
    tr.replaceWith(resolved.pos, resolved.pos + resolved.node.nodeSize, resolved.node.content);
    dispatchTransaction(editor, tr);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Create content control (create.* namespace)
// ---------------------------------------------------------------------------

function createWrapper(
  editor: Editor,
  input: CreateContentControlInput,
  options?: MutationOptions,
): ContentControlMutationResult {
  const commandName = input.kind === 'block' ? 'insertStructuredContentBlock' : 'insertStructuredContentInline';
  const insertCmd = editor.commands?.[commandName];
  if (typeof insertCmd !== 'function') {
    throw new DocumentApiAdapterError('CAPABILITY_UNAVAILABLE', `${commandName} command not available.`);
  }

  const id = generateSdtId();
  const target: ContentControlTarget = { kind: input.kind, nodeType: 'sdt', nodeId: id };

  // When a reference target is provided, validate it before mutating.
  if (input.target) {
    resolveSdtByTarget(editor.state.doc, input.target);
  }

  return executeSdtMutation(editor, target, options, () => {
    const attrs: Record<string, unknown> = {
      id,
      tag: input.tag,
      alias: input.alias,
      lockMode: input.lockMode ?? 'unlocked',
      controlType: input.controlType ?? 'unknown',
      type: input.controlType ?? 'unknown',
    };

    // When a target is provided, insert adjacent to it for deterministic placement.
    if (input.target) {
      const ref = resolveSdtByTarget(editor.state.doc, input.target);
      const nodeTypeName = input.kind === 'block' ? SDT_BLOCK_NAME : 'structuredContent';
      const nodeType = editor.schema.nodes[nodeTypeName];
      if (!nodeType) return false;

      let content;
      if (input.content) {
        content = editor.schema.text(input.content);
        if (input.kind === 'block') {
          content = editor.schema.nodes.paragraph.create(null, content);
        }
      } else if (input.kind === 'block') {
        content = editor.schema.nodes.paragraph.create();
      }

      const newNode = content ? nodeType.create(attrs, content) : nodeType.create(attrs);
      const insertPos = ref.pos + ref.node.nodeSize;
      const { tr } = editor.state;
      tr.insert(insertPos, newNode);
      dispatchTransaction(editor, tr);
      return true;
    }

    // Default: delegate to the editor command (inserts at current selection).
    if (input.content) {
      return Boolean(insertCmd({ attrs, text: input.content }));
    }
    return Boolean(insertCmd({ attrs }));
  });
}

// ---------------------------------------------------------------------------
// Public adapter assembly
// ---------------------------------------------------------------------------

export function createContentControlsAdapter(editor: Editor): ContentControlsAdapter & ContentControlsCreateAdapter {
  return {
    list: (query) => listWrapper(editor, query),
    get: (input) => getWrapper(editor, input),
    listInRange: (input) => listInRangeWrapper(editor, input),
    selectByTag: (input) => selectByTagWrapper(editor, input),
    selectByTitle: (input) => selectByTitleWrapper(editor, input),
    listChildren: (input) => listChildrenWrapper(editor, input),
    getParent: (input) => getParentWrapper(editor, input),
    wrap: (input, options) => wrapWrapper(editor, input, options),
    unwrap: (input, options) => unwrapWrapper(editor, input, options),
    delete: (input, options) => deleteWrapper(editor, input, options),
    copy: (input, options) => copyWrapper(editor, input, options),
    move: (input, options) => moveWrapper(editor, input, options),
    patch: (input, options) => patchWrapper(editor, input, options),
    setLockMode: (input, options) => setLockModeWrapper(editor, input, options),
    setType: (input, options) => setTypeWrapper(editor, input, options),
    getContent: (input) => getContentWrapper(editor, input),
    replaceContent: (input, options) => replaceContentWrapper(editor, input, options),
    clearContent: (input, options) => clearContentWrapper(editor, input, options),
    appendContent: (input, options) => appendContentWrapper(editor, input, options),
    prependContent: (input, options) => prependContentWrapper(editor, input, options),
    insertBefore: (input, options) => insertBeforeWrapper(editor, input, options),
    insertAfter: (input, options) => insertAfterWrapper(editor, input, options),
    getBinding: (input) => getBindingWrapper(editor, input),
    setBinding: (input, options) => setBindingWrapper(editor, input, options),
    clearBinding: (input, options) => clearBindingWrapper(editor, input, options),
    getRawProperties: (input) => getRawPropertiesWrapper(editor, input),
    patchRawProperties: (input, options) => patchRawPropertiesWrapper(editor, input, options),
    validateWordCompatibility: (input) => validateWordCompatibilityWrapper(editor, input),
    normalizeWordCompatibility: (input, options) => normalizeWordCompatibilityWrapper(editor, input, options),
    normalizeTagPayload: (input, options) => normalizeTagPayloadWrapper(editor, input, options),
    text: {
      setMultiline: (input, options) => textSetMultilineWrapper(editor, input, options),
      setValue: (input, options) => textSetValueWrapper(editor, input, options),
      clearValue: (input, options) => textClearValueWrapper(editor, input, options),
    },
    date: {
      setValue: (input, options) => dateSetValueWrapper(editor, input, options),
      clearValue: (input, options) => dateClearValueWrapper(editor, input, options),
      setDisplayFormat: (input, options) => dateSetDisplayFormatWrapper(editor, input, options),
      setDisplayLocale: (input, options) => dateSetDisplayLocaleWrapper(editor, input, options),
      setStorageFormat: (input, options) => dateSetStorageFormatWrapper(editor, input, options),
      setCalendar: (input, options) => dateSetCalendarWrapper(editor, input, options),
    },
    checkbox: {
      getState: (input) => checkboxGetStateWrapper(editor, input),
      setState: (input, options) => checkboxSetStateWrapper(editor, input, options),
      toggle: (input, options) => checkboxToggleWrapper(editor, input, options),
      setSymbolPair: (input, options) => checkboxSetSymbolPairWrapper(editor, input, options),
    },
    choiceList: {
      getItems: (input) => choiceListGetItemsWrapper(editor, input),
      setItems: (input, options) => choiceListSetItemsWrapper(editor, input, options),
      setSelected: (input, options) => choiceListSetSelectedWrapper(editor, input, options),
    },
    repeatingSection: {
      listItems: (input) => repeatingSectionListItemsWrapper(editor, input),
      insertItemBefore: (input, options) => repeatingSectionInsertItemBeforeWrapper(editor, input, options),
      insertItemAfter: (input, options) => repeatingSectionInsertItemAfterWrapper(editor, input, options),
      cloneItem: (input, options) => repeatingSectionCloneItemWrapper(editor, input, options),
      deleteItem: (input, options) => repeatingSectionDeleteItemWrapper(editor, input, options),
      setAllowInsertDelete: (input, options) => repeatingSectionSetAllowInsertDeleteWrapper(editor, input, options),
    },
    group: {
      wrap: (input, options) => groupWrapWrapper(editor, input, options),
      ungroup: (input, options) => groupUngroupWrapper(editor, input, options),
    },
    create: (input, options) => createWrapper(editor, input, options),
  };
}
