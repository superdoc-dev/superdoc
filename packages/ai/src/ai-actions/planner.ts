import { AIActionsService } from './services';
import { AIActions } from './index';
import type {
  AIProvider,
  CompletionOptions,
  Editor,
  Result,
  SuperDocInstance,
  AIUser,
  AIActionsCallbacks,
  PlannerContextSnapshot,
  BuilderPlanResult,
} from '../shared';
import { SuperDoc } from 'superdoc';
import { createAIProvider, isAIProvider } from './providers';
import type { AIProviderInput } from './providers';
import {
  parseJSON,
  validateInput,
  getErrorMessage,
  isPlainObject,
  DEFAULT_CONTEXT_LENGTH,
  TRUNCATION_HEAD_RATIO,
  MAX_PLAN_STEPS,
  MAX_PROMPT_LENGTH,
  MAX_INSTRUCTION_LENGTH,
  ERROR_MESSAGES,
  PROGRESS_MESSAGES,
} from '../shared';
import { Logger } from '../shared/logger';
import { extractSelection, getDocumentText, isEditorReady } from './editor';
import { createToolRegistry, getToolDescriptions } from './tools';
import { buildAIPlannerSystemPrompt } from '../shared/prompts';
import type {
  AIToolDefinition,
  AIToolName,
  AIPlanStep,
  AIPlannerProgressCallback,
  AIToolActions,
  SelectionSnapshot,
  AIToolHandlerResult,
} from './tools';

export interface AIPlan {
  reasoning?: string;
  steps: AIPlanStep[];
}

export interface AIPlannerConfig {
  // RECOMMENDED: Pass editor + pre-built AIActions instance (used when accessed via ai.planner)
  editor?: Editor;
  aiActions?: AIActions;

  // ALTERNATIVE: Pass SuperDoc instance + user config (AIActions created internally)
  superdoc?: SuperDocInstance;
  user?: AIUser;

  // Provider configuration (required)
  provider: AIProviderInput;

  // Optional configuration
  enableLogging?: boolean;
  /** Maximum document context length in characters (not tokens). */
  maxContextLength?: number;
  documentContextProvider?: () => string;
  tools?: AIToolDefinition[];

  // Callbacks (only needed when superdoc + user is used, not when aiActions is provided)
  onProgress?: AIPlannerProgressCallback;
  onReady?: AIActionsCallbacks['onReady'];
  onStreamingStart?: AIActionsCallbacks['onStreamingStart'];
  onStreamingPartialResult?: AIActionsCallbacks['onStreamingPartialResult'];
  onStreamingEnd?: AIActionsCallbacks['onStreamingEnd'];
  onError?: AIActionsCallbacks['onError'];
}

export interface AIPlannerExecutionResult {
  success: boolean;
  executedTools: string[];
  reasoning?: string;
  response?: string;
  plan?: AIPlan;
  rawPlan?: string;
  error?: string;
  warnings?: string[];
}

export class AIPlanner {
  private readonly editor: Editor;
  private readonly provider: AIProvider;
  private readonly enableLogging: boolean;
  private readonly logger: Logger;
  private readonly maxContextLength: number;
  private readonly documentContextProvider: () => string;
  private readonly tools: Map<AIToolName, AIToolDefinition>;
  private readonly aiActionsInstance: AIActions | null;
  private readonly actions: AIToolActions;
  private readonly onProgress?: AIPlannerProgressCallback;
  private selectionSnapshot: SelectionSnapshot | null = null;

