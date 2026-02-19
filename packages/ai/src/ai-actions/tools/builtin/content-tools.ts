/**
 * Content generation tools for drafting and summarizing
 * @module tools/builtin/content-tools
 */

import type { Result } from '../../../shared';
import type { AIToolDefinition, AIToolActions } from '../types';
import { ERROR_MESSAGES } from '../../../shared';

/**
 * Creates the insertContent tool for drafting and inserting new content
 *
 * @param actions - AI actions service instance
 * @returns Tool definition with handler
 */
export function createInsertContentTool(actions: AIToolActions): AIToolDefinition {
  return {
    name: 'insertContent',
    description:
      'Draft and insert new content relative to the current selection. Args.position may be "before", "after", or "replace" (default). Use for inserting headings, lists, clauses, or replacing selected text.',
    handler: async ({ instruction, step }) => {
      const args = step.args ?? {};
      const position: 'before' | 'after' | 'replace' =
        args.position === 'before' || args.position === 'after' ? args.position : 'replace';

      const action = actions.insertContent;
      if (typeof action !== 'function') {
        throw new Error(ERROR_MESSAGES.ACTION_NOT_AVAILABLE('insertContent'));
      }

      const result: Result = await action(instruction, { position });
      return {
        success: Boolean(result?.success),
        data: result,
        message: result?.success ? undefined : ERROR_MESSAGES.INSERT_CONTENT_FAILED,
      };
    },
  };
}

/**
 * Creates the summarize tool for generating summaries
 *
 * @param actions - AI actions service instance
 * @returns Tool definition with handler
 */
export function createSummarizeTool(actions: AIToolActions): AIToolDefinition {
  return {
    name: 'summarize',
    description:
      'Generate a summary or clarification of content. Use for: creating executive summaries, explaining complex sections, condensing information.',
    handler: async ({ instruction }) => {
      const action = actions.summarize;
      if (typeof action !== 'function') {
        throw new Error(ERROR_MESSAGES.ACTION_NOT_AVAILABLE('summarize'));
      }

      const result: Result = await action(instruction);
      return {
        success: Boolean(result?.success),
        data: result,
        message: result?.success ? undefined : 'Tool "summarize" could not complete the request',
      };
    },
  };
}
