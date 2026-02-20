import {
  AIProvider,
  Editor,
  Result,
  FoundMatch,
  DocumentPosition,
  AIMessage,
  stripListPrefix,
  validateInput,
  parseJSON,
} from '../../shared';
import { EditorAdapter } from '../editor';
import { Logger } from '../../shared/logger';
import {
  buildFindPrompt,
  buildReplacePrompt,
  buildSummaryPrompt,
  buildInsertContentPrompt,
  buildInsertCommentPrompt,
  SYSTEM_PROMPTS,
} from '../../shared/prompts';

/**
 * AI-powered document actions
 * All methods are pure - they receive dependencies and return results
 */
export class AIActionsService {
  private readonly adapter: EditorAdapter;
  private readonly logger: Logger;

  constructor(
    private provider: AIProvider,
    private editor: Editor | null,
    private documentContextProvider: () => string,
    private enableLogging: boolean = false,
    private onStreamChunk?: (partialResult: string) => void,
    private readonly streamPreference?: boolean,
  ) {
    if (!this.editor) {
      throw new Error('SuperDoc editor is not available; retry once the editor is initialized');
    }
    this.adapter = new EditorAdapter(this.editor);
    this.logger = new Logger(this.enableLogging);

    if (typeof this.provider.streamResults === 'boolean') {
      this.streamPreference = this.provider.streamResults;
    }
  }

  private getDocumentContext(): string {
    if (!this.documentContextProvider) {
      return '';
    }

    try {
      return this.documentContextProvider();
    } catch (error) {
      this.logger.error(
        'Failed to retrieve document context',
        error,
        error instanceof Error ? error.message : 'Unknown error',
      );
      return '';
    }
  }

  /**
   * Executes a find query and resolves editor positions for matches.
   *
   * @param query - Natural language description of content to find
   * @param findAll - Whether to find all occurrences or just the first
   * @returns Result with found locations enriched with editor positions
   * @throws Error if query is empty
   * @private
   */
  private async executeFindQuery(query: string, findAll: boolean): Promise<Result> {
    if (!validateInput(query)) {
      throw new Error('Query cannot be empty');
    }

    const documentContext = this.getDocumentContext();

    if (!documentContext) {
      return { success: false, results: [] };
    }

    const prompt = buildFindPrompt(query, documentContext, findAll);
    const response = await this.runCompletion([
      { role: 'system', content: SYSTEM_PROMPTS.SEARCH },
      { role: 'user', content: prompt },
    ]);

    const result = parseJSON<Result>(response, { success: false, results: [] }, this.enableLogging);

    if (!result.success || !result.results) {
      return result;
    }
    result.results = this.adapter.findResults(result.results, { highlight: true });

    return result;
  }

  /**
   * Finds the first occurrence of content matching the query and resolves concrete positions via the editor adapter.
   * Automatically scrolls to bring the found text into view.
   *
   * @param query - Natural language description of content to find
   * @returns Result with found locations enriched with editor positions
   * @throws Error if query is empty
   */
  async find(query: string): Promise<Result> {
    const result = await this.executeFindQuery(query, false);

    if (result.success && result.results?.length) {
      result.results = [result.results[0]];

      // Scroll to the found text
      const firstMatch = result.results[0];
      if (firstMatch?.positions && firstMatch.positions.length > 0) {
        const { from } = firstMatch.positions[0];
        this.adapter.scrollToPosition(from);
      }
    }

    return result;
  }

  /**
   * Finds all occurrences of content matching the query.
   *
   * @param query - Natural language description of content to find
   * @returns Result with all found locations
   * @throws Error if query is empty
   */
  async findAll(query: string): Promise<Result> {
    return this.executeFindQuery(query, true);
  }

