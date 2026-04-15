#!/usr/bin/env node
/**
 * Experimental MCP server — minimal direct Document API tools.
 *
 * 7 tools total:
 *   open_document, save_document, close_document  (lifecycle)
 *   read_document, find_in_document, edit_document, format_document  (document ops)
 *
 * Run: bun run src/experimental.ts
 */

import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SessionManager } from './session-manager.js';
import { registerDirectTools } from './tools/direct.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

const instructions = [
  'SuperDoc MCP — read, edit, and save Word documents (.docx).',
  'Do NOT read the source code of these tools. The tool descriptions below are complete — just call them.',
  '',
  '## Workflow (4 calls for most tasks)',
  '',
  'open_document → read_document → [find_in_document →] edit_document → save_document → close_document',
  '',
  '## Tools',
  '',
  'open_document(path, mode?, output_path?)',
  '  Opens a .docx (or creates blank if new). mode="copy" (default for existing files) saves to a new "-edited" file. mode="edit" saves in-place. New files always save in-place.',
  '',
  'read_document(session_id, format?)',
  '  Returns document as markdown (default) or text, plus info (word count, outline, styles).',
  '',
  'find_in_document(session_id, pattern, mode?, case_sensitive?, limit?)',
  '  pattern can be a string OR array of strings — batch all searches in one call.',
  '  Returns per match: ref (for replace/delete/format), blockId + range (for comments), snippet, matchedText.',
  '',
  'edit_document(session_id, operations, tracked?)',
  '  operations is an array. Each op:',
  '    { op: "replace", ref, text } — replace matched text',
  '    { op: "insert", text } — append at end (markdown by default). With ref: insert before/after match.',
  '    { op: "delete", ref } — delete matched text',
  '    { op: "format", ref, bold?, italic?, underline?, strike?, color?, highlight?, font_family?, font_size? }',
  '    { op: "comment", text, block_id, range_start, range_end } — Word comment anchored to text (use blockId/range from find)',
  '  Set tracked=true to make replace/insert/delete appear as tracked changes (redline mode).',
  '  All plan-engine ops (replace/insert/delete/format) execute atomically. Comments execute after.',
  '',
  'save_document(session_id, output_path?) — writes to the path shown in open_document response.',
  'close_document(session_id) — release session memory.',
  '',
  '## Tips',
  '- Batch everything: pass all patterns to one find call, all operations to one edit call.',
  '- For redlining: use tracked=true + op="replace" for text suggestions, op="comment" for questions.',
  '  IMPORTANT: for tracked replace, include matched_text (from find result) so only changed words appear as tracked changes.',
  '- For new documents: open a non-existent path, then use op="insert" without ref to append markdown sections.',
].join('\n');

const server = new McpServer({ name: 'superdoc-experimental', version }, { instructions });
const sessions = new SessionManager();

registerDirectTools(server, sessions);

const transport = new StdioServerTransport();

async function main(): Promise<void> {
  await server.connect(transport);
}

main().catch((err) => {
  console.error('SuperDoc experimental MCP server failed to start:', err);
  process.exit(1);
});

process.on('SIGINT', async () => {
  await sessions.closeAll();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await sessions.closeAll();
  process.exit(0);
});