  /**
   * Creates a new AIPlanner instance
   *
   * @param config - Planner configuration
   * @throws {Error} If configuration is invalid
   *
   * @remarks
   * The recommended way to use AIPlanner is through the `ai.planner` property
   * of an AIActions instance. Direct instantiation is mainly for advanced use cases.
   *
   * @example
   * ```typescript
   * // RECOMMENDED: Use planner from AIActions instance
   * const ai = new AIActions(superdoc, {
   *   user: { displayName: 'AI', userId: 'ai-1' },
   *   provider: { type: 'openai', apiKey: '...', model: 'gpt-4o' },
   *   planner: {
   *     maxContextLength: 8000,
   *     onProgress: (event) => console.log(event)
   *   }
   * });
   * const result = await ai.planner.execute('Fix grammar issues');
   *
   * // ALTERNATIVE: Direct instantiation with AIActions
   * const ai = new AIActions(superdoc, { user: {...}, provider: {...} });
   * const planner = new AIPlanner({
   *   editor: editor,
   *   aiActions: ai,
   *   provider: ai.config.provider, // or pass provider config
   *   enableLogging: true
   * });
   *
   * // ALTERNATIVE: Direct instantiation with SuperDoc + user
   * const planner = new AIPlanner({
   *   superdoc: superdocInstance,
   *   user: { displayName: 'AI', userId: 'ai-1' },
   *   provider: { type: 'openai', apiKey: '...', model: 'gpt-4o' },
   *   enableLogging: true,
   *   onProgress: (event) => console.log(event)
   * });
   * ```
   */
  constructor(config: AIPlannerConfig) {
    if (!config || !isPlainObject(config)) {
      throw new Error('AIPlanner requires a valid configuration object');
    }

    if (!config.provider) {
      throw new Error(ERROR_MESSAGES.NO_PROVIDER);
    }

    if (config.aiActions) {
      if (!config.editor) {
        throw new Error(ERROR_MESSAGES.NO_SUPERDOC_OR_EDITOR);
      }
    } else if (config.superdoc) {
      if (!config.user) {
        throw new Error(ERROR_MESSAGES.NO_USER_CONFIG);
      }
    } else if (!config.editor) {
      throw new Error(ERROR_MESSAGES.NO_SUPERDOC_OR_EDITOR);
    }

    // Get editor - prioritize from superdoc if provided, otherwise use config.editor
    const superdoc = config.superdoc ? (config.superdoc as unknown as SuperDoc) : null;
    this.editor = superdoc?.activeEditor ?? config.editor!;
    if (!isEditorReady(this.editor)) {
      throw new Error(ERROR_MESSAGES.NO_ACTIVE_EDITOR);
    }

    this.enableLogging = Boolean(config.enableLogging);
    this.logger = new Logger(this.enableLogging);
    this.maxContextLength = config.maxContextLength ?? DEFAULT_CONTEXT_LENGTH;
    this.provider = isAIProvider(config.provider) ? config.provider : createAIProvider(config.provider);
    this.onProgress = config.onProgress;

    if (config.documentContextProvider) {
      this.documentContextProvider = config.documentContextProvider;
    } else if (config.aiActions) {
      this.documentContextProvider = () => config.aiActions!.getDocumentContext();
    } else {
      this.documentContextProvider = () => this.readDocumentContextFromEditor();
    }
    if (config.aiActions) {
      this.aiActionsInstance = config.aiActions;
      this.actions = config.aiActions.action as AIToolActions;
    } else if (config.superdoc && config.user) {
      this.aiActionsInstance = new AIActions(config.superdoc, {
        provider: this.provider,
        user: config.user,
        enableLogging: this.enableLogging,
        onReady: config.onReady,
        onStreamingStart: config.onStreamingStart,
        onStreamingPartialResult: config.onStreamingPartialResult,
        onStreamingEnd: config.onStreamingEnd,
        onError: config.onError,
      });
      this.actions = this.aiActionsInstance.action as AIToolActions;
    } else {
      this.aiActionsInstance = null;
      const service = new AIActionsService(
        this.provider,
        this.editor,
        () => this.getFullDocumentContext(),
        this.enableLogging,
      );
      this.actions = service as unknown as AIToolActions;
    }

    this.tools = createToolRegistry(this.actions, config.tools);
  }