  /**
   * Finds and highlights content in the document.
   * Automatically scrolls to bring the highlighted content into view.
   *
   * @param query - Natural language description of content to highlight
   * @param color - Hex color for the highlight (default: #6CA0DC)
   * @returns Result with highlight ID if successful
   * @throws Error if query is empty or content not found
   */
  async highlight(query: string, color: string = '#6CA0DC'): Promise<Result> {
    const findResult = await this.find(query);

    if (!findResult.success) {
      return { ...findResult, success: false };
    }

    try {
      const firstMatch = findResult.results?.find((match) => match.positions && match.positions.length > 0);
      if (!firstMatch || !firstMatch.positions || !firstMatch.positions.length) {
        return { success: false, results: [] };
      }

      this.adapter.createHighlight(firstMatch.positions[0].from, firstMatch.positions[0].to, color);
      return { results: [firstMatch], success: true };
    } catch (error) {
      if (this.enableLogging) {
        this.logger.error('Failed to highlight', error);
      }
      throw error;
    }
  }

  /**
   * Fetches AI-generated replacements based on the query.
   *
   * @param query - Natural language query describing what to replace
   * @param multiple - Whether to find all occurrences or just the first
   * @param isComment - Whether this is for comments (uses different prompt)
   * @returns Array of FoundMatch results from AI, or empty array if no context or results
   * @private
   */
  private async fetchAIReplacements(
    query: string,
    multiple: boolean,
    isComment: boolean = false,
  ): Promise<FoundMatch[]> {
    const documentContext = this.getDocumentContext();

    if (!documentContext) {
      return [];
    }

    const prompt = isComment
      ? buildInsertCommentPrompt(query, documentContext, multiple)
      : buildReplacePrompt(query, documentContext, multiple);
    const response = await this.runCompletion([
      { role: 'system', content: SYSTEM_PROMPTS.EDIT },
      { role: 'user', content: prompt },
    ]);

    const parsed = parseJSON<Result>(response, { success: false, results: [] }, this.enableLogging);

    return this.sanitizeMatches(parsed.results);
  }

  /**
   * Executes a single operation on the first valid match found.
   *
   * @param searchResults - Array of search results with positions
   * @param operationFn - Function to execute the specific operation
   * @returns Array with the processed result, or empty array if no valid result
   * @throws Error if operation execution fails
   * @private
   */
  private async executeSingleOperation(
    searchResults: FoundMatch[],
    operationFn: (
      adapter: EditorAdapter,
      position: DocumentPosition,
      replacement: FoundMatch,
    ) => Promise<string | void>,
  ): Promise<FoundMatch[]> {
    const firstValidResult = searchResults.find((result) => result.positions && result.positions.length > 0);

    if (!firstValidResult) {
      return [];
    }

    try {
      const position = firstValidResult.positions![0];
      await operationFn(this.adapter, position, firstValidResult);
      return [firstValidResult];
    } catch (error) {
      if (this.enableLogging) {
        this.logger.error('Failed to execute operation', error);
      }
      throw error;
    }
  }

  /**
   * Executes an operation that may need to find locations first (like comments).
   *
   * @param query - Natural language query describing where to add comments
   * @param multiple - Whether to find all occurrences or just the first
   * @param operationFn - Function to execute the specific operation
   * @param isComment - Whether this is for comments (uses different prompt)
   * @returns Array of processed results
   * @private
   */
  private async executeOperationWithLocationFinding(
    query: string,
    multiple: boolean,
    operationFn: (
      adapter: EditorAdapter,
      position: DocumentPosition,
      replacement: FoundMatch,
    ) => Promise<string | void>,
    isComment: boolean = false,
  ): Promise<FoundMatch[]> {
    const replacements = await this.fetchAIReplacements(query, multiple, isComment);
    if (!replacements.length) {
      return [];
    }
    const searchResults = this.adapter.findResults(replacements);
    if (!multiple) {
      return await this.executeSingleOperation(searchResults, operationFn);
    }

    const allOperations = this.collectOperationsFromResults(searchResults);

    if (!allOperations.length) {
      return [];
    }

    return await this.executeMultipleOperations(allOperations, operationFn);
  }

