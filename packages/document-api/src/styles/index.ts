/**
 * Barrel re-export for styles/ submodules.
 *
 * Public surface only — internal validation/schema helpers are not exposed.
 */

// Registry: types, constants, and property definitions
export type { ValueSchema, StylesChannel, MergeStrategy, PropertyDefinition } from './registry.js';
export {
  PROPERTY_REGISTRY,
  ALLOWED_KEYS_BY_CHANNEL,
  EXCLUDED_KEYS,
  XML_PATH_BY_CHANNEL,
  getPropertyDefinition,
  ST_VERTICAL_ALIGN_RUN,
  ST_EM,
  ST_TEXT_ALIGNMENT,
  ST_TEXT_DIRECTION,
  ST_TEXTBOX_TIGHT_WRAP,
  ST_TEXT_TRANSFORM,
  ST_JUSTIFICATION,
} from './registry.js';

// Schema: JSON Schema builders (consumed by contract/schemas.ts)
export { toJsonSchema, buildPatchSchema, buildStateSchema } from './schema.js';

// Apply: types, interfaces, and execution
export type {
  StylesBooleanState,
  StylesNumberState,
  StylesEnumState,
  StylesObjectState,
  StylesArrayState,
  StylesRunPatch,
  StylesParagraphPatch,
  StylesTargetResolution,
  StylesApplyRunInput,
  StylesApplyParagraphInput,
  StylesApplyInput,
  StylesApplyOptions,
  StylesStateMap,
  StylesApplyReceiptSuccess,
  StylesApplyReceiptFailure,
  StylesApplyReceipt,
  StylesAdapter,
  NormalizedStylesApplyOptions,
  StylesApi,
} from './apply.js';
export { executeStylesApply } from './apply.js';

// Validation: exported for adapter use (excluded-key checking)
export { validateValue } from './validation.js';
