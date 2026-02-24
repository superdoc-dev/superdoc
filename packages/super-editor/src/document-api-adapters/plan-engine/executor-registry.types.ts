/**
 * Internal executor registry types — PM-aware, lives only in super-editor.
 *
 * These types define the interface that domain step executors must implement.
 * They are NOT exported by document-api.
 */

import type { Transaction } from 'prosemirror-state';
import type { Mapping } from 'prosemirror-transform';
import type { StepOutcome, StepOutcomeData, MutationStep, TextStepResolution } from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';
import type { CapturedStyle } from './style-resolver.js';

export interface CompiledTarget {
  stepId: string;
  op: string;
  blockId: string;
  from: number;
  to: number;
  text: string;
  marks: readonly unknown[];
  /** Captured inline style data for the matched range (populated during compile). */
  capturedStyle?: CapturedStyle;
}

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