  /**
   * Collects all operations from search results into a flat array.
   * Creates immutable copies of positions to prevent mutation.
   *
   * @param searchResults - Array of search results with positions
   * @returns Array of operations with positions and associated results
   * @private
   */
  private collectOperationsFromResults(
    searchResults: FoundMatch[],
  ): Array<{ position: DocumentPosition; result: FoundMatch }> {
    const allOperations: Array<{ position: DocumentPosition; result: FoundMatch }> = [];

    for (const result of searchResults) {
      if (!result.positions || !result.positions.length) {
        continue;
      }
      for (const position of result.positions) {
        allOperations.push({
          position: { from: position.from, to: position.to },
          result,
        });
      }
    }
    return allOperations;
  }

  /**
   * Checks if a position overlaps with any of the processed ranges.
   *
   * @param position - Position to check for overlap
   * @param processedRanges - Array of already processed ranges
   * @returns True if position overlaps with any processed range
   * @private
   */
  private hasOverlap(position: DocumentPosition, processedRanges: Array<{ from: number; to: number }>): boolean {
    return processedRanges.some((range) => position.from < range.to && position.to > range.from);
  }

  /**
   * Executes multiple operations, handling overlaps and processing in reverse order.
   * Processes positions from end to beginning to prevent position drift.
   *
   * @param allOperations - Array of all operations to process
   * @param operationFn - Function to execute the specific operation
   * @returns Array of successfully processed results
   * @throws Error if any operation execution fails
   * @private
   */
  private async executeMultipleOperations(
    allOperations: Array<{ position: DocumentPosition; result: FoundMatch }>,
    operationFn: (
      adapter: EditorAdapter,
      position: DocumentPosition,
      replacement: FoundMatch,
    ) => Promise<string | void>,
  ): Promise<FoundMatch[]> {
    // Sort positions by 'from' in descending order (end to beginning)
    // This prevents position drift - earlier positions remain valid when processing from the end
    allOperations.sort((a, b) => b.position.from - a.position.from);

    const processedRanges: Array<{ from: number; to: number }> = [];
    const processedResults: FoundMatch[] = [];

    for (const { position, result } of allOperations) {
      try {
        // Check if this position overlaps with any already processed range
        if (this.hasOverlap(position, processedRanges)) {
          continue;
        }

        await operationFn(this.adapter, { from: position.from, to: position.to }, result);
        processedRanges.push({ from: position.from, to: position.to });
        if (!processedResults.includes(result)) {
          processedResults.push(result);
        }
      } catch (error) {
        if (this.enableLogging) {
          this.logger.error('Failed to execute operation', error);
        }
        throw error;
      }
    }

    return processedResults;
  }

  /**
   * Core logic for all document operations (replace, tracked changes, comments).
   * Finds matching content and applies the operation function to each match.
   *
   * @param query - Natural language query to find content
   * @param multiple - Whether to apply to all occurrences or just the first
   * @param operationFn - Function to execute the specific operation on each match
   * @returns Array of matches with IDs of created items
   * @throws Error if query is empty
   * @private
   */
  private async executeOperation(
    query: string,
    multiple: boolean,
    operationFn: (
      adapter: EditorAdapter,
      position: DocumentPosition,
      replacement: FoundMatch,
    ) => Promise<string | void>,
  ): Promise<FoundMatch[]> {
    const replacements = await this.fetchAIReplacements(query, multiple);
    if (!replacements.length) {
      return [];
    }
    const searchResults = this.adapter.findResults(replacements);
    if (!multiple) {
      return await this.executeSingleOperation(searchResults, operationFn);
    }

    const allOperations = this.collectOperationsFromResults(searchResults);

    if (!allOperations.length) {
      return [];
    }

    return await this.executeMultipleOperations(allOperations, operationFn);
  }

