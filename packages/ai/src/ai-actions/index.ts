import type {
  CompletionOptions,
  Editor,
  Result,
  StreamOptions,
  AIActionsCallbacks,
  AIActionsConfig,
  AIActionsOptions,
  SuperDocInstance,
  SuperDoc,
} from '../shared';
import { AIActionsService } from './services';
import { createAIProvider, isAIProvider } from './providers';
import { ERROR_MESSAGES, MAX_PROMPT_LENGTH, validateInput, getErrorMessage } from '../shared';
import { Logger } from '../shared/logger';
import { extractSelectionText, getDocumentText, isEditorReady } from './editor';
import { AIPlanner } from './planner';
import type { AIPlannerConfig } from './planner';

/**
 * Primary entry point for SuperDoc AI capabilities. Wraps a SuperDoc instance,
 * manages provider lifecycle, and exposes high-level document actions.
 *
 * @template TSuperdoc - Type of the SuperDoc instance being wrapped
 *
 * @example
 * ```typescript
 * // With provider config (recommended)
 * const ai = new AIActions(superdoc, {
 *   user: { display_name: 'Bot', user_id: 'bot-123' },
 *   provider: {
 *     type: 'openai',
 *     apiKey: process.env.OPENAI_API_KEY,
 *     model: 'gpt-4'
 *   }
 * });
 *
 * // With existing provider instance
 * const provider = createAIProvider({ type: 'openai', ... });
 * const ai = new AIActions(superdoc, {
 *   user: { display_name: 'Bot' },
 *   provider
 * });
 * ```
 */
export class AIActions {
  private readonly superdoc: SuperDocInstance;
  private readonly config: AIActionsConfig;
  private callbacks: AIActionsCallbacks;
  private isReady = false;
  private initializationPromise: Promise<void> | null = null;
  private readonly commands: AIActionsService;
  private selectionContextOverride: string | null = null;
  private plannerInstance: AIPlanner | null = null;
  private readonly plannerOptions?: AIActionsOptions['planner'];
  private readonly logger: Logger;

  public readonly action = {
    find: async (instruction: string) => {
      return this.executeActionWithCallbacks(() => this.commands.find(instruction));
    },
    findAll: async (instruction: string) => {
      return this.executeActionWithCallbacks(() => this.commands.findAll(instruction));
    },
    highlight: async (instruction: string, color?: string) => {
      return this.executeActionWithCallbacks(() => this.commands.highlight(instruction, color));
    },
    replace: async (instruction: string) => {
      return this.executeActionWithCallbacks(() => this.commands.replace(instruction));
    },
    replaceAll: async (instruction: string) => {
      return this.executeActionWithCallbacks(() => this.commands.replaceAll(instruction));
    },
    literalReplace: async (
      findText: string,
      replaceText: string,
      options?: { caseSensitive?: boolean; trackChanges?: boolean; contentType?: 'html' | 'markdown' | 'text' },
    ) => {
      return this.executeActionWithCallbacks(() => this.commands.literalReplace(findText, replaceText, options));
    },
    insertTrackedChange: async (instruction: string) => {
      return this.executeActionWithCallbacks(() => this.commands.insertTrackedChange(instruction));
    },
    insertTrackedChanges: async (instruction: string) => {
      return this.executeActionWithCallbacks(() => this.commands.insertTrackedChanges(instruction));
    },
    insertComment: async (instruction: string) => {
      return this.executeActionWithCallbacks(() => this.commands.insertComment(instruction));
    },

    insertComments: async (instruction: string) => {
      return this.executeActionWithCallbacks(() => this.commands.insertComments(instruction));
    },
    literalInsertComment: async (findText: string, commentText: string, options?: { caseSensitive?: boolean }) => {
      return this.executeActionWithCallbacks(() => this.commands.literalInsertComment(findText, commentText, options));
    },
    summarize: async (instruction: string) => {
      return this.executeActionWithCallbacks(() => this.commands.summarize(instruction));
    },
    insertContent: async (
      instruction: string,
      options?: { position?: 'before' | 'after' | 'replace'; contentType?: 'html' | 'markdown' | 'text' },
    ) => {
      return this.executeActionWithCallbacks(() => this.commands.insertContent(instruction, options));
    },
  };

