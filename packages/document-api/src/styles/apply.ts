/**
 * `styles.apply` — stylesheet mutation for document-level defaults.
 *
 * Defines the contract types, validation orchestration, and execution entry point.
 * Engine-agnostic: no ProseMirror, Yjs, or converter imports.
 *
 * Imports: registry.ts (types/data), validation.ts (validation functions).
 */

import type { ReceiptFailure } from '../types/receipt.js';
import type { StylesChannel } from './registry.js';
import { XML_PATH_BY_CHANNEL } from './registry.js';
import { validateStylesApplyInput, validateStylesApplyOptions } from './validation.js';

// ---------------------------------------------------------------------------
// State Types (before/after receipts)
// ---------------------------------------------------------------------------

/** Tri-state for OOXML boolean style properties. */
export type StylesBooleanState = 'on' | 'off' | 'inherit';
export type StylesNumberState = number | 'inherit';
export type StylesEnumState = string | 'inherit';
export type StylesObjectState = Record<string, unknown> | 'inherit';
export type StylesArrayState = unknown[] | 'inherit';

// ---------------------------------------------------------------------------
// Patch Types
// ---------------------------------------------------------------------------

/** Patch for run-channel properties (docDefaults/w:rPrDefault/w:rPr). */
export interface StylesRunPatch {
  // Booleans
  bold?: boolean;
  boldCs?: boolean;
  italic?: boolean;
  iCs?: boolean;
  smallCaps?: boolean;
  strike?: boolean;
  dstrike?: boolean;
  emboss?: boolean;
  imprint?: boolean;
  outline?: boolean;
  shadow?: boolean;
  vanish?: boolean;
  webHidden?: boolean;
  specVanish?: boolean;
  snapToGrid?: boolean;
  noProof?: boolean;
  // Integers
  fontSize?: number;
  fontSizeCs?: number;
  letterSpacing?: number;
  kern?: number;
  position?: number;
  w?: number;
  // Enums
  textTransform?: string;
  vertAlign?: string;
  em?: string;
  // Strings
  effect?: string;
  // Objects
  fontFamily?: Record<string, unknown>;
  color?: Record<string, unknown>;
  underline?: Record<string, unknown>;
  borders?: Record<string, unknown>;
  shading?: Record<string, unknown>;
  lang?: Record<string, unknown>;
  eastAsianLayout?: Record<string, unknown>;
  fitText?: Record<string, unknown>;
}

/** Patch for paragraph-channel properties (docDefaults/w:pPrDefault/w:pPr). */
export interface StylesParagraphPatch {
  // Booleans
  keepLines?: boolean;
  keepNext?: boolean;
  widowControl?: boolean;
  contextualSpacing?: boolean;
  pageBreakBefore?: boolean;
  suppressAutoHyphens?: boolean;
  suppressLineNumbers?: boolean;
  suppressOverlap?: boolean;
  mirrorIndents?: boolean;
  wordWrap?: boolean;
  kinsoku?: boolean;
  overflowPunct?: boolean;
  topLinePunct?: boolean;
  autoSpaceDE?: boolean;
  autoSpaceDN?: boolean;
  adjustRightInd?: boolean;
  rightToLeft?: boolean;
  snapToGrid?: boolean;
  // Integers
  outlineLvl?: number;
  // Enums
  justification?: string;
  textAlignment?: string;
  textDirection?: string;
  textboxTightWrap?: string;
  // Objects
  spacing?: Record<string, unknown>;
  indent?: Record<string, unknown>;
  shading?: Record<string, unknown>;
  numberingProperties?: Record<string, unknown>;
  framePr?: Record<string, unknown>;
  borders?: Record<string, unknown>;
  // Arrays
  tabStops?: unknown[];
}

// ---------------------------------------------------------------------------
// Resolution Metadata
// ---------------------------------------------------------------------------

export interface StylesTargetResolution {
  scope: 'docDefaults';
  channel: StylesChannel;
  xmlPart: 'word/styles.xml';
  xmlPath: string;
}

// ---------------------------------------------------------------------------
// Input / Output Types
// ---------------------------------------------------------------------------

export interface StylesApplyRunInput {
  target: { scope: 'docDefaults'; channel: 'run' };
  patch: StylesRunPatch;
}

export interface StylesApplyParagraphInput {
  target: { scope: 'docDefaults'; channel: 'paragraph' };
  patch: StylesParagraphPatch;
}

export type StylesApplyInput = StylesApplyRunInput | StylesApplyParagraphInput;

export interface StylesApplyOptions {
  dryRun?: boolean;
  expectedRevision?: string;
}

export type StylesStateMap = Record<
  string,
  StylesBooleanState | StylesNumberState | StylesEnumState | StylesObjectState | StylesArrayState
>;

export interface StylesApplyReceiptSuccess {
  success: true;
  changed: boolean;
  resolution: StylesTargetResolution;
  dryRun: boolean;
  before: StylesStateMap;
  after: StylesStateMap;
}

export interface StylesApplyReceiptFailure {
  success: false;
  resolution: StylesTargetResolution;
  failure: ReceiptFailure;
}

export type StylesApplyReceipt = StylesApplyReceiptSuccess | StylesApplyReceiptFailure;

// ---------------------------------------------------------------------------
// Adapter Interface
// ---------------------------------------------------------------------------

export interface StylesAdapter {
  apply(input: StylesApplyRunInput, options: NormalizedStylesApplyOptions): StylesApplyReceipt;
  apply(input: StylesApplyParagraphInput, options: NormalizedStylesApplyOptions): StylesApplyReceipt;
  apply(input: StylesApplyInput, options: NormalizedStylesApplyOptions): StylesApplyReceipt;
}

export interface NormalizedStylesApplyOptions {
  dryRun: boolean;
  expectedRevision: string | undefined;
}

// ---------------------------------------------------------------------------
// Public API surface
// ---------------------------------------------------------------------------

export interface StylesApi {
  apply(input: StylesApplyRunInput, options?: StylesApplyOptions): StylesApplyReceipt;
  apply(input: StylesApplyParagraphInput, options?: StylesApplyOptions): StylesApplyReceipt;
  apply(input: StylesApplyInput, options?: StylesApplyOptions): StylesApplyReceipt;
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

function normalizeOptions(options?: StylesApplyOptions): NormalizedStylesApplyOptions {
  return {
    dryRun: options?.dryRun ?? false,
    expectedRevision: options?.expectedRevision,
  };
}

/**
 * Executes `styles.apply` using the provided adapter.
 * Validates input and options, then delegates to the adapter.
 */
export function executeStylesApply(
  adapter: StylesAdapter,
  input: StylesApplyInput,
  options?: StylesApplyOptions,
): StylesApplyReceipt {
  validateStylesApplyInput(input);
  validateStylesApplyOptions(options);
  return adapter.apply(input, normalizeOptions(options));
}
