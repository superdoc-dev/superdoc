/**
 * Inline semantics — shared semantic layer (PM-independent).
 *
 * This is the single source of truth for inline property definitions,
 * token acceptance sets, strict token parsers, error types, and directive
 * transition semantics.
 *
 * Consumed by: contract validation, SDK, CLI, docs, conformance tests,
 * and (transitively) the PM-binding layer in super-editor.
 */

// Property identifiers
export {
  CORE_PROPERTY_IDS,
  CORE_PROPERTY_ID_SET,
  CORE_TOGGLE_PROPERTY_IDS,
  CORE_TOGGLE_PROPERTY_ID_SET,
} from './property-ids.js';

export type { CorePropertyId, CoreTogglePropertyId } from './property-ids.js';

// Token acceptance sets
export {
  ST_ON_OFF_VALUES,
  ST_ON_OFF_VALUE_SET,
  ST_ON_OFF_ON_VALUES,
  ST_ON_OFF_OFF_VALUES,
  ST_UNDERLINE_VALUES,
  ST_UNDERLINE_VALUE_SET,
  ST_THEME_COLOR_VALUES,
  ST_THEME_COLOR_VALUE_SET,
} from './token-sets.js';

export type { StOnOffValue, StUnderlineValue, StThemeColorValue } from './token-sets.js';

// Token parsers
export {
  parseStOnOff,
  parseStUnderline,
  parseUnderlineColor,
  parseUnderlineThemeColor,
  parseUnderlineThemeModifier,
} from './token-parsers.js';

export type {
  TokenParseOk,
  TokenParseError,
  TokenParseResult,
  StOnOffParsed,
  StUnderlineParsed,
} from './token-parsers.js';

// Error types
export { REQUIRED_RESOLUTION_FIELDS } from './error-types.js';

export type {
  InvalidInlineTokenToggle,
  InvalidInlineTokenUnderline,
  InvalidInlineTokenError,
  InlineTokenDiagnostic,
  StyleResolutionFailedError,
  InvalidTargetOutOfRange,
  InvalidTargetInvalidSelector,
  InvalidTargetError,
  RequiredResolutionField,
} from './error-types.js';

// Directive state model and transitions
export {
  derivePropertyStateFromDirect,
  derivePropertyStateWithCascade,
  applyDirectiveTransition,
  wouldDirectiveChange,
} from './directives.js';

export type {
  DirectState,
  Provenance,
  InlinePropertyState,
  ResolutionParagraphContext,
  ResolutionRunContext,
  ResolutionNumberingContext,
  ResolutionTableContext,
  EffectiveResolutionInput,
  EffectiveResolver,
} from './directives.js';