  /**
   * Finds and replaces the first occurrence of content with AI-generated alternative.
   * Uses intelligent mark preservation to maintain formatting.
   *
   * @param query - Natural language query describing what to replace and how
   * @returns Result with original and suggested text for the replacement
   * @throws Error if query is empty
   */
  async replace(query: string): Promise<Result> {
    if (!validateInput(query)) {
      throw new Error('Query cannot be empty');
    }

    const matches = await this.executeOperation(query, false, (adapter, position, replacement) => {
      adapter.replaceText(position.from, position.to, replacement?.suggestedText || '');
      return Promise.resolve();
    });

    return {
      success: matches.length > 0,
      results: matches,
    };
  }

  /**
   * Finds and replaces all occurrences with AI-generated alternatives.
   * Uses intelligent mark preservation to maintain formatting for each replacement.
   *
   * @param query - Natural language query describing what to replace and how
   * @returns Result with all replacements made
   * @throws Error if query is empty
   */
  async replaceAll(query: string): Promise<Result> {
    if (!validateInput(query)) {
      throw new Error('Query cannot be empty');
    }

    const matches = await this.executeOperation(query, true, (adapter, position, replacement) => {
      adapter.replaceText(position.from, position.to, replacement?.suggestedText || '');
      return Promise.resolve();
    });

    return {
      success: matches.length > 0,
      results: matches,
    };
  }

  /**
   * Performs a deterministic literal find-and-replace using editor search commands (no AI).
   *
   * @param findText - Literal text to locate
   * @param replacementText - Text that should replace each match (empty string deletes the match)
   * @param options - Additional options such as case sensitivity
   */
  async literalReplace(
    findText: string,
    replacementText: string,
    options?: {
      caseSensitive?: boolean;
      trackChanges?: boolean;
      contentType?: 'html' | 'markdown' | 'text';
    },
  ): Promise<Result> {
    if (!validateInput(findText)) {
      throw new Error('Find text cannot be empty');
    }
    if (replacementText === undefined || replacementText === null) {
      throw new Error('Replacement text must be a string (use an empty string "" to delete text).');
    }

    const isFormattedContentType = options?.contentType === 'html' || options?.contentType === 'markdown';
    if (options?.trackChanges && isFormattedContentType) {
      throw new Error(
        `trackChanges and contentType: '${options.contentType}' cannot be used together. ` +
          'Tracked changes require plain-text insertion; HTML/Markdown content would be inserted as literal text.',
      );
    }

    const applied: FoundMatch[] = [];

    // Automatically detect if there's an active selection that matches findText
    // This optimizes by replacing directly without searching the document
    const viewState = this.editor?.view?.state ?? this.editor?.state;
    const selection = viewState?.selection;
    const doc = viewState?.doc;

    if (selection && !selection.empty && doc) {
      try {
        const selectionText = doc.textBetween(selection.from, selection.to, '', '');
        const textMatches = options?.caseSensitive
          ? selectionText === findText
          : selectionText.toLowerCase() === findText.toLowerCase();

        if (textMatches && selection.from >= 0 && selection.to <= doc.content.size) {
          // Direct replacement optimization - replace selection without search
          const isFormattedContent = options?.contentType === 'html' || options?.contentType === 'markdown';
          let changeId: string | undefined;
          if (options?.trackChanges) {
            changeId = this.adapter.createTrackedChange(selection.from, selection.to, replacementText);
          } else if (isFormattedContent) {
            this.editor?.commands?.setTextSelection?.({ from: selection.from, to: selection.to });
            this.adapter.insertFormattedContent(replacementText, {
              position: 'replace',
              contentType: options.contentType,
            });
          } else {
            this.adapter.replaceText(selection.from, selection.to, replacementText);
          }

          applied.push({
            originalText: selectionText,
            suggestedText: replacementText,
            positions: [{ from: selection.from, to: selection.to }],
            changeId,
          });

          return {
            success: true,
            results: applied,
          };
        }
      } catch (error) {
        // If selection check fails, fall through to document search
        if (this.enableLogging) {
          this.logger.warn('Selection check failed, falling back to search', error);
        }
      }
    }

    if (findText === replacementText) {
      return { success: false, results: [] };
    }

    const isFormattedReplace = options?.contentType === 'html' || options?.contentType === 'markdown';
    const replacementContainsSearch = options?.caseSensitive
      ? replacementText.includes(findText)
      : replacementText.toLowerCase().includes(findText.toLowerCase());

    // Formatted content: always single-pass. After HTML/markdown insertion the visible
    // text may still match findText (e.g., replacing "Hello" with "<b>Hello</b>"),
    // but the replacement is correct — re-matching would cause duplicate rewrites.
    const maxPasses = isFormattedReplace ? 1 : replacementContainsSearch ? 10 : 1;
    let pass = 0;

    const collectMatches = () => this.adapter.findLiteralMatches(findText, Boolean(options?.caseSensitive));

    while (pass < maxPasses) {
      const normalizedMatches = collectMatches();
      if (!normalizedMatches.length) {
        break;
      }

      const descending = [...normalizedMatches].sort((a, b) => b.from - a.from);
      const replacementsThisPass: FoundMatch[] = [];

      const isFormattedContent = options?.contentType === 'html' || options?.contentType === 'markdown';

      for (const match of descending) {
        if (options?.trackChanges) {
          const changeId = this.adapter.createTrackedChange(match.from, match.to, replacementText);
          replacementsThisPass.push({
            originalText: match.text,
            suggestedText: replacementText,
            positions: [{ from: match.from, to: match.to }],
            changeId,
          } as FoundMatch);
        } else if (isFormattedContent) {
          this.editor?.commands?.setTextSelection?.({ from: match.from, to: match.to });
          this.adapter.insertFormattedContent(replacementText, {
            position: 'replace',
            contentType: options!.contentType,
          });
          replacementsThisPass.push({
            originalText: match.text,
            suggestedText: replacementText,
            positions: [{ from: match.from, to: match.to }],
          });
        } else {
          this.adapter.replaceText(match.from, match.to, replacementText);
          replacementsThisPass.push({
            originalText: match.text,
            suggestedText: replacementText,
            positions: [{ from: match.from, to: match.to }],
          });
        }
      }

      if (!replacementsThisPass.length) {
        break;
      }

      replacementsThisPass.reverse();
      applied.push(...replacementsThisPass);
      pass++;

      if (!replacementContainsSearch) {
        break;
      }
    }

    if (!applied.length) {
      return { success: false, results: [] };
    }

    return {
      success: true,
      results: applied,
    };
  }

