/**
 * Direct Document API tools — minimal, flat, designed for LLM tool calling.
 *
 * Instead of routing through SDK intent dispatch, these tools call
 * DocumentApi methods directly with simple, well-described parameters.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../session-manager.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ok(data: unknown, timing?: { ms: number }) {
  const payload = timing ? { ...(data as Record<string, unknown>), _timing: { ms: timing.ms } } : data;
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
}

function err(tool: string, error: unknown, timing?: { ms: number }) {
  const message = error instanceof Error ? error.message : String(error);
  const text = timing ? `${tool} failed (${timing.ms}ms): ${message}` : `${tool} failed: ${message}`;
  return { content: [{ type: 'text' as const, text }], isError: true };
}

// ---------------------------------------------------------------------------
// Ref decoding — extract blockId + range from query.match refs
// ---------------------------------------------------------------------------

interface DecodedRef {
  segments: Array<{ blockId: string; start: number; end: number }>;
}

function decodeRef(ref: string): DecodedRef | null {
  // Format: "text:v4:<base64json>"
  const parts = ref.split(':');
  if (parts.length < 3 || parts[0] !== 'text') return null;
  try {
    const json = Buffer.from(parts.slice(2).join(':'), 'base64').toString('utf-8');
    const parsed = JSON.parse(json);
    if (parsed.segments && Array.isArray(parsed.segments)) {
      return { segments: parsed.segments };
    }
  } catch {}
  return null;
}

// ---------------------------------------------------------------------------
// Word-level diff — computes minimal edits between two strings
// ---------------------------------------------------------------------------

interface TextEdit {
  /** Offset within the original string where the change starts */
  originalStart: number;
  /** Offset within the original string where the change ends */
  originalEnd: number;
  /** Replacement text for the changed portion */
  replacement: string;
}

/** A token with its character offset in the source string. */
interface Token {
  text: string;
  start: number;
  end: number;
}

/** Tokenize string into words preserving whitespace boundaries and char offsets. */
function tokenize(s: string): Token[] {
  const tokens: Token[] = [];
  const re = /\S+|\s+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    tokens.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return tokens;
}

/**
 * Compute LCS table for two token arrays (by text equality).
 * Returns the DP table for backtracking.
 */
function lcsTable(a: Token[], b: Token[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1].text === b[j - 1].text) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp;
}

/**
 * Backtrack through LCS table to produce edit operations.
 * Yields grouped edits: consecutive non-LCS tokens are merged into single edits.
 */
