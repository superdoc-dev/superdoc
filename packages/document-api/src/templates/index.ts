/**
 * Barrel re-export for templates/ submodule.
 *
 * Public surface only: internal validation helpers are not exposed.
 */

export type {
  TemplatesApplySourcePath,
  TemplatesApplySourceBase64,
  TemplatesApplySource,
  TemplateBodyPolicy,
  TemplateScope,
  TemplatesApplyInput,
  TemplatesApplyOptions,
  NormalizedTemplatesApplyOptions,
  TemplateScopeReport,
  TemplateSkipReason,
  TemplateScopeSkip,
  TemplateUnsupportedItem,
  TemplateChangeKind,
  TemplateChangedPart,
  TemplateIdMapping,
  TemplateApplyWarning,
  TemplatesApplySourceInfo,
  TemplatesApplyReceiptSuccess,
  TemplatesApplyFailureCode,
  TemplatesApplyReceiptFailure,
  TemplatesApplyReceipt,
  TemplatesAdapter,
  TemplatesApi,
} from './apply.js';
export { executeTemplatesApply } from './apply.js';
