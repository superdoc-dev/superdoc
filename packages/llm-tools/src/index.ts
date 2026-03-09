export type { ToolDefinition, ToolAnnotations, JsonSchema, Executor, ToolRouter } from './types.js';
export { ALL_TOOLS } from './definitions/index.js';
export { ROUTERS } from './router/index.js';

// Re-export individual definitions
export {
  readTool,
  findTool,
  editTool,
  createTool,
  formatTool,
  tableTool,
  listTool,
  imageTool,
  commentTool,
  reviewTool,
  sectionTool,
  referenceTool,
  controlTool,
} from './definitions/index.js';

// Re-export individual routers
export {
  routeRead,
  routeFind,
  routeEdit,
  routeCreate,
  routeFormat,
  routeTable,
  routeList,
  routeImage,
  routeComment,
  routeReview,
  routeSection,
  routeReference,
  routeControl,
} from './router/index.js';

import type { Executor } from './types.js';
import { ALL_TOOLS } from './definitions/index.js';
import { ROUTERS } from './router/index.js';

/**
 * Dispatch a tool call through the routing layer.
 *
 * @param toolName - The tool name (e.g. "superdoc_edit")
 * @param params - The parameters the LLM provided (minus session_id, which the consumer handles)
 * @param execute - Transport-agnostic executor that calls Document API operations
 */
export async function dispatch(toolName: string, params: Record<string, unknown>, execute: Executor): Promise<unknown> {
  const router = ROUTERS[toolName];
  if (!router) {
    throw new Error(`Unknown tool: "${toolName}". Available tools: ${ALL_TOOLS.map((t) => t.name).join(', ')}`);
  }
  return router(params, execute);
}
