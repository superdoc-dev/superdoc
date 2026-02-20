/**
 * Find and highlight tools for locating and marking content
 * @module tools/builtin/find-tools
 */

import type { Result } from '../../../shared';
import type { AIToolDefinition, AIToolActions } from '../types';
import { ERROR_MESSAGES } from '../../../shared';

/**
 * Creates the findAll tool for locating content
 *
 * @param actions - AI actions service instance
 * @returns Tool definition with handler
 */
export function createFindAllTool(actions: AIToolActions): AIToolDefinition {
  return {
    name: 'findAll',
    description: 'Locate all occurrences of content matching the instruction.',
    handler: async ({ instruction }) => {
      const action = actions.findAll;
      if (typeof action !== 'function') {
        throw new Error(ERROR_MESSAGES.ACTION_NOT_AVAILABLE('findAll'));
      }

      const result: Result = await action(instruction);
      return {
        success: Boolean(result?.success),
        data: result,
        message: result?.success ? undefined : 'Tool "findAll" could not complete the request',
      };
    },
  };
}

/**
 * Creates the highlight tool for visually marking content
 *
 * @param actions - AI actions service instance
 * @returns Tool definition with handler
 */
export function createHighlightTool(actions: AIToolActions): AIToolDefinition {
  return {
    name: 'highlight',
    description:
      'Visually highlight text without changing it. Use for: drawing attention to issues, marking items for discussion, indicating areas of concern.',
    handler: async ({ instruction }) => {
      const action = actions.highlight;
      if (typeof action !== 'function') {
        throw new Error(ERROR_MESSAGES.ACTION_NOT_AVAILABLE('highlight'));
      }

      const result: Result = await action(instruction);
      return {
        success: Boolean(result?.success),
        data: result,
        message: result?.success ? undefined : 'Tool "highlight" could not complete the request',
      };
    },
  };
}
