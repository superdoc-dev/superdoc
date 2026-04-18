/**
 * Content controls shared helper modules.
 *
 * Re-exports from all sub-modules for convenient single-path imports.
 */

export {
  SDT_NODE_NAMES,
  SDT_BLOCK_NAME,
  SDT_INLINE_NAME,
  isSdtNode,
  findAllSdtNodes,
  resolveSdtByTarget,
  type ResolvedSdt,
} from './target-resolution.js';

export {
  resolveControlType,
  resolveLockMode,
  resolveAppearance,
  resolveBinding,
  buildTarget,
  buildContentControlInfoFromNode,
  buildContentControlInfoFromAttrs,
  readCheckboxChecked,
  readChoiceListData,
} from './sdt-info-builder.js';

export { assertNotSdtLocked, assertNotContentLocked, assertControlType } from './lock-enforcement.js';

export { buildMutationSuccess, buildMutationFailure, applyPagination } from './result-builders.js';

export {
  applyAttrsUpdate,
  updateSdtPrChild,
  updateSdtPrChildAttr,
  removeSdtPrChildAttr,
  updateSdtPrSubElementAttr,
  removeSdtPrSubElement,
  replaceSdtPrSubElements,
  findSdtPrChild,
  getSdtPrChildAttrs,
  upsertSdtPrChild,
  removeSdtPrChild,
  type SdtPrElement,
} from './sdt-properties-write.js';
