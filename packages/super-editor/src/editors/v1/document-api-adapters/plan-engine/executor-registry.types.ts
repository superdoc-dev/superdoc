/**
 * Internal executor registry types — PM-aware, lives only in super-editor.
 *
 * These types define the interface that domain step executors must implement.
 * They are NOT exported by document-api.
 */

import type { Transaction } from 'prosemirror-state';
import type { Mapping } from 'prosemirror-transform';
import type { StepOutcome, StepOutcomeData, MutationStep, SelectionTarget } from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';
import type { CapturedStyle } from './style-resolver.js';

// ---------------------------------------------------------------------------
// Compiled target model — discriminated union (D2)
// ---------------------------------------------------------------------------

/** A single segment of a cross-block span target. */
export interface CompiledSegment {
  blockId: string;
  from: number;
  to: number;
  absFrom: number;
  absTo: number;
}

/** Single-block range target — used for all single-block operations. */
export interface CompiledRangeTarget {
  kind: 'range';
  stepId: string;
  op: string;
  blockId: string;
  from: number;
  to: number;
  absFrom: number;
  absTo: number;
  text: string;
  marks: readonly unknown[];
  /** Populated when target originated from a query.match ref. */
  matchId?: string;
  /** Captured inline style data for the matched range (populated during compile). */
  capturedStyle?: CapturedStyle;
}

/** Cross-block span target — ordered segments across multiple blocks. */
export interface CompiledSpanTarget {
  kind: 'span';
  stepId: string;
  op: string;
  matchId: string;
  segments: CompiledSegment[];
  /** Flattened logical text across all segments (for receipts/diagnostics). */
  text: string;
  marks: readonly unknown[];
  /** Per-segment captured style data (indexed parallel to `segments`). */
  capturedStyleBySegment?: CapturedStyle[];
}

/**
 * Selection-based compiled target — produced by `where.by: 'target'`.
 *
 * Uses absolute PM positions directly, without block-relative text offsets.
 * This is the canonical internal shape for explicit SelectionTarget inputs,
 * including nodeEdge boundaries that have no block-relative representation.
 */
export interface CompiledSelectionTarget {
  kind: 'selection';
  stepId: string;
  op: string;
  absFrom: number;
  absTo: number;
  /** The normalized SelectionTarget (direction-corrected). */
  normalizedTarget: SelectionTarget;
  /** Canonical text snapshot using doc.textBetween projection. */
  text: string;
  /** Optional per-segment detail when the selection spans multiple blocks. */
  segments?: CompiledSegment[];
  /** Captured inline style data for style-preserving operations. */
  capturedStyle?: CapturedStyle;
}

export type CompiledTarget = CompiledRangeTarget | CompiledSpanTarget | CompiledSelectionTarget;

// ---------------------------------------------------------------------------
// Executor context and interface
// ---------------------------------------------------------------------------

export interface CompileContext {
  editor: Editor;
  step: MutationStep;
}

export interface ExecuteContext {
  editor: Editor;
  tr: Transaction;
  mapping: Mapping;
  changeMode: 'direct' | 'tracked';
  planGroupId: string;
  commandDispatched: boolean;
  /** True when running in preview mode — self-dispatching executors must return noop. */
  isPreview: boolean;
}

export interface StepExecutor {
  /** Resolve step targets against pre-mutation document state. */
  compile?(ctx: CompileContext): CompiledTarget[];
  /** Validate compiled targets (e.g., overlap detection). */
  validate?(targets: CompiledTarget[], allTargets: CompiledTarget[]): void;
  /** Execute the step against the shared transaction. */
  execute(ctx: ExecuteContext, targets: CompiledTarget[], step: MutationStep): StepOutcome;
  /** Produce domain-specific outcome data for the receipt. */
  serializeOutcome?(targets: CompiledTarget[], step: MutationStep): StepOutcomeData;
}

export interface ExecutorRegistration {
  opPrefix: string;
  executor: StepExecutor;
}
