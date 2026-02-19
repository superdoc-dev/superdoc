/**
 * Tool system types for AIPlanner
 * @module tools/types
 */

import type { Editor, Result } from '../../shared';

/**
 * Safe record type for tool arguments
 */
export type SafeRecord = Record<string, unknown>;

/**
 * Built-in tool names available in AIPlanner
 */
export type AIToolBuiltin =
  | 'findAll'
  | 'highlight'
  | 'replaceAll'
  | 'literalReplace'
  | 'insertTrackedChanges'
  | 'insertComments'
  | 'literalInsertComment'
  | 'summarize'
  | 'insertContent'
  | 'respond';

/**
 * Tool name type that allows built-in names plus custom tool names
 */
export type AIToolName = AIToolBuiltin | (string & {});

/**
 * Represents a single step in an execution plan
 */
export interface AIPlanStep {
  id?: string;
  tool: AIToolName;
  instruction: string;
  args?: SafeRecord;
}

/**
 * Actions interface available to tool handlers
 */
export interface AIToolActions {
  findAll: (instruction: string) => Promise<Result>;
  highlight: (instruction: string, color?: string) => Promise<Result>;
  replaceAll: (instruction: string) => Promise<Result>;
  literalReplace: (
    findText: string,
    replaceText: string,
    options?: { caseSensitive?: boolean; trackChanges?: boolean },
  ) => Promise<Result>;
  insertTrackedChanges: (instruction: string) => Promise<Result>;
  insertComments: (instruction: string) => Promise<Result>;
  literalInsertComment: (
    findText: string,
    commentText: string,
    options?: { caseSensitive?: boolean },
  ) => Promise<Result>;
  summarize: (instruction: string) => Promise<Result>;
  insertContent: (instruction: string, options?: { position?: 'before' | 'after' | 'replace' }) => Promise<Result>;
}

/**
 * Selection range for literalReplace operations
 */
export interface SelectionRange {
  from: number;
  to: number;
  text: string;
}

/**
 * Context provided to tool handlers
 */
export interface AIToolHandlerContext {
  editor: Editor;
  actions: AIToolActions;
}

/**
 * Result from a previous step in the plan
 */
export interface PreviousStepResult {
  stepId?: string;
  tool: AIToolName;
  result: AIToolHandlerResult;
}

/**
 * Payload passed to tool handlers
 */
export interface AIToolHandlerPayload {
  instruction: string;
  step: AIPlanStep;
  context: AIToolHandlerContext;
  previousResults?: PreviousStepResult[];
}

/**
 * Result returned from tool handlers
 */
export interface AIToolHandlerResult {
  success: boolean;
  message?: string;
  data?: Result | SafeRecord | null;
}

/**
 * Tool definition including metadata and handler
 */
export interface AIToolDefinition {
  name: AIToolName;
  description: string;
  handler: (payload: AIToolHandlerPayload) => Promise<AIToolHandlerResult> | AIToolHandlerResult;
}

/**
 * Selection snapshot for preserving selection state
 */
export interface SelectionSnapshot {
  from: number;
  to: number;
  text: string;
}

/**
 * Progress event types for AIPlanner execution
 */
export type AIPlannerProgressEvent =
  | { type: 'planning'; message: string }
  | { type: 'plan_ready'; plan: unknown }
  | { type: 'tool_start'; tool: string; instruction: string; stepIndex: number; totalSteps: number }
  | { type: 'tool_complete'; tool: string; stepIndex: number; totalSteps: number }
  | { type: 'complete'; success: boolean };

/**
 * Callback function for progress updates
 */
export type AIPlannerProgressCallback = (event: AIPlannerProgressEvent) => void;