  /**
   * Executes a user instruction end-to-end:
   * 1. Validates input and builds a plan using the configured provider
   * 2. Runs each planned tool sequentially while preserving formatting
   * 3. Returns execution metadata plus any assistant response
   *
   * @param prompt - User instruction to execute
   * @param options - Optional completion configuration for the AI provider
   * @returns Execution result with success status, executed tools, and optional response
   * @throws {Error} If prompt is empty or exceeds maximum length
   *
   * @example
   * ```typescript
   * const result = await planner.execute('Fix grammar issues in the selected text');
   * if (result.success) {
   *   console.log('Executed tools:', result.executedTools);
   *   console.log('AI response:', result.response);
   * }
   * ```
   */
  async execute(prompt: string, options?: CompletionOptions): Promise<AIPlannerExecutionResult> {
    if (!validateInput(prompt)) {
      throw new Error(ERROR_MESSAGES.EMPTY_PROMPT);
    }

    if (prompt.length > MAX_PROMPT_LENGTH) {
      throw new Error(ERROR_MESSAGES.PROMPT_TOO_LONG);
    }

    this.selectionSnapshot = this.captureSelectionSnapshot();
    this.aiActionsInstance?.preserveCurrentSelectionContext();
    try {
      this.onProgress?.({ type: 'planning', message: PROGRESS_MESSAGES.PLANNING });

      const planResult = await this.buildPlan(prompt, options);

      if (!planResult.plan || !planResult.plan.steps?.length) {
        return {
          success: false,
          executedTools: [],
          reasoning: planResult.plan?.reasoning,
          rawPlan: planResult.raw,
          warnings: planResult.warnings,
          error: planResult.error ?? ERROR_MESSAGES.NO_ACTIONABLE_STEPS,
        };
      }

      if (planResult.plan.steps.length > MAX_PLAN_STEPS) {
        return {
          success: false,
          executedTools: [],
          reasoning: planResult.plan.reasoning,
          rawPlan: planResult.raw,
          warnings: planResult.warnings,
          error: ERROR_MESSAGES.TOO_MANY_STEPS,
        };
      }

      this.onProgress?.({ type: 'plan_ready', plan: planResult.plan });

      const executedTools: string[] = [];
      let assistantResponse: string | undefined;
      const totalSteps = planResult.plan.steps.length;
      const previousResults: Array<{ stepId?: string; tool: string; result: AIToolHandlerResult }> = [];

      for (let stepIndex = 0; stepIndex < planResult.plan.steps.length; stepIndex++) {
        const step = planResult.plan.steps[stepIndex];
        const handler = this.tools.get(step.tool);

        if (!handler) {
          planResult.warnings.push(ERROR_MESSAGES.TOOL_NOT_FOUND(step.tool));
          continue;
        }

        const instruction = (step.instruction ?? '').trim();
        if (!instruction.length && step.tool !== 'respond') {
          planResult.warnings.push(ERROR_MESSAGES.TOOL_NO_INSTRUCTION(step.id || step.tool));
          continue;
        }

        if (instruction.length > MAX_INSTRUCTION_LENGTH) {
          planResult.warnings.push(`Tool "${step.tool}" instruction exceeds maximum length and was truncated`);
          step.instruction = instruction.slice(0, MAX_INSTRUCTION_LENGTH);
        }

        try {
          this.onProgress?.({
            type: 'tool_start',
            tool: step.tool,
            instruction,
            stepIndex: stepIndex + 1,
            totalSteps,
          });

          const result = await handler.handler({
            instruction,
            step,
            context: { editor: this.editor, actions: this.actions },
            previousResults: previousResults.map((pr) => ({
              stepId: pr.stepId,
              tool: pr.tool as AIToolName,
              result: pr.result,
            })),
          });

          if (!result?.success) {
            this.onProgress?.({ type: 'complete', success: false });
            return {
              success: false,
              executedTools,
              plan: planResult.plan,
              rawPlan: planResult.raw,
              reasoning: planResult.plan.reasoning,
              warnings: planResult.warnings,
              error: result?.message ?? ERROR_MESSAGES.TOOL_EXECUTION_FAILED(step.tool),
            };
          }

          const resultPayload = result?.data as Result | undefined;
          const hasResults = Array.isArray(resultPayload?.results) && resultPayload.results.length > 0;
          if (step.tool !== 'respond' && !hasResults) {
            planResult.warnings.push(ERROR_MESSAGES.TOOL_NO_RESULTS(step.tool));
            continue;
          }

          executedTools.push(step.tool);

          // Store result for subsequent steps
          previousResults.push({
            stepId: step.id,
            tool: step.tool,
            result,
          });

          this.onProgress?.({
            type: 'tool_complete',
            tool: step.tool,
            stepIndex: stepIndex + 1,
            totalSteps,
          });

          if (step.tool === 'respond') {
            assistantResponse = result.message ?? instruction;
          } else if (!assistantResponse && result.message) {
            assistantResponse = result.message;
          }
        } catch (error) {
          const detail = getErrorMessage(error);
          this.logger.error('Tool execution error', error, {
            tool: step.tool,
            stepId: step.id,
            instructionLength: instruction.length,
          });
          this.onProgress?.({ type: 'complete', success: false });
          return {
            success: false,
            executedTools,
            plan: planResult.plan,
            rawPlan: planResult.raw,
            reasoning: planResult.plan.reasoning,
            warnings: planResult.warnings,
            error: ERROR_MESSAGES.TOOL_THREW_ERROR(step.tool, detail),
          };
        }
      }

      const success = executedTools.length > 0 || Boolean(assistantResponse);

      this.onProgress?.({ type: 'complete', success });

      return {
        success,
        executedTools,
        reasoning: planResult.plan.reasoning,
        response: assistantResponse,
        plan: planResult.plan,
        rawPlan: planResult.raw,
        warnings: planResult.warnings,
      };
    } finally {
      this.selectionSnapshot = null;
      this.aiActionsInstance?.clearSelectionContextOverride();
    }
  }

