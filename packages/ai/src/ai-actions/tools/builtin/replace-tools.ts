/**
 * Replace tools for text replacement operations
 * @module tools/builtin/replace-tools
 */

import type { Result } from '../../../shared';
import type { AIToolDefinition, AIToolActions } from '../types';
import { ERROR_MESSAGES } from '../../../shared';

/**
 * Creates the replaceAll tool for batch text replacement
 *
 * @param actions - AI actions service instance
 * @returns Tool definition with handler
 */
export function createReplaceAllTool(actions: AIToolActions): AIToolDefinition {
  return {
    name: 'replaceAll',
    description:
      'DIRECT batch editing (no tracking). Use ONLY when: user explicitly wants all instances changed immediately AND the user does NOT provide exact find/replace text pairs. If user provides exact text to find and exact replacement (e.g., "change X to Y", "replace A with B"), use literalReplace instead. Otherwise prefer insertTrackedChanges for reviewable changes.',
    handler: async ({ instruction }) => {
      const action = actions.replaceAll;
      if (typeof action !== 'function') {
        throw new Error(ERROR_MESSAGES.ACTION_NOT_AVAILABLE('replaceAll'));
      }

      const result: Result = await action(instruction);
      return {
        success: Boolean(result?.success),
        data: result,
        message: result?.success ? undefined : 'Tool "replaceAll" could not complete the request',
      };
    },
  };
}

/**
 * Creates the literalReplace tool for deterministic find-and-replace operations
 * Selection detection is now automatic - AIActionsService will check for active selection
 *
 * @param actions - AI actions service instance
 * @returns Tool definition with handler
 */
export function createLiteralReplaceTool(actions: AIToolActions): AIToolDefinition {
  return {
    name: 'literalReplace',
    description:
      'PREFERRED for explicit find-and-replace operations. Use when the user provides both the exact text to find AND the exact replacement text (e.g., "change X to Y", "replace A with B", "change all references to CompanyA to CompanyB"). Automatically handles "all" instances. Requires args.find (the exact text to find) and args.replace (the exact replacement text). Use trackChanges:true for reviewable edits, false for direct changes.',
    handler: async ({ step }) => {
      const args = step.args ?? {};
      const findText = typeof args.find === 'string' ? args.find : '';
      const replaceTextProvided = typeof args.replace === 'string';
      const replaceText = replaceTextProvided ? (args.replace as string) : '';
      const caseSensitive = Boolean(args.caseSensitive);
      const trackChanges = Boolean(args.trackChanges);

      if (!findText.trim()) {
        return {
          success: false,
          message: ERROR_MESSAGES.LITERAL_REPLACE_NO_FIND,
          data: null,
        };
      }

      if (!replaceTextProvided) {
        return {
          success: false,
          message: ERROR_MESSAGES.LITERAL_REPLACE_NO_REPLACE,
          data: null,
        };
      }

      const action = actions.literalReplace;
      if (typeof action !== 'function') {
        throw new Error(ERROR_MESSAGES.ACTION_NOT_AVAILABLE('literalReplace'));
      }

      // Selection detection is now automatic in AIActionsService
      const result: Result = await action(findText, replaceText, {
        caseSensitive,
        trackChanges,
      });

      return {
        success: Boolean(result?.success),
        data: result,
        message: result?.success ? undefined : ERROR_MESSAGES.LITERAL_REPLACE_NO_MATCHES(findText),
      };
    },
  };
}
