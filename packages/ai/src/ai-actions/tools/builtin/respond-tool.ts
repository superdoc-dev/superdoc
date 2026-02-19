/**
 * Respond tool - provides textual responses without modifying the document
 * @module tools/builtin/respond-tool
 */

import type { AIToolDefinition, AIToolHandlerResult } from '../types';

/**
 * Creates the respond tool for providing textual responses
 * Use when answering questions, providing explanations, or when no document action is needed
 *
 * @returns Tool definition with handler
 */
export function createRespondTool(): AIToolDefinition {
  return {
    name: 'respond',
    description:
      'Provide a textual response without modifying the document. Use when: answering questions about the document, providing explanations, clarifying requests, or when the request cannot be fulfilled with available tools.',
    handler: async ({ instruction, step }): Promise<AIToolHandlerResult> => ({
      success: true,
      message: (step.args?.response as string | undefined) ?? instruction,
      data: null,
    }),
  };
}