  /**
   * Insert a single tracked change
   */
  async insertTrackedChange(query: string): Promise<Result> {
    if (!validateInput(query)) {
      throw new Error('Query cannot be empty');
    }

    const matches = await this.executeOperation(query, false, (adapter, position, replacement) => {
      const changeId = adapter.createTrackedChange(position.from, position.to, replacement.suggestedText || '');
      return Promise.resolve(changeId);
    });

    return {
      success: matches.length > 0,
      results: matches,
    };
  }

  /**
   * Insert multiple tracked changes
   */
  async insertTrackedChanges(query: string): Promise<Result> {
    if (!validateInput(query)) {
      throw new Error('Query cannot be empty');
    }

    const matches = await this.executeOperation(query, true, (adapter, position, replacement) => {
      const changeId = adapter.createTrackedChange(position.from, position.to, replacement.suggestedText || '');
      return Promise.resolve(changeId);
    });

    return {
      success: matches.length > 0,
      results: matches,
    };
  }

  /**
   * Insert a single comment
   */
  async insertComment(query: string): Promise<Result> {
    if (!validateInput(query)) {
      throw new Error('Query cannot be empty');
    }

    const matches = await this.executeOperationWithLocationFinding(
      query,
      false,
      (adapter, position, replacement) =>
        adapter.createComment(position.from, position.to, replacement.suggestedText || ''),
      true, // isComment = true
    );

    return {
      success: matches.length > 0,
      results: matches,
    };
  }

