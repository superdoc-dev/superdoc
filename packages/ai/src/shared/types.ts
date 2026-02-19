import { SuperDoc, Editor as EditorClass } from 'superdoc';
import type { Mark, Node } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { AIPlan } from '../ai-actions/types';
import { AIToolDefinition } from '../ai-actions/tools';

export type MarkType = Mark;
export type NodeType = Node;

// Extend the Editor type to include properties not defined in the JS class
export type Editor = InstanceType<typeof EditorClass> & {
  view?: EditorView;
  state?: EditorState;
};

export type SuperDocInstance = typeof SuperDoc | SuperDoc;

/**
 * Represents a position range in the document
 */
export interface DocumentPosition {
  from: number;
  to: number;
}

/**
 * Represents a match found by AI operations
 */
export interface FoundMatch {
  originalText?: string | null | undefined;
  suggestedText?: string | null | undefined;
  positions?: DocumentPosition[];
  changeId?: string;
}

/**
 * Standard result structure for AI operations
 */
export interface Result {
  success: boolean;
  results: FoundMatch[];
}

/**
 * Message format for AI chat interactions
 */
export type AIMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

/**
 * Options for streaming AI completions
 */
export type StreamOptions = {
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
  model?: string;
  signal?: AbortSignal;
  metadata?: Record<string, unknown>;
  providerOptions?: Record<string, unknown>;
  documentId?: string;
  stream?: boolean;
};

/**
 * Options for non-streaming completions (extends StreamOptions)
 */
export type CompletionOptions = StreamOptions;

/**
 * Interface that all AI providers must implement
 */
export type AIProvider = {
  streamResults?: boolean;
  streamCompletion(messages: AIMessage[], options?: StreamOptions): AsyncGenerator<string, void, unknown>;
  getCompletion(messages: AIMessage[], options?: CompletionOptions): Promise<string>;
};

/**
 * User information for AI-generated changes
 */
export type AIUser = {
  displayName: string;
  profileUrl?: string;
  userId?: string;
};

/**
 * Configuration for the AIActions service
 */
export type AIActionsConfig = {
  provider: AIProvider;
  user: AIUser;
  systemPrompt?: string;
  enableLogging?: boolean;
  /** Maximum document context length in characters (not tokens). Default: 8,000 characters */
  maxContextLength?: number;
};

/**
 * Lifecycle callbacks for AIActions events
 */
export type AIActionsCallbacks = {
  onReady?: (context: { aiActions: unknown }) => void;
  onStreamingStart?: () => void;
  onStreamingPartialResult?: (context: { partialResult: string }) => void;
  onStreamingEnd?: (context: { fullResult: unknown }) => void;
  onError?: (error: Error) => void;
};

/**
 * Planner-specific configuration options
 */
export type PlannerOptions = {
  /** Maximum document context length in characters (not tokens). Default: 8,000 characters */
  maxContextLength?: number;
  documentContextProvider?: () => string;
  tools?: AIToolDefinition[];
  onProgress?: (event: unknown) => void;
};

/**
 * Complete options for AIActions constructor
 */
export type AIActionsOptions = AIActionsConfig &
  AIActionsCallbacks & {
    planner?: PlannerOptions;
  };

/**
 * Record type with string keys and unknown values for maximum type safety
 */
export type SafeRecord = Record<string, unknown>;

/**
 * Interface for tool handler actions that can be either AIActionsService or AIActions.action
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
 * Internal snapshot of editor selection state
 */
export interface SelectionSnapshot {
  from: number;
  to: number;
  text: string;
}

/**
 * Context snapshot passed to the planner
 */
export interface PlannerContextSnapshot {
  documentText: string;
  selectionText: string;
}

/**
 * Internal result from plan building
 */
export interface BuilderPlanResult {
  plan?: AIPlan;
  raw: string;
  warnings: string[];
  error?: string;
}

export { SuperDoc };
