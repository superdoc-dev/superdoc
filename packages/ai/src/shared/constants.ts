/**
 * Constants and configuration values for the AI package
 * @module constants
 */

/**
 * Default maximum length of document context sent to AI provider (in characters, not tokens).
 */
export const DEFAULT_CONTEXT_LENGTH = 8000;

/**
 * Ratio of context to use for the beginning of truncated text (0.0 - 1.0)
 * Remaining ratio is used for the end of the text
 */
export const TRUNCATION_HEAD_RATIO = 0.6;

/**
 * Maximum number of steps allowed in an execution plan
 * Prevents infinite loops or extremely long-running operations
 */
export const MAX_PLAN_STEPS = 50;

/**
 * Maximum length for user prompts (in characters)
 */
export const MAX_PROMPT_LENGTH = 10000;

/**
 * Maximum length for tool instructions (in characters)
 */
export const MAX_INSTRUCTION_LENGTH = 5000;

/**
 * Maximum number of iterations for streaming reader (safety limit)
 * Prevents infinite loops if stream never closes properly
 */
export const MAX_STREAM_ITERATIONS = 100000;

/**
 * Maximum timeout for streaming operations (in milliseconds)
 * Default: 5 minutes
 */
export const MAX_STREAM_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Error message constants
 */
export const ERROR_MESSAGES = {
  // Configuration errors
  NO_SUPERDOC_OR_EDITOR: 'AIPlanner requires either "superdoc" or "editor" configuration',
  NO_USER_CONFIG: 'When using "superdoc", you must provide either "user" config or a pre-built "aiActions" instance',
  NO_ACTIVE_EDITOR: 'AIPlanner requires an active SuperDoc editor instance',
  NO_PROVIDER: 'AI provider is required',
  NO_EDITOR_FOR_ACTION: 'No active SuperDoc editor available for AI actions',

  // Validation errors
  EMPTY_PROMPT: 'AIPlanner requires a non-empty prompt',
  PROMPT_TOO_LONG: `Prompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters`,
  TOO_MANY_STEPS: `Plan exceeds maximum of ${MAX_PLAN_STEPS} steps`,

  // Execution errors
  ACTION_NOT_AVAILABLE: (actionName: string) => `Action "${actionName}" is not available on AIActionsService`,
  TOOL_NOT_FOUND: (toolName: string) => `Unknown tool "${toolName}" was ignored`,
  TOOL_NO_INSTRUCTION: (stepId: string) => `Step "${stepId}" has no instruction and was skipped`,
  TOOL_EXECUTION_FAILED: (toolName: string) => `Tool "${toolName}" failed to execute`,
  TOOL_THREW_ERROR: (toolName: string, detail: string) => `Tool "${toolName}" threw an error: ${detail}`,
  TOOL_NO_RESULTS: (toolName: string) =>
    `Tool "${toolName}" produced no results and was skipped. Ensure the instruction references existing content.`,

  // Plan errors
  NO_ACTIONABLE_STEPS: 'Plan did not contain actionable steps',
  INVALID_PLAN_RESPONSE: 'Plan response did not contain valid steps',

  // literalReplace specific
  LITERAL_REPLACE_NO_FIND: 'literalReplace requires a non-empty "find" argument',
  LITERAL_REPLACE_NO_REPLACE: 'literalReplace requires a "replace" argument (use an empty string to delete)',
  LITERAL_REPLACE_NO_MATCHES: (findText: string) => `No matches found for "${findText}"`,

  // insertContent specific
  INSERT_CONTENT_FAILED: 'insertContent could not complete the request',

  // AIActions specific
  NOT_READY: 'AIActions is not ready yet. Call waitUntilReady() first',
  EDITOR_REQUIRED: 'AIActions requires an active editor before initialization',

  // Context provider errors
  CONTEXT_PROVIDER_FAILED: 'Document context provider failed',
} as const;

/**
 * Logging prefixes for different components
 */
export const LOG_PREFIXES = {
  PLANNER: '[AIPlanner]',
  ACTIONS: '[AIActions]',
  SERVICE: '[AIActionsService]',
  PROVIDER: '[AIProvider]',
} as const;

/**
 * Progress message templates
 */
export const PROGRESS_MESSAGES = {
  PLANNING: 'Analyzing your request and creating a plan...',
} as const;