  /**
   * Insert multiple comments
   */
  async insertComments(query: string): Promise<Result> {
    if (!validateInput(query)) {
      throw new Error('Query cannot be empty');
    }

    const matches = await this.executeOperationWithLocationFinding(
      query,
      true,
      (adapter, position, replacement) =>
        adapter.createComment(position.from, position.to, replacement.suggestedText || ''),
      true, // isComment = true
    );

    return {
      success: matches.length > 0,
      results: matches,
    };
  }

  /**
   * Performs a deterministic literal find-and-add-comment operation (no AI).
   * Finds all occurrences of the find text and adds the specified comment at each location.
   * Uses maxPasses loop to handle cases where comment text might contain the search term.
   *
   * @param findText - Literal text to locate
   * @param commentText - Comment text to add at each match location
   * @param options - Additional options such as case sensitivity
   */
  async literalInsertComment(
    findText: string,
    commentText: string,
    options?: {
      caseSensitive?: boolean;
    },
  ): Promise<Result> {
    if (!validateInput(findText)) {
      throw new Error('Find text cannot be empty');
    }
    if (commentText === undefined || commentText === null) {
      throw new Error('Comment text must be a string');
    }

    const applied: FoundMatch[] = [];

    // Check if comment text contains the search term (could create new matches)
    const commentContainsSearch = options?.caseSensitive
      ? commentText.includes(findText)
      : commentText.toLowerCase().includes(findText.toLowerCase());

    const maxPasses = commentContainsSearch ? 10 : 1;
    let pass = 0;

    const collectMatches = () => this.adapter.findLiteralMatches(findText, Boolean(options?.caseSensitive));

    while (pass < maxPasses) {
      const matches = collectMatches();
      if (!matches.length) {
        break;
      }

      // Sort descending to process from end to start (prevents position shifting issues)
      const descending = [...matches].sort((a, b) => b.from - a.from);
      const commentsThisPass: FoundMatch[] = [];

      for (const match of descending) {
        try {
          const commentId = await this.adapter.createComment(match.from, match.to, commentText);

          commentsThisPass.push({
            originalText: match.text,
            suggestedText: commentText,
            positions: [{ from: match.from, to: match.to }],
            changeId: commentId,
          } as FoundMatch);
        } catch (error) {
          if (this.enableLogging) {
            this.logger.error(`Failed to add comment at position ${match.from}-${match.to}`, error);
          }
          // Continue with other matches even if one fails
        }
      }

      if (!commentsThisPass.length) {
        break;
      }

      commentsThisPass.reverse();
      applied.push(...commentsThisPass);
      pass++;

      if (!commentContainsSearch) {
        break;
      }
    }

    return {
      success: applied.length > 0,
      results: applied,
    };
  }

  /**
   * Generates a summary of the document.
   */
  async summarize(query: string): Promise<Result> {
    const documentContext = this.getDocumentContext();

    if (!documentContext) {
      return { results: [], success: false };
    }
    const prompt = buildSummaryPrompt(query, documentContext);
    const useStreaming = this.streamPreference !== false;

    const response = await this.runCompletion(
      [
        { role: 'system', content: SYSTEM_PROMPTS.SUMMARY },
        { role: 'user', content: prompt },
      ],
      useStreaming,
    );

    const parsed = parseJSON<Result>(response, { results: [], success: false }, this.enableLogging);

    const finalText = parsed.results?.[0]?.suggestedText;
    if (finalText) {
      this.onStreamChunk?.(finalText);
    }

    return parsed;
  }

