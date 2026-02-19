/**
 * Comment and tracked change tools for review and feedback
 * @module tools/builtin/collaboration-tools
 */

import type { Result } from '../../../shared';
import type { AIToolDefinition, AIToolActions } from '../types';
import { ERROR_MESSAGES } from '../../../shared';

/**
 * Creates the insertTrackedChanges tool for suggesting multiple edits
 *
 * @param actions - AI actions service instance
 * @returns Tool definition with handler
 */
export function createInsertTrackedChangesTool(actions: AIToolActions): AIToolDefinition {
  return {
    name: 'insertTrackedChanges',
    description:
      'PRIMARY TOOL for suggesting multiple edits. Creates tracked changes across multiple locations. Use for: batch corrections, applying consistent changes, multiple editing suggestions.',
    handler: async ({ instruction }) => {
      const action = actions.insertTrackedChanges;
      if (typeof action !== 'function') {
        throw new Error(ERROR_MESSAGES.ACTION_NOT_AVAILABLE('insertTrackedChanges'));
      }

      const result: Result = await action(instruction);
      return {
        success: Boolean(result?.success),
        data: result,
        message: result?.success ? undefined : 'Tool "insertTrackedChanges" could not complete the request',
      };
    },
  };
}

/**
 * Creates the insertComments tool for providing feedback in multiple locations
 *
 * @param actions - AI actions service instance
 * @returns Tool definition with handler
 */
export function createInsertCommentsTool(actions: AIToolActions): AIToolDefinition {
  return {
    name: 'insertComments',
    description:
      'PRIMARY TOOL for providing feedback in multiple locations when location criteria are complex or require AI interpretation. Use for: comprehensive document review, multiple questions, batch feedback. If user provides explicit find text and comment text, use literalInsertComment instead. If comment content needs to be generated first (e.g., summarizing), break into separate steps: generate content → then comment.',
    handler: async ({ instruction }) => {
      const action = actions.insertComments;
      if (typeof action !== 'function') {
        throw new Error(ERROR_MESSAGES.ACTION_NOT_AVAILABLE('insertComments'));
      }

      const result: Result = await action(instruction);
      return {
        success: Boolean(result?.success),
        data: result,
        message: result?.success ? undefined : 'Tool "insertComments" could not complete the request',
      };
    },
  };
}

/**
 * Creates the literalInsertComment tool for deterministic comment insertion
 *
 * @param actions - AI actions service instance
 * @returns Tool definition with handler
 */
export function createLiteralInsertCommentTool(actions: AIToolActions): AIToolDefinition {
  return {
    name: 'literalInsertComment',
    description:
      'PREFERRED for explicit find-and-add-comment operations. Use when the user provides both the exact text to find AND the exact comment text to add (e.g., "add comment X anywhere Y appears", "add a comment that says Z anywhere the document references W"). Automatically handles "all" instances. Requires args.find (the exact text to find) and args.comment (the exact comment text to add, or a step reference like "$previous" or "$step-1" to use output from a previous step).',
    handler: async ({ step, previousResults }) => {
      const args = step.args ?? {};
      const findText = typeof args.find === 'string' ? args.find : '';
      const commentTextProvided = typeof args.comment === 'string';
      let commentText = commentTextProvided ? (args.comment as string) : '';
      const caseSensitive = Boolean(args.caseSensitive);

      if (!findText.trim()) {
        return {
          success: false,
          message: 'literalInsertComment requires a non-empty "find" argument',
          data: null,
        };
      }

      if (!commentTextProvided) {
        return {
          success: false,
          message: 'literalInsertComment requires a "comment" argument',
          data: null,
        };
      }

      // Check if commentText is a step reference (e.g., "$previous", "$step-1", "$summarize")
      if (commentText.startsWith('$') && previousResults && previousResults.length > 0) {
        const reference = commentText.slice(1).toLowerCase();
        let targetResult = null;

        if (reference === 'previous' || reference === 'last') {
          targetResult = previousResults[previousResults.length - 1];
        } else if (reference.startsWith('step-')) {
          const stepIndex = parseInt(reference.slice(5), 10) - 1;
          if (stepIndex >= 0 && stepIndex < previousResults.length) {
            targetResult = previousResults[stepIndex];
          }
        } else {
          targetResult =
            previousResults.find((pr) => pr.stepId === reference || pr.tool.toLowerCase() === reference) || null;
        }

        if (targetResult) {
          const resultData = targetResult.result.data as Result | undefined;
          const firstResult = Array.isArray(resultData?.results) ? resultData.results[0] : null;
          if (firstResult && typeof firstResult.suggestedText === 'string') {
            commentText = firstResult.suggestedText;
          } else if (firstResult && typeof firstResult.originalText === 'string') {
            commentText = firstResult.originalText;
          } else {
            return {
              success: false,
              message: `Step reference "${commentText}" did not yield usable text content`,
              data: null,
            };
          }
        } else {
          return {
            success: false,
            message: `Step reference "${commentText}" not found in previous results`,
            data: null,
          };
        }
      }

      const action = actions.literalInsertComment;
      if (typeof action !== 'function') {
        throw new Error(ERROR_MESSAGES.ACTION_NOT_AVAILABLE('literalInsertComment'));
      }

      const result: Result = await action(findText, commentText, {
        caseSensitive,
      });

      return {
        success: Boolean(result?.success),
        data: result,
        message: result?.success ? undefined : `No matches found for "${findText}"`,
      };
    },
  };
}