  /**
   * Creates a new AIActions instance.
   *
   * @param superdoc - SuperDoc instance to wrap
   * @param options - Configuration including provider, user, and callbacks
   * @throws {Error} If SuperDoc instance is invalid or editor is not available
   *
   * @example
   * ```typescript
   * const ai = new AIActions(superdoc, {
   *   user: { displayName: 'AI Assistant', userId: 'ai-1' },
   *   provider: { type: 'openai', apiKey: '...', model: 'gpt-4' },
   *   enableLogging: true,
   *   onReady: () => console.log('AI ready'),
   *   onError: (error) => console.error('AI error:', error)
   * });
   * ```
   */
  constructor(superdoc: SuperDocInstance, options: AIActionsOptions) {
    if (!superdoc) {
      throw new Error('AIActions requires a valid SuperDoc instance');
    }

    if (!options || typeof options !== 'object') {
      throw new Error('AIActions requires valid options configuration');
    }

    if (!options.user || !options.user.displayName || !options.user.userId) {
      throw new Error('AIActions requires valid user configuration with displayName and userId');
    }

    if (!options.provider) {
      throw new Error(ERROR_MESSAGES.NO_PROVIDER);
    }

    this.superdoc = superdoc;

    const {
      onReady,
      onStreamingStart,
      onStreamingPartialResult,
      onStreamingEnd,
      onError,
      provider,
      planner,
      ...config
    } = options;

    const aiProvider = isAIProvider(provider) ? provider : createAIProvider(provider);

    this.config = {
      systemPrompt: this.getDefaultSystemPrompt(),
      enableLogging: false,
      ...config,
      provider: aiProvider,
    };

    this.logger = new Logger(this.config.enableLogging);

    this.callbacks = {
      onReady,
      onStreamingStart,
      onStreamingPartialResult,
      onStreamingEnd,
      onError,
    };

    this.plannerOptions = planner;

    const editor = this.getEditor();
    if (!isEditorReady(editor)) {
      throw new Error(ERROR_MESSAGES.EDITOR_REQUIRED);
    }

    // Set user options on editor
    try {
      // Preserve existing user metadata (e.g., email) from editor or superdoc config
      const superdoc = this.superdoc as unknown as SuperDoc | undefined;
      const existingUser = editor.options?.user || superdoc?.config?.user;
      editor.setOptions({
        user: {
          ...existingUser,
          id: this.config.user.userId,
          name: this.config.user.displayName,
          image: this.config.user.profileUrl ?? existingUser?.image,
        },
      });
    } catch (error) {
      this.logger.warn('Failed to set editor user options', error);
      // Don't throw - editor might still work without user options
    }

    this.commands = new AIActionsService(
      this.config.provider,
      editor,
      () => this.getDocumentContext(),
      this.config.enableLogging,
      (partial) => this.callbacks.onStreamingPartialResult?.({ partialResult: partial }),
      provider.streamResults,
    );

    this.initializationPromise = this.initialize();
  }

  /**
   * Initializes the AI system and triggers onReady callback.
   * @private
   */
  private async initialize(): Promise<void> {
    try {
      this.isProviderAvailable();
      this.isReady = true;
      this.callbacks.onReady?.({ aiActions: this });
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    } finally {
      this.initializationPromise = null;
    }
  }

  /**
   * Validates that a provider is configured
   * @private
   * @throws {Error} If no provider is present
   */
  private isProviderAvailable(): void {
    if (!this.config.provider) {
      throw new Error(ERROR_MESSAGES.NO_PROVIDER);
    }
  }