  /**
   * Inserts new content into the document.
   * @param query - Natural language query for content generation
   * @param options - in reference to the current document position, where to insert the content.
   * @returns Result with inserted content location
   */
  async insertContent(
    query: string,
    options?: { position?: 'before' | 'after' | 'replace'; contentType?: 'html' | 'markdown' | 'text' },
  ): Promise<Result> {
    if (!validateInput(query)) {
      throw new Error('Query cannot be empty');
    }

    if (!this.adapter) {
      return { success: false, results: [] };
    }

    const contentType = options?.contentType;
    const isFormattedContent = contentType === 'html' || contentType === 'markdown';

    const documentContext = this.getDocumentContext();
    const prompt = buildInsertContentPrompt(query, documentContext);

    // Disable streaming for non-text content types — partial HTML/markdown
    // fragments will produce broken DOM parsing results.
    const useStreaming = !isFormattedContent && this.streamPreference !== false;
    let streamingInsertedLength = 0;
    const insertionMode =
      options?.position === 'before' || options?.position === 'after' ? options.position : 'replace';

    const response = await this.runCompletion(
      [
        {
          role: 'system',
          content: SYSTEM_PROMPTS.CONTENT_GENERATION,
        },
        { role: 'user', content: prompt },
      ],
      useStreaming,
      async (aggregated) => {
        const extraction = extractSuggestedText(aggregated);
        if (!extraction?.available) {
          return false;
        }

        this.onStreamChunk?.(extraction.text);

        if (insertionMode === 'replace' && extraction.text.length > streamingInsertedLength) {
          const delta = extraction.text.slice(streamingInsertedLength);
          streamingInsertedLength = extraction.text.length;
          if (delta) {
            this.adapter.insertText(delta, { position: insertionMode });
          }
        }
        return true;
      },
    );

    const result = parseJSON<Result>(response, { success: false, results: [] }, this.enableLogging);

    if (!result.success || !result.results) {
      return { success: false, results: [] };
    }

    try {
      const suggestedResult = result.results[0];
      if (!suggestedResult || !suggestedResult.suggestedText) {
        return { success: false, results: [] };
      }

      let finalText: string;

      if (isFormattedContent) {
        // For HTML/markdown, use the raw text — stripListPrefix would break markdown
        // list syntax (e.g., `- item`) and could mangle HTML structure.
        finalText = suggestedResult.suggestedText;
        this.adapter.insertFormattedContent(finalText, { position: insertionMode, contentType });
        this.onStreamChunk?.(finalText);
      } else {
        // Strip list prefixes only on the plain-text path
        finalText = stripListPrefix(suggestedResult.suggestedText);
        if (useStreaming && insertionMode === 'replace') {
          if (streamingInsertedLength < finalText.length) {
            this.adapter.insertText(finalText.slice(streamingInsertedLength), { position: insertionMode });
          }
        } else {
          this.adapter.insertText(finalText, { position: insertionMode });
        }
        this.onStreamChunk?.(finalText);
      }

      return {
        success: true,
        results: [
          {
            ...suggestedResult,
            suggestedText: finalText,
          },
        ],
      };
    } catch (error) {
      if (this.enableLogging) {
        this.logger.error('Failed to insert', error);
      }
      throw error;
    }
  }

  private sanitizeMatches(matches?: FoundMatch[] | null): FoundMatch[] {
    if (!matches?.length) {
      return [];
    }

    return matches.map((match) => ({
      ...match,
      originalText: typeof match.originalText === 'string' ? stripListPrefix(match.originalText) : match.originalText,
      suggestedText:
        typeof match.suggestedText === 'string' ? stripListPrefix(match.suggestedText) : match.suggestedText,
    }));
  }

