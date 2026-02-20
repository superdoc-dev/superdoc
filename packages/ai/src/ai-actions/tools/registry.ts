/**
 * Tool registry for managing built-in and custom tools
 * @module tools/registry
 */

import type { AIToolDefinition, AIToolName, AIToolActions } from './types';
import {
  createFindAllTool,
  createHighlightTool,
  createReplaceAllTool,
  createLiteralReplaceTool,
  createInsertTrackedChangesTool,
  createInsertCommentsTool,
  createLiteralInsertCommentTool,
  createInsertContentTool,
  createSummarizeTool,
  createRespondTool,
} from './builtin';

/**
 * Creates a tool registry with built-in and optional custom tools
 * Custom tools can override built-in ones
 *
 * @param actions - AI actions service instance
 * @param customTools - Optional array of custom tool definitions
 * @returns Map of tool names to their definitions
 */
export function createToolRegistry(
  actions: AIToolActions,
  customTools?: AIToolDefinition[],
): Map<AIToolName, AIToolDefinition> {
  // Built-in tools in order of importance
  const entries: AIToolDefinition[] = [
    // === REDLINING & REVIEW TOOLS (Use these for suggestions, edits, feedback) ===
    createInsertTrackedChangesTool(actions),
    createInsertCommentsTool(actions),

    // === DRAFTING TOOLS (Use for creating new content) ===
    createInsertContentTool(actions),
    createSummarizeTool(actions),

    // === DIRECT EDITING TOOLS (Use only when user explicitly wants immediate changes) ===
    createReplaceAllTool(actions),
    createLiteralReplaceTool(actions),
    createLiteralInsertCommentTool(actions),

    // === SEARCH & HIGHLIGHT TOOLS ===
    createFindAllTool(actions),
    createHighlightTool(actions),

    // === RESPONSE TOOL (Use for questions, clarifications, or when no document action is needed) ===
    createRespondTool(),
  ];

  // Allow custom tools to override built-in ones
  if (customTools?.length) {
    for (const tool of customTools) {
      const existingIndex = entries.findIndex((entry) => entry.name === tool.name);
      if (existingIndex >= 0) {
        // Replace existing tool
        entries.splice(existingIndex, 1, tool);
      } else {
        // Add new tool
        entries.push(tool);
      }
    }
  }

  return new Map(entries.map((tool) => [tool.name, tool]));
}

/**
 * Gets an array of tool descriptions for use in system prompts
 *
 * @param toolRegistry - Map of registered tools
 * @returns Formatted string of tool descriptions
 */
export function getToolDescriptions(toolRegistry: Map<AIToolName, AIToolDefinition>): string {
  return Array.from(toolRegistry.values())
    .map((tool) => `- ${tool.name}: ${tool.description}`)
    .join('\n');
}

/**
 * Validates a tool definition
 *
 * @param tool - Tool definition to validate
 * @returns True if valid, false otherwise
 */
export function isValidTool(tool: unknown): tool is AIToolDefinition {
  if (!tool || typeof tool !== 'object') {
    return false;
  }

  const toolObj = tool as Record<string, unknown>;
  return (
    typeof toolObj.name === 'string' &&
    toolObj.name.length > 0 &&
    typeof toolObj.description === 'string' &&
    typeof toolObj.handler === 'function'
  );
}