function computeMinimalEdits(original: string, replacement: string): TextEdit[] {
  if (original === replacement) return [];

  const aTokens = tokenize(original);
  const bTokens = tokenize(replacement);

  // Edge case: empty original
  if (aTokens.length === 0) {
    return [{ originalStart: 0, originalEnd: 0, replacement }];
  }
  // Edge case: empty replacement
  if (bTokens.length === 0) {
    return [{ originalStart: 0, originalEnd: original.length, replacement: '' }];
  }

  const dp = lcsTable(aTokens, bTokens);

  // Backtrack to find aligned pairs
  type Action =
    | { type: 'keep'; ai: number; bi: number }
    | { type: 'delete'; ai: number }
    | { type: 'insert'; bi: number };
  const actions: Action[] = [];
  let i = aTokens.length;
  let j = bTokens.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && aTokens[i - 1].text === bTokens[j - 1].text) {
      actions.push({ type: 'keep', ai: i - 1, bi: j - 1 });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      actions.push({ type: 'insert', bi: j - 1 });
      j--;
    } else {
      actions.push({ type: 'delete', ai: i - 1 });
      i--;
    }
  }
  actions.reverse();

  // Group consecutive non-keep actions into TextEdits
  const edits: TextEdit[] = [];
  let idx = 0;
  while (idx < actions.length) {
    if (actions[idx].type === 'keep') {
      idx++;
      continue;
    }

    // Collect consecutive delete/insert actions
    let origStart = Infinity;
    let origEnd = -1;
    const insertParts: string[] = [];

    while (idx < actions.length && actions[idx].type !== 'keep') {
      const act = actions[idx];
      if (act.type === 'delete') {
        const tok = aTokens[act.ai];
        origStart = Math.min(origStart, tok.start);
        origEnd = Math.max(origEnd, tok.end);
      } else if (act.type === 'insert') {
        insertParts.push(bTokens[act.bi].text);
      }
      idx++;
    }

    // Pure insertion (no deletion) — insert at the original position
    if (origStart === Infinity) {
      // Find insertion point: right after the last kept token before this group, or at start
      let insertAt = 0;
      for (let k = idx - 1; k >= 0; k--) {
        if (actions[k].type === 'keep') {
          insertAt = aTokens[(actions[k] as any).ai].end;
          break;
        }
      }
      edits.push({ originalStart: insertAt, originalEnd: insertAt, replacement: insertParts.join('') });
    } else {
      edits.push({ originalStart: origStart, originalEnd: origEnd, replacement: insertParts.join('') });
    }
  }

  // Post-process: merge edits that are separated by only whitespace or very short gaps.
  // This avoids fragmented tracked changes that look messy in Word.
  const merged: TextEdit[] = [];
  for (const edit of edits) {
    if (merged.length === 0) {
      merged.push(edit);
      continue;
    }
    const prev = merged[merged.length - 1];
    const gap = original.slice(prev.originalEnd, edit.originalStart);
    // Merge if gap is only whitespace/punctuation (3 chars or less) or empty
    if (gap.length <= 3 && /^[\s,;.]*$/.test(gap)) {
      prev.originalEnd = edit.originalEnd;
      prev.replacement = prev.replacement + gap + edit.replacement;
    } else {
      merged.push(edit);
    }
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------

function timed<T>(fn: () => T): { result: T; ms: number } {
  const start = performance.now();
  const result = fn();
  return { result, ms: Math.round(performance.now() - start) };
}

async function timedAsync<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = performance.now();
  const result = await fn();
  return { result, ms: Math.round(performance.now() - start) };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerDirectTools(server: McpServer, sessions: SessionManager): void {
  // -------------------------------------------------------------------------
  // open_document — open a .docx file
  // -------------------------------------------------------------------------
  server.registerTool(
    'open_document',
    {
      title: 'Open Document',
      description: [
        'Open a Word document (.docx) for reading and editing. Returns a session_id to use in all subsequent calls.',
        '',
        'mode controls where save_document writes:',
        '- "copy" (default): saves to a new file next to the original (e.g. "report-edited.docx"). Original is never modified.',
        '- "edit": saves in-place, overwriting the original file.',
        '',
        'You can also set output_path to choose exactly where to save.',
      ].join('\n'),
      inputSchema: {
        path: z.string().describe('Absolute path to the .docx file.'),
        mode: z
          .enum(['copy', 'edit'])
          .optional()
          .describe('"copy" (default) saves to a new file. "edit" saves in-place to the original.'),
        output_path: z.string().optional().describe('Explicit save path. Overrides mode.'),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ path, mode, output_path }) => {
      try {
        const { result: session, ms } = await timedAsync(() =>
          sessions.open(path, { mode: mode ?? 'copy', outputPath: output_path }),
        );
        return ok(
          {
            session_id: session.id,
            source: session.sourcePath,
            save_to: session.savePath,
            mode: session.savePath === session.sourcePath ? 'edit' : 'copy',
          },
          { ms },
        );
      } catch (e) {
        return err('open_document', e);
      }
    },
  );

  // -------------------------------------------------------------------------
  // save_document — save changes to disk
  // -------------------------------------------------------------------------
  server.registerTool(
    'save_document',
    {
      title: 'Save Document',
      description:
        'Save the document to disk. Writes to the path shown in open_document\'s "save_to" field. Use output_path to override.',
      inputSchema: {
        session_id: z.string().describe('Session ID from open_document.'),
        output_path: z
          .string()
          .optional()
          .describe('Override the save path. If omitted, uses the path from open_document.'),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ session_id, output_path }) => {
      try {
        const { result, ms } = await timedAsync(() => sessions.save(session_id, output_path));
        return ok(result, { ms });
      } catch (e) {
        return err('save_document', e);
      }
    },
  );

  // -------------------------------------------------------------------------
  // close_document — release session
  // -------------------------------------------------------------------------
  server.registerTool(
    'close_document',
    {
      title: 'Close Document',
      description: 'Close a document session and release memory. Unsaved changes will be lost.',
      inputSchema: {
        session_id: z.string().describe('Session ID to close.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ session_id }) => {
      try {
        await sessions.close(session_id);
        return ok({ closed: true });
      } catch (e) {
        return err('close_document', e);
      }
    },
  );

  // -------------------------------------------------------------------------
  // read_document — get document content and structure
  // -------------------------------------------------------------------------
  server.registerTool(
    'read_document',
    {
      title: 'Read Document',
      description: [
        'Read the document content. Returns markdown text and document info (word count, outline, styles).',
        'Always call this after opening a document to understand its content before making changes.',
      ].join(' '),
      inputSchema: {
        session_id: z.string().describe('Session ID from open_document.'),
        format: z
          .enum(['markdown', 'text'])
          .optional()
          .describe('Output format. "markdown" (default) preserves headings/lists/bold/italic. "text" is plain text.'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ session_id, format }) => {
      try {
        const { api } = sessions.get(session_id);
        const { result: data, ms } = timed(() => {
          const outputFormat = format ?? 'markdown';
          const content = outputFormat === 'markdown' ? api.getMarkdown({}) : api.getText({});
          const info = api.info({});
          return { content, info };
        });
        return ok(data, { ms });
      } catch (e) {
        return err('read_document', e);
      }
    },
  );

  // -------------------------------------------------------------------------
  // find_in_document — batch search for text, returns refs for mutations
  // -------------------------------------------------------------------------
  server.registerTool(
    'find_in_document',
    {
      title: 'Find in Document',
      description: [
        'Search for one or more text patterns in the document in a single call.',
        'Pass a single pattern string OR an array of patterns to search for multiple things at once.',
        'Returns matches grouped by pattern, each with a ref that can be passed to edit_document or format_document.',
      ].join(' '),
      inputSchema: {
        session_id: z.string().describe('Session ID from open_document.'),
        pattern: z
          .union([z.string(), z.array(z.string())])
          .describe(
            'Text to search for. A single string or an array of strings to find multiple patterns in one call.',
          ),
        mode: z
          .enum(['contains', 'regex'])
          .optional()
          .describe(
            '"contains" (default) for substring match. "regex" for regular expression. Applies to all patterns.',
          ),
        case_sensitive: z
          .boolean()
          .optional()
          .describe('Case sensitive search. Default false. Applies to all patterns.'),
        limit: z.number().optional().describe('Max results per pattern. Default 10.'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ session_id, pattern, mode, case_sensitive, limit }) => {
      try {
        const start = performance.now();
        const { api } = sessions.get(session_id);
        const patterns = Array.isArray(pattern) ? pattern : [pattern];
        const perPatternLimit = limit ?? 10;
        const searchMode = mode ?? 'contains';
        const isCaseSensitive = case_sensitive ?? false;

        const results: Record<string, unknown> = {};

        for (const p of patterns) {
          const result = api.query.match({
            select: {
              type: 'text',
              pattern: p,
              mode: searchMode,
              caseSensitive: isCaseSensitive,
            },
            limit: perPatternLimit,
          });

          const matches = result.items.map((item: any) => {
            const base: Record<string, unknown> = {
              ref: item.handle.ref,
              snippet: item.snippet ?? undefined,
              highlightRange: item.highlightRange ?? undefined,
            };

            if (item.blocks && item.blocks.length > 0) {
              base.matchedText = item.blocks.map((b: any) => b.text).join('');
              base.blockCount = item.blocks.length;
              // Include first block's address for comment targeting
              const first = item.blocks[0];
              base.blockId = first.blockId;
              base.range = first.range;
            }

            return base;
          });

          results[p] = { total: result.total, matches };
        }

        const ms = Math.round(performance.now() - start);
        return ok(results, { ms });
      } catch (e) {
        return err('find_in_document', e);
      }
    },
  );

  // -------------------------------------------------------------------------
  // edit_document — batch insert, replace, delete, and format
  // -------------------------------------------------------------------------

  const operationSchema = z.object({
    op: z
      .enum(['replace', 'insert', 'delete', 'format', 'comment'])
      .describe(
        'Operation type: "replace", "insert", "delete", "format" text at ref, or "comment" to add a comment anchored to matched text.',
      ),
    ref: z
      .string()
      .optional()
      .describe(
        'Ref from find_in_document. Required for replace, delete, format. Optional for insert (omit to append at end). Not used for comment (use blockId+range instead).',
      ),
    text: z.string().optional().describe('Text content. Required for replace, insert, and comment.'),
    matched_text: z
      .string()
      .optional()
      .describe(
        'For tracked replace: the original matchedText from find_in_document. Enables word-level tracked changes instead of whole-paragraph replacement.',
      ),
    position: z
      .enum(['before', 'after'])
      .optional()
      .describe('For insert with ref: insert "before" or "after" the matched text. Default "after".'),
    block_id: z.string().optional().describe('For comment: blockId from find_in_document match.'),
    range_start: z.number().optional().describe('For comment: range.start from find_in_document match.'),
    range_end: z.number().optional().describe('For comment: range.end from find_in_document match.'),
    bold: z.boolean().optional().describe('Format: bold.'),
    italic: z.boolean().optional().describe('Format: italic.'),
    underline: z.boolean().optional().describe('Format: underline.'),
    strike: z.boolean().optional().describe('Format: strikethrough.'),
    color: z.string().optional().describe('Format: text color hex, e.g. "#ff0000".'),
    highlight: z.string().optional().describe('Format: highlight color hex.'),
    font_family: z.string().optional().describe('Format: font family, e.g. "Arial".'),
    font_size: z.number().optional().describe('Format: font size in half-points (24 = 12pt).'),
  });

  server.registerTool(
    'edit_document',
    {
      title: 'Edit Document',
      description: [
        'Apply one or more edits to the document in a single call.',
        '',
        'Pass an array of operations. Each operation has an "op" field:',
        '- "replace": Replace text at ref with new text.',
        '- "insert": Insert text before/after ref, or append at document end if no ref (default format: markdown). Use ref-less inserts to build documents from scratch.',
        '- "delete": Delete text at ref.',
        '- "format": Apply formatting (bold, italic, color, etc.) to text at ref.',
        '- "comment": Add a comment anchored to matched text. Uses blockId + range from find_in_document.',
        '',
        'Use find_in_document first to get refs (and blockId/range for comments), then pass them here.',
        'Replace/insert/delete/format operations are applied atomically. Comments are applied after.',
        '',
        'Set tracked=true to apply replace/insert/delete as tracked changes (suggestions) instead of direct edits.',
      ].join('\n'),
      inputSchema: {
        session_id: z.string().describe('Session ID from open_document.'),
        operations: z.array(operationSchema).describe('Array of edit operations to apply atomically.'),
        tracked: z
          .boolean()
          .optional()
          .describe(
            'If true, replace/insert/delete are applied as tracked changes (suggestions visible in Word). Default false (direct edits).',
          ),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ session_id, operations, tracked }) => {
      try {
        const start = performance.now();
        const { api } = sessions.get(session_id);

        // Separate operations into plan-engine steps vs direct API calls
        const steps: Array<Record<string, unknown>> = [];
        const directInserts: Array<{ idx: number; text: string; type?: string }> = [];
        let stepIdx = 0;

        for (let i = 0; i < operations.length; i++) {
          const operation = operations[i];
          const id = `s${stepIdx++}`;

          switch (operation.op) {
            case 'replace': {
              if (!operation.ref) throw new Error(`Step ${id}: ref is required for replace.`);
              if (!operation.text) throw new Error(`Step ${id}: text is required for replace.`);

              // When tracked + matched_text provided, compute word-level diff
              // so only changed words show as tracked changes (not whole paragraph)
              if (tracked && operation.matched_text) {
                const decoded = decodeRef(operation.ref);
                if (decoded && decoded.segments.length === 1) {
                  const seg = decoded.segments[0];
                  const edits = computeMinimalEdits(operation.matched_text, operation.text);

                  if (edits.length > 0) {
                    // Create targeted steps for each changed region
                    for (const edit of edits) {
                      const editId = `s${stepIdx++}`;
                      const target = {
                        kind: 'selection',
                        start: { kind: 'text', blockId: seg.blockId, offset: seg.start + edit.originalStart },
                        end: { kind: 'text', blockId: seg.blockId, offset: seg.start + edit.originalEnd },
                      };

                      if (edit.replacement === '') {
                        // Pure deletion — use text.delete (text.rewrite with empty string fails)
                        steps.push({ id: editId, op: 'text.delete', where: { by: 'target', target }, args: {} });
                      } else if (edit.originalStart === edit.originalEnd) {
                        // Pure insertion — use text.insert
                        steps.push({
                          id: editId,
                          op: 'text.insert',
                          where: { by: 'target', target },
                          args: { position: 'after', content: { text: edit.replacement } },
                        });
                      } else {
                        // Replace — use text.rewrite
                        steps.push({
                          id: editId,
                          op: 'text.rewrite',
                          where: { by: 'target', target },
                          args: { replacement: { text: edit.replacement } },
                        });
                      }
                    }
                    break;
                  }
                }
              }

              // Fallback: replace the whole match
              steps.push({
                id,
                op: 'text.rewrite',
                where: { by: 'ref', ref: operation.ref },
                args: { replacement: { text: operation.text } },
              });
              break;
            }
            case 'insert': {
              if (!operation.text) throw new Error(`Step ${id}: text is required for insert.`);
              if (!operation.ref) {
                // Ref-less insert — append at end via direct API (after plan executes)
                directInserts.push({ idx: i, text: operation.text, type: operation.position });
              } else {
                steps.push({
                  id,
                  op: 'text.insert',
                  where: { by: 'ref', ref: operation.ref },
                  args: { position: operation.position ?? 'after', content: { text: operation.text } },
                });
              }
              break;
            }
            case 'delete': {
              if (!operation.ref) throw new Error(`Step ${id}: ref is required for delete.`);
              steps.push({
                id,
                op: 'text.delete',
                where: { by: 'ref', ref: operation.ref },
                args: {},
              });
              break;
            }
            case 'format': {
              if (!operation.ref) throw new Error(`Step ${id}: ref is required for format.`);
              const inline: Record<string, unknown> = {};
              if (operation.bold !== undefined) inline.bold = operation.bold;
              if (operation.italic !== undefined) inline.italic = operation.italic;
              if (operation.underline !== undefined) inline.underline = operation.underline;
              if (operation.strike !== undefined) inline.strike = operation.strike;
              if (operation.color !== undefined) inline.color = operation.color;
              if (operation.highlight !== undefined) inline.highlight = operation.highlight;
              if (operation.font_family !== undefined) inline.fontFamily = operation.font_family;
              if (operation.font_size !== undefined) inline.fontSize = operation.font_size;
              if (Object.keys(inline).length === 0) {
                throw new Error(`Step ${id}: at least one formatting property required for format.`);
              }
              steps.push({
                id,
                op: 'format.apply',
                where: { by: 'ref', ref: operation.ref },
                args: { inline },
              });
              break;
            }
            case 'comment': {
              // Comments are handled separately after plan execution
              break;
            }
          }
        }

        // Execute plan steps (replace/insert/delete/format) if any
        const results: Array<Record<string, unknown>> = [];

        if (steps.length > 0) {
          const receipt = api.mutations.apply({
            atomic: true,
            changeMode: tracked ? 'tracked' : 'direct',
            steps,
          } as any);

          for (const s of (receipt as any).steps ?? []) {
            results.push({ stepId: s.stepId, op: s.op, effect: s.effect });
          }
        }

        // Execute comment operations
        for (const operation of operations) {
          if (operation.op !== 'comment') continue;
          if (!operation.text) throw new Error('text is required for comment.');
          if (!operation.block_id || operation.range_start === undefined || operation.range_end === undefined) {
            throw new Error(
              'block_id, range_start, and range_end are required for comment. Use blockId and range from find_in_document.',
            );
          }
          const commentReceipt = api.comments.create({
            text: operation.text,
            target: {
              kind: 'text',
              blockId: operation.block_id,
              range: { start: operation.range_start, end: operation.range_end },
            },
          });
          results.push({ op: 'comment', effect: commentReceipt.success ? 'changed' : 'error' });
        }

        // Execute ref-less inserts (appends) in order — for document creation
        for (const ins of directInserts) {
          const receipt = api.insert({ value: ins.text, type: ins.type ?? 'markdown' } as any);
          results.push({ op: 'insert', effect: receipt.success ? 'changed' : 'error' });
        }

        const ms = Math.round(performance.now() - start);
        return ok({ success: true, stepCount: results.length, results }, { ms });
      } catch (e) {
        return err('edit_document', e);
      }
    },
  );
}