  private async runCompletion(
    messages: AIMessage[],
    stream: boolean = false,
    onStreamProgress?: (aggregated: string, chunk: string) => Promise<boolean | void> | boolean | void,
  ): Promise<string> {
    const totalChars = messages.reduce((sum, message) => sum + (message.content?.length ?? 0), 0);
    this.logger.debug('AI request', { stream, messageCount: messages.length, totalChars });

    if (!stream) {
      const response = await this.provider.getCompletion(messages);
      this.logger.debug('AI response', { stream: false, responseLength: response?.length ?? 0 });
      return response;
    }

    let aggregated = '';
    let streamed = false;

    try {
      const completionStream = this.provider.streamCompletion(messages);
      for await (const chunk of completionStream) {
        streamed = true;
        if (!chunk) {
          continue;
        }
        aggregated += chunk;
        let handled = false;
        if (onStreamProgress) {
          handled = Boolean(await onStreamProgress(aggregated, chunk));
        }
        if (!handled) {
          this.onStreamChunk?.(aggregated);
        }
      }
    } catch (error) {
      if (!aggregated) {
        const fallbackResponse = await this.provider.getCompletion(messages);
        this.logger.debug('AI response (fallback)', {
          stream: false,
          responseLength: fallbackResponse?.length ?? 0,
        });
        return fallbackResponse;
      }
      throw error;
    }

    if (!streamed || !aggregated) {
      const fallbackResponse = await this.provider.getCompletion(messages);
      this.logger.debug('AI response (fallback - no stream)', {
        stream: false,
        responseLength: fallbackResponse?.length ?? 0,
      });
      return fallbackResponse;
    }

    const trimmed = aggregated.trim();
    if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
      const fallbackResponse = await this.provider.getCompletion(messages);
      this.logger.debug('AI response (fallback - invalid format)', {
        stream: false,
        responseLength: fallbackResponse?.length ?? 0,
      });
      return fallbackResponse;
    }

    this.logger.debug('AI response', { stream: true, responseLength: aggregated.length });
    return aggregated;
  }
}

type SuggestedTextExtraction = {
  text: string;
  complete: boolean;
  available: boolean;
};

function extractSuggestedText(payload: string): SuggestedTextExtraction | null {
  const key = '"suggestedText"';
  const keyIndex = payload.lastIndexOf(key);

  if (keyIndex === -1) {
    return null;
  }

  let cursor = keyIndex + key.length;
  let colonFound = false;

  while (cursor < payload.length) {
    const char = payload[cursor];
    if (char === ':') {
      colonFound = true;
      cursor++;
      break;
    }
    if (!isWhitespace(char)) {
      return { text: '', complete: false, available: false };
    }
    cursor++;
  }

  if (!colonFound) {
    return { text: '', complete: false, available: false };
  }

  while (cursor < payload.length && isWhitespace(payload[cursor])) {
    cursor++;
  }

  if (cursor >= payload.length) {
    return { text: '', complete: false, available: false };
  }

  if (payload[cursor] !== '"') {
    return { text: '', complete: false, available: false };
  }

  cursor++; // skip opening quote

  let result = '';
  let escape = false;
  let complete = false;
  let index = cursor;

  while (index < payload.length) {
    const char = payload[index];

    if (escape) {
      if (char === 'n') {
        result += '\n';
        index++;
      } else if (char === 'r') {
        result += '\r';
        index++;
      } else if (char === 't') {
        result += '\t';
        index++;
      } else if (char === '"') {
        result += '"';
        index++;
      } else if (char === '\\') {
        result += '\\';
        index++;
      } else if (char === 'u') {
        const hex = payload.slice(index + 1, index + 5);
        if (hex.length < 4 || !/^[0-9a-fA-F]{4}$/.test(hex)) {
          return { text: result, complete: false, available: true };
        }
        result += String.fromCharCode(parseInt(hex, 16));
        index += 5;
      } else {
        result += char;
        index++;
      }
      escape = false;
      continue;
    }

    if (char === '\\') {
      escape = true;
      index++;
      continue;
    }

    if (char === '"') {
      complete = true;
      break;
    }

    result += char;
    index++;
  }

  if (escape) {
    return { text: result, complete: false, available: true };
  }

  return {
    text: result,
    complete,
    available: true,
  };
}

function isWhitespace(char: string): boolean {
  return char === ' ' || char === '\n' || char === '\r' || char === '\t';
}