  /**
   * Builds an execution plan from a user prompt using the AI provider
   * @private
   * @param prompt - User instruction
   * @param options - Optional completion configuration
   * @returns Plan result with steps, warnings, and potential errors
   */
  private async buildPlan(prompt: string, options?: CompletionOptions): Promise<BuilderPlanResult> {
    const snapshot = await this.collectPlannerSnapshot(this.selectionSnapshot);
    const messages = [
      { role: 'system' as const, content: this.buildSystemPrompt() },
      { role: 'user' as const, content: this.buildUserPrompt(prompt, snapshot) },
    ];

    const raw = await this.provider.getCompletion(messages, options);
    const planPayload = this.extractPlanPayload(raw);
    const parsed = parseJSON<AIPlan>(planPayload, { reasoning: '', steps: [] }, this.enableLogging);
    const warnings: string[] = [];
    const sanitizedSteps = Array.isArray(parsed.steps)
      ? parsed.steps
          .map((step) => this.normalizeStep(step as AIPlanStep))
          .filter((step): step is AIPlanStep => Boolean(step))
      : [];

    if (!sanitizedSteps.length) {
      return {
        raw,
        warnings,
        plan: { ...parsed, steps: [] },
        error: ERROR_MESSAGES.INVALID_PLAN_RESPONSE,
      };
    }

    return {
      plan: { ...parsed, steps: sanitizedSteps },
      raw,
      warnings,
    };
  }

  /**
   * Extracts the JSON plan payload from various response formats
   * @private
   * @param response - Raw response from AI provider
   * @returns Extracted JSON string
   */
  private extractPlanPayload(response: string): string {
    const fallback = response?.trim() || '';
    type ParsedResponse = {
      choices?: Array<{ message?: { content?: string } }>;
      content?: string;
      message?: { content?: string };
    };
    const parsed = parseJSON<ParsedResponse>(response, undefined as unknown as ParsedResponse, this.enableLogging);

    const candidates: Array<string | undefined> = [];

    if (parsed && typeof parsed === 'object') {
      const firstChoice = parsed?.choices?.[0];
      if (firstChoice?.message?.content) {
        candidates.push(firstChoice.message.content);
      }
      if (typeof parsed.content === 'string') {
        candidates.push(parsed.content);
      }
      if (parsed.message?.content) {
        candidates.push(parsed.message.content);
      }
    }

    for (const candidate of candidates) {
      if (typeof candidate === 'string') {
        const trimmed = candidate.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          return candidate;
        }
      }
    }

