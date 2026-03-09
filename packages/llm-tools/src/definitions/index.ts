import type { ToolDefinition } from '../types.js';

import { readTool } from './read.js';
import { findTool } from './find.js';
import { editTool } from './edit.js';
import { createTool } from './create.js';
import { formatTool } from './format.js';
import { tableTool } from './table.js';
import { listTool } from './list.js';
import { imageTool } from './image.js';
import { commentTool } from './comment.js';
import { reviewTool } from './review.js';
import { sectionTool } from './section.js';
import { referenceTool } from './reference.js';
import { controlTool } from './control.js';

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
};

/** All 13 intent-based tool definitions (excludes lifecycle tools which are transport-specific). */
export const ALL_TOOLS: readonly ToolDefinition[] = [
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
];