  /**
   * Executes an action with full callback lifecycle support
   * @private
   * @param fn - Function that executes the action
   * @returns Promise resolving to the action result
   * @throws {Error} If editor is not available or action fails
   */
  private async executeActionWithCallbacks<T extends Result>(fn: () => Promise<T>): Promise<T> {
    const editor = this.getEditor();
    if (!isEditorReady(editor)) {
      throw new Error(ERROR_MESSAGES.NO_EDITOR_FOR_ACTION);
    }

    try {
      this.callbacks.onStreamingStart?.();
      const result: T = await fn();
      this.callbacks.onStreamingEnd?.({ fullResult: result });
      return result;
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  /**
   * Gets the default system prompt
   * @private
   * @returns Default system prompt string
   */
  private getDefaultSystemPrompt(): string {
    return `You are an AI assistant integrated with SuperDoc, a document collaboration platform.
Your role is to help users find, analyze, and understand document content.
When searching for content, provide precise locations and relevant context.`;
  }

  /**
   * Validates a prompt for completion requests
   * @private
   * @param prompt - Prompt to validate
   * @throws {Error} If prompt is invalid
   */
  private validatePrompt(prompt: string): void {
    if (!this.isReady) {
      throw new Error(ERROR_MESSAGES.NOT_READY);
    }

    if (!validateInput(prompt)) {
      throw new Error(ERROR_MESSAGES.EMPTY_PROMPT);
    }

    if (prompt.length > MAX_PROMPT_LENGTH) {
      throw new Error(ERROR_MESSAGES.PROMPT_TOO_LONG);
    }
  }

  /**
   * Builds messages array for AI completion
   * @private
   * @param prompt - User prompt
   * @returns Array of messages for AI provider
   */
  private buildMessages(prompt: string): Array<{ role: 'system' | 'user'; content: string }> {
    const documentContext = this.getDocumentContext();
    const userContent = documentContext ? `${prompt}\n\nDocument context:\n${documentContext}` : prompt;

    return [
      { role: 'system' as const, content: this.config.systemPrompt || '' },
      { role: 'user' as const, content: userContent },
    ];
  }

  /**
   * Waits for initialization to complete before allowing operations.
   * Useful when you need to ensure the AI is ready before performing actions.
   *
   * @returns Promise that resolves when initialization is complete
   */
  public async waitUntilReady(): Promise<void> {
    if (this.isReady) {
      return;
    }

    if (this.initializationPromise) {
      await this.initializationPromise;
    }
  }

  /**
   * Checks if the AI is ready to process requests.
   *
   * @returns True if ready, false otherwise
   */
  public getIsReady(): boolean {
    return this.isReady;
  }

  /**
   * Streams AI completion with real-time updates via callbacks
   * Includes document context automatically
   *
   * @param prompt - User prompt
   * @param options - Optional completion configuration
   * @returns Promise resolving to complete response
   * @throws {Error} If not ready, prompt is invalid, or streaming fails
   *
   * @example
   * ```typescript
   * const response = await ai.streamCompletion('Explain this section');
   * console.log(response);
   * ```
   */
  public async streamCompletion(prompt: string, options?: StreamOptions): Promise<string> {
    this.validatePrompt(prompt);
    const messages = this.buildMessages(prompt);

    let accumulated = '';

    try {
      this.callbacks.onStreamingStart?.();

      const stream = this.config.provider.streamCompletion(messages, options);

      for await (const chunk of stream) {
        accumulated += chunk;
        this.callbacks.onStreamingPartialResult?.({ partialResult: accumulated });
      }

      this.callbacks.onStreamingEnd?.({ fullResult: accumulated });
      return accumulated;
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  /**
   * Gets a complete AI response (non-streaming)
   * Includes document context automatically
   *
   * @param prompt - User prompt
   * @param options - Optional completion configuration
   * @returns Promise resolving to complete response
   * @throws {Error} If not ready, prompt is invalid, or completion fails
   *
   * @example
   * ```typescript
   * const response = await ai.getCompletion('Summarize this document');
   * console.log(response);
   * ```
   */
  public async getCompletion(prompt: string, options?: CompletionOptions): Promise<string> {
    this.validatePrompt(prompt);
    const messages = this.buildMessages(prompt);

    try {
      return await this.config.provider.getCompletion(messages, options);
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  /**
   * Retrieves the current document context for AI processing.
   * Priority: override > selection > full document
   *
   * @returns Document context string
   *
   * @example
   * ```typescript
   * const context = ai.getDocumentContext();
   * console.log('Current context:', context);
   * ```
   */
  public getDocumentContext(): string {
    if (this.selectionContextOverride) {
      return this.selectionContextOverride;
    }

    const editor = this.getEditor();
    const selectionText = extractSelectionText(editor, this.config.enableLogging);
    if (selectionText) {
      return selectionText;
    }

    return getDocumentText(editor, this.config.enableLogging);
  }

  /**
   * Freezes the current editor selection as the context override until cleared.
   * Useful when you need to preserve selection state across multiple operations.
   *
   * @example
   * ```typescript
   * ai.preserveCurrentSelectionContext();
   * // Selection is now preserved even if user changes selection
   * await ai.action.summarize('Summarize');
   * ai.clearSelectionContextOverride();
   * ```
   */
  public preserveCurrentSelectionContext(): void {
    const editor = this.getEditor();
    const text = extractSelectionText(editor, this.config.enableLogging);
    this.selectionContextOverride = text || null;
  }

  /**
   * Clears any preserved selection context override.
   * After this, AI will use the current editor selection/document.
   *
   * @example
   * ```typescript
   * ai.clearSelectionContextOverride();
   * // AI now uses current selection again
   * ```
   */
  public clearSelectionContextOverride(): void {
    this.selectionContextOverride = null;
  }

  /**
   * Handles errors by logging and invoking error callback
   * @private
   * @param error - Error to handle
   */
  private handleError(error: Error): void {
    const errorMessage = getErrorMessage(error);

    this.logger.error(errorMessage, error);

    this.callbacks.onError?.(error);
  }

  /**
   * Gets the active editor from the SuperDoc instance
   * @private
   * @returns Editor instance or null
   */
  private getEditor(): Editor | null {
    const superdoc = this.superdoc as unknown as SuperDoc | undefined;
    return superdoc?.activeEditor ?? null;
  }

  /**
   * Gets the AIPlanner instance for this AIActions.
   * The planner is lazily initialized on first access and reuses all configuration
   * from this AIActions instance (provider, user, callbacks, etc.).
   *
   * @returns The AIPlanner instance
   * @throws {Error} If editor is not available
   *
   * @example
   * ```typescript
   * const ai = new AIActions(superdoc, {
   *   user: { displayName: 'AI', userId: 'ai-1' },
   *   provider: { type: 'openai', apiKey: '...', model: 'gpt-4o' },
   *   planner: {
   *     maxContextLength: 8000,
   *     onProgress: (event) => console.log(event)
   *   }
   * });
   *
   * // Use the planner directly from AIActions
   * const result = await ai.planner.execute('Fix grammar issues in the selected text');
   * ```
   */
  public get planner(): AIPlanner {
    if (!this.plannerInstance) {
      const editor = this.getEditor();
      if (!isEditorReady(editor)) {
        throw new Error(ERROR_MESSAGES.NO_ACTIVE_EDITOR);
      }
      const plannerConfig: AIPlannerConfig = {
        editor,
        aiActions: this,
        provider: this.config.provider,
        enableLogging: this.config.enableLogging,
        maxContextLength: this.plannerOptions?.maxContextLength,
        documentContextProvider: this.plannerOptions?.documentContextProvider,
        tools: this.plannerOptions?.tools,
        onProgress: this.plannerOptions?.onProgress,
      };

      this.plannerInstance = new AIPlanner(plannerConfig);
    }

    return this.plannerInstance;
  }
}