    return candidates.find((value): value is string => typeof value === 'string') ?? fallback;
  }

  /**
   * Normalizes and validates a plan step from AI response
   * @private
   * @param step - Raw plan step from AI response
   * @returns Normalized step or null if invalid
   */
  private normalizeStep(step: AIPlanStep | undefined | null): AIPlanStep | null {
    if (!step || typeof step !== 'object') {
      return null;
    }
    if (!step.tool) {
      return null;
    }
    const instruction = step.instruction ? step.instruction : '';
    const args = step.args && typeof step.args === 'object' ? step.args : undefined;

    return {
      id: step.id,
      tool: step.tool as AIToolName,
      instruction,
      args,
    };
  }

  /**
   * Builds the system prompt with available tools and guidelines
   * Uses the centralized prompt template from prompts module
   * @private
   * @returns System prompt string
   */
  private buildSystemPrompt(): string {
    const toolDescriptions = getToolDescriptions(this.tools);
    return buildAIPlannerSystemPrompt(toolDescriptions);
  }

  /**
   * Builds the user prompt with context information
   * @private
   * @param prompt - User's request
   * @param snapshot - Context snapshot with document and selection text
   * @returns Formatted user prompt
   */
  private buildUserPrompt(prompt: string, snapshot: PlannerContextSnapshot): string {
    const sections = [
      `User request:\n${prompt.trim()}`,
      snapshot.selectionText ? `Current selection (reference only, do not rewrite):\n${snapshot.selectionText}` : '',
      snapshot.documentText ? `Document text (truncated):\n${snapshot.documentText}` : '',
    ].filter(Boolean);

    return sections.join('\n\n');
  }

  /**
   * Collects a snapshot of document and selection context for planning
   * @private
   * @param selectionSnapshot - Existing selection snapshot or null
   * @returns Context snapshot with document and selection text
   */
  private async collectPlannerSnapshot(selectionSnapshot: SelectionSnapshot | null): Promise<PlannerContextSnapshot> {
    const selectionText = selectionSnapshot?.text ?? this.captureSelectionSnapshot()?.text ?? '';
    const documentText = this.truncateForPlanner(this.getFullDocumentContext());
    return {
      documentText,
      selectionText,
    };
  }

  /**
   * Captures the current editor selection as a snapshot
   * @private
   * @returns Selection snapshot or null if no selection exists
   */
  private captureSelectionSnapshot(): SelectionSnapshot | null {
    const selection = extractSelection(this.editor, this.enableLogging);

    if (selection.isEmpty) {
      return null;
    }

    return {
      from: selection.from,
      to: selection.to,
      text: selection.text,
    };
  }

  /**
   * Truncates document text to fit within context length limits
   * Uses character count (not tokens).
   * @private
   * @param text - Text to truncate
   * @returns Truncated text with head and tail preserved
   */
  private truncateForPlanner(text?: string | null): string {
    if (!text) {
      return '';
    }

    if (text.length <= this.maxContextLength) {
      return text;
    }

    const head = Math.floor(this.maxContextLength * TRUNCATION_HEAD_RATIO);
    const tail = this.maxContextLength - head;
    return `${text.slice(0, head)}\n... (truncated) ...\n${text.slice(-tail)}`;
  }

  /**
   * Gets full document context using the configured provider
   * Falls back to reading from editor if provider fails
   * @private
   * @returns Document context string
   */
  private getFullDocumentContext(): string {
    try {
      return this.documentContextProvider() || '';
    } catch (error) {
      this.logger.warn(ERROR_MESSAGES.CONTEXT_PROVIDER_FAILED, error);
      return this.readDocumentContextFromEditor();
    }
  }

  /**
   * Reads document context directly from the editor
   * Prioritizes selection snapshot, then current selection, then full document
   * @private
   * @returns Document context string
   */
  private readDocumentContextFromEditor(): string {
    if (this.selectionSnapshot?.text) {
      return this.selectionSnapshot.text;
    }

    const selection = extractSelection(this.editor, this.enableLogging);
    if (!selection.isEmpty && selection.text) {
      return selection.text;
    }

    return getDocumentText(this.editor, this.enableLogging);
  }
}
