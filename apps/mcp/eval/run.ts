#!/usr/bin/env bun
/**
 * SuperDoc Tool Eval — compares experimental MCP tools vs SDK intent tools (the 9 shipped tools).
 *
 * Uses the Anthropic API directly with both tool sets, same Document API underneath.
 * Measures: tool calls, errors, timing, output quality.
 *
 * Usage: bun run apps/mcp/eval/run.ts [--task <id>] [--config <experimental|sdk>]
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { Editor } from 'superdoc/super-editor';
import { getDocumentApiAdapters } from '@superdoc/super-editor/document-api-adapters';
import { createDocumentApi, type DocumentApi } from '@superdoc/document-api';
import { BLANK_DOCX_BASE64 } from '@superdoc/super-editor/blank-docx';
import { tasks, type Task } from './tasks.js';
import { getSDKIntentTools, getSDKIntentSystemPrompt } from './sdk-intent-tools.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ToolCall {
  name: string;
  input: Record<string, unknown>;
  output: string;
  error?: string;
  ms: number;
}

interface RunResult {
  taskId: string;
  config: string;
  toolCalls: ToolCall[];
  errors: number;
  totalMs: number;
  tokenUsage: { input: number; output: number };
  finalText: string;
  finalInfo: { comments: number; trackedChanges: number; words: number };
}

interface Score {
  toolCalls: number;
  errors: number;
  efficiency: boolean;
  containsExpected: boolean;
  excludesUnwanted: boolean;
  commentsOk: boolean;
  trackedChangesOk: boolean;
  pass: boolean;
}

// ---------------------------------------------------------------------------
// Document engine wrapper
// ---------------------------------------------------------------------------

async function openDoc(
  filePath: string,
): Promise<{ api: DocumentApi; editor: any; exportDoc: () => Promise<Uint8Array> }> {
  let bytes: Buffer;
  if (filePath && existsSync(filePath)) {
    bytes = Buffer.from(readFileSync(filePath));
  } else {
    bytes = Buffer.from(BLANK_DOCX_BASE64, 'base64');
  }

  const editor = await Editor.open(bytes, {
    documentId: filePath || '/tmp/eval-blank.docx',
    user: { id: 'eval', name: 'Eval Harness' },
  });

  const adapters = getDocumentApiAdapters(editor);
  const api = createDocumentApi(adapters);

  return {
    api,
    editor,
    exportDoc: async () => {
      const exported = await editor.exportDocument();
      if (exported instanceof Uint8Array) return exported;
      if (exported instanceof ArrayBuffer) return new Uint8Array(exported);
      if (ArrayBuffer.isView(exported))
        return new Uint8Array(exported.buffer, exported.byteOffset, exported.byteLength);
      throw new Error('Unexpected export type');
    },
  };
}

// ---------------------------------------------------------------------------
// Experimental tool definitions (Anthropic format)
// ---------------------------------------------------------------------------

function getExperimentalTools(): Anthropic.Tool[] {
  return [
    {
      name: 'read_document',
      description:
        'Read the document content as markdown + metadata (word count, outline, styles). Call this first to understand the document.',
      input_schema: {
        type: 'object' as const,
        properties: {
          format: { type: 'string', enum: ['markdown', 'text'], description: 'Output format. Default: markdown.' },
        },
      },
    },
    {
      name: 'find_in_document',
      description:
        'Search for text patterns. Pass a single string or array of strings. Returns matches with ref (for edits), blockId + range (for comments), matchedText.',
      input_schema: {
        type: 'object' as const,
        properties: {
          pattern: {
            description: 'String or array of strings to search for.',
            oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
          },
          case_sensitive: { type: 'boolean', description: 'Default false.' },
        },
        required: ['pattern'],
      },
    },
    {
      name: 'edit_document',
      description:
        'Apply edits. Operations: replace (ref+text), insert (text, appends if no ref), delete (ref), format (ref+bold/italic/etc), comment (text+block_id+range_start+range_end). Set tracked=true for tracked changes. Include matched_text on replace for word-level tracked changes.',
      input_schema: {
        type: 'object' as const,
        properties: {
          operations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                op: { type: 'string', enum: ['replace', 'insert', 'delete', 'format', 'comment'] },
                ref: { type: 'string' },
                text: { type: 'string' },
                matched_text: { type: 'string' },
                block_id: { type: 'string' },
                range_start: { type: 'number' },
                range_end: { type: 'number' },
                bold: { type: 'boolean' },
                italic: { type: 'boolean' },
                underline: { type: 'boolean' },
                color: { type: 'string' },
                highlight: { type: 'string' },
              },
              required: ['op'],
            },
          },
          tracked: { type: 'boolean', description: 'If true, edits appear as tracked changes.' },
        },
        required: ['operations'],
      },
    },
    {
      name: 'save_document',
      description: 'Save the document to disk.',
      input_schema: { type: 'object' as const, properties: {} },
    },
  ];
}

function getExperimentalSystemPrompt(): string {
  return `You are editing a Word document. Tools available: read_document, find_in_document, edit_document, save_document.
Workflow: read → find (batch patterns) → edit (batch operations) → save.
Batch everything: pass all patterns to one find call, all operations to one edit call.
For tracked changes: use tracked=true and include matched_text on replace operations.
For comments: use op="comment" with block_id, range_start, range_end from find results.`;
}

// ---------------------------------------------------------------------------
// SDK tool definitions (from tools.anthropic.json)
// ---------------------------------------------------------------------------

function getSDKTools(): Anthropic.Tool[] {
  const tools = getSDKIntentTools();
  console.log(`  (SDK: ${tools.length} intent tools)`);
  return tools;
}

function getSDKSystemPrompt(): string {
  return getSDKIntentSystemPrompt();
}

// ---------------------------------------------------------------------------
// Tool dispatch — routes tool calls to the Document API
// ---------------------------------------------------------------------------

function dispatchExperimental(api: DocumentApi, name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'read_document': {
      const format = (input.format as string) ?? 'markdown';
      const content = format === 'markdown' ? api.getMarkdown({}) : api.getText({});
      const info = api.info({});
      return JSON.stringify({ content: content.slice(0, 3000), info });
    }
    case 'find_in_document': {
      const patterns = Array.isArray(input.pattern) ? input.pattern : [input.pattern as string];
      const results: Record<string, unknown> = {};
      for (const p of patterns) {
        const result = api.query.match({
          select: {
            type: 'text',
            pattern: p,
            mode: 'contains',
            caseSensitive: (input.case_sensitive as boolean) ?? false,
          },
          limit: 10,
        });
        results[p] = {
          total: result.total,
          matches: result.items.map((item: any) => ({
            ref: item.handle.ref,
            matchedText: item.blocks?.[0]?.text ?? '',
            blockId: item.blocks?.[0]?.blockId,
            range: item.blocks?.[0]?.range,
          })),
        };
      }
      return JSON.stringify(results);
    }
    case 'edit_document': {
      const ops = input.operations as any[];
      const tracked = input.tracked as boolean;
      const results: any[] = [];

      // Plan steps for replace/delete/format
      const steps: any[] = [];
      let stepIdx = 0;

      for (const op of ops) {
        switch (op.op) {
          case 'replace':
            steps.push({
              id: `s${stepIdx++}`,
              op: 'text.rewrite',
              where: { by: 'ref', ref: op.ref },
              args: { replacement: { text: op.text } },
            });
            break;
          case 'delete':
            steps.push({ id: `s${stepIdx++}`, op: 'text.delete', where: { by: 'ref', ref: op.ref }, args: {} });
            break;
          case 'format': {
            const inline: Record<string, unknown> = {};
            if (op.bold !== undefined) inline.bold = op.bold;
            if (op.italic !== undefined) inline.italic = op.italic;
            if (op.underline !== undefined) inline.underline = op.underline;
            if (op.color !== undefined) inline.color = op.color;
            if (op.highlight !== undefined) inline.highlight = op.highlight;
            steps.push({
              id: `s${stepIdx++}`,
              op: 'format.apply',
              where: { by: 'ref', ref: op.ref },
              args: { inline },
            });
            break;
          }
          case 'insert':
            if (!op.ref) {
              api.insert({ value: op.text, type: 'markdown' } as any);
              results.push({ op: 'insert', effect: 'changed' });
            } else {
              steps.push({
                id: `s${stepIdx++}`,
                op: 'text.insert',
                where: { by: 'ref', ref: op.ref },
                args: { position: 'after', content: { text: op.text } },
              });
            }
            break;
          case 'comment':
            try {
              api.comments.create({
                text: op.text,
                target: { kind: 'text', blockId: op.block_id, range: { start: op.range_start, end: op.range_end } },
              });
              results.push({ op: 'comment', effect: 'changed' });
            } catch (e: any) {
              results.push({ op: 'comment', effect: 'error', error: e.message });
            }
            break;
        }
      }

      if (steps.length > 0) {
        try {
          const receipt = api.mutations.apply({
            atomic: true,
            changeMode: tracked ? 'tracked' : 'direct',
            steps,
          } as any);
          for (const s of (receipt as any).steps ?? []) {
            results.push({ stepId: s.stepId, op: s.op, effect: s.effect });
          }
        } catch (e: any) {
          results.push({ error: e.message });
        }
      }

      return JSON.stringify({ success: true, results });
    }
    case 'save_document':
      return JSON.stringify({ saved: true });
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

function dispatchSDK(api: DocumentApi, name: string, input: Record<string, unknown>): string {
  const action = input.action as string | undefined;

  try {
    switch (name) {
      case 'superdoc_search': {
        if (input.type === 'text') {
          const result = api.query.match({
            select: {
              type: 'text',
              pattern: input.pattern as string,
              mode: (input.mode as any) ?? 'contains',
              caseSensitive: (input.caseSensitive as boolean) ?? false,
            },
            limit: (input.limit as number) ?? 10,
            require: input.require as any,
          });
          return JSON.stringify({
            total: result.total,
            items: result.items
              .slice(0, 10)
              .map((i: any) => ({
                ref: i.handle?.ref,
                matchedText: i.blocks?.[0]?.text,
                blockId: i.blocks?.[0]?.blockId,
                range: i.blocks?.[0]?.range,
                snippet: i.snippet?.slice(0, 100),
              })),
          });
        }
        const result = api.find({ select: input as any } as any);
        return JSON.stringify(result);
      }
      case 'superdoc_get_content': {
        switch (action) {
          case 'text':
            return JSON.stringify(api.getText({}).slice(0, 3000));
          case 'markdown':
            return JSON.stringify(api.getMarkdown({}).slice(0, 3000));
          case 'info':
            return JSON.stringify(api.info({}));
          case 'blocks': {
            const info = api.info({});
            return JSON.stringify(info);
          }
          default:
            return JSON.stringify(api.info({}));
        }
      }
      case 'superdoc_edit': {
        switch (action) {
          case 'insert':
            return JSON.stringify(
              api.insert({ value: input.value as string, type: input.type as any, target: input.target as any } as any),
            );
          case 'replace':
            return JSON.stringify(api.replace({ ref: input.ref as string, text: input.text as string } as any));
          case 'delete':
            return JSON.stringify(api.delete({ ref: input.ref as string } as any));
          case 'undo':
            return JSON.stringify(api.history.undo());
          case 'redo':
            return JSON.stringify(api.history.redo());
          default:
            return JSON.stringify({ error: `Unknown edit action: ${action}` });
        }
      }
      case 'superdoc_format': {
        switch (action) {
          case 'inline':
            return JSON.stringify(
              api.format.apply({
                ref: input.ref as string,
                inline: input.inline as any,
                target: input.target as any,
              } as any),
            );
          case 'set_style':
            return JSON.stringify(
              (api as any).styles?.paragraph?.setStyle?.({ target: input.target, styleId: input.styleId }) ?? {
                error: 'not implemented',
              },
            );
          default:
            return JSON.stringify({ error: `Unknown format action: ${action}` });
        }
      }
      case 'superdoc_create': {
        switch (action) {
          case 'paragraph':
            return JSON.stringify(api.create.paragraph({ text: input.text as string, at: input.at as any } as any));
          case 'heading':
            return JSON.stringify(
              api.create.heading({
                level: input.level as number,
                text: input.text as string,
                at: input.at as any,
              } as any),
            );
          default:
            return JSON.stringify({ error: `Unknown create action: ${action}` });
        }
      }
      case 'superdoc_comment': {
        switch (action) {
          case 'create':
            return JSON.stringify(
              api.comments.create({
                text: input.text as string,
                target: input.target as any,
                parentCommentId: input.parentId as string,
              } as any),
            );
          case 'list':
            return JSON.stringify(api.comments.list());
          case 'get':
            return JSON.stringify(api.comments.get({ commentId: input.id as string }));
          case 'delete':
            return JSON.stringify(api.comments.delete({ commentId: input.id as string } as any));
          default:
            return JSON.stringify({ error: `Unknown comment action: ${action}` });
        }
      }
      case 'superdoc_track_changes': {
        switch (action) {
          case 'list':
            return JSON.stringify(api.trackChanges.list());
          case 'get':
            return JSON.stringify(api.trackChanges.get({ id: input.id as string }));
          case 'decide':
            return JSON.stringify(
              api.trackChanges.decide({ id: input.id as string, decision: input.decision as any } as any),
            );
          default:
            return JSON.stringify({ error: `Unknown track_changes action: ${action}` });
        }
      }
      case 'superdoc_mutations': {
        return JSON.stringify(
          api.mutations.apply({
            atomic: true,
            changeMode: (input.changeMode as any) ?? 'direct',
            steps: input.steps as any,
          } as any),
        );
      }
      case 'superdoc_list': {
        return JSON.stringify({ error: 'List operations not fully implemented in eval harness' });
      }
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (e: any) {
    return JSON.stringify({ error: e.message });
  }
}

// ---------------------------------------------------------------------------
// Agent loop — runs Claude with tools until it stops
// ---------------------------------------------------------------------------

async function runAgent(
  client: Anthropic,
  model: string,
  systemPrompt: string,
  tools: Anthropic.Tool[],
  userPrompt: string,
  dispatch: (name: string, input: Record<string, unknown>) => string,
  maxSteps: number = 15,
): Promise<{ toolCalls: ToolCall[]; tokenUsage: { input: number; output: number }; finalText: string }> {
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userPrompt }];
  const toolCalls: ToolCall[] = [];
  let totalInput = 0;
  let totalOutput = 0;
  let finalText = '';

  for (let step = 0; step < maxSteps; step++) {
    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      messages,
    });

    totalInput += response.usage.input_tokens;
    totalOutput += response.usage.output_tokens;

    // Collect text from response
    for (const block of response.content) {
      if (block.type === 'text') finalText += block.text;
    }

    if (response.stop_reason === 'end_turn') break;

    if (response.stop_reason === 'tool_use') {
      const assistantContent = response.content;
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of assistantContent) {
        if (block.type === 'tool_use') {
          const start = performance.now();
          let output: string;
          let error: string | undefined;
          try {
            output = dispatch(block.name, block.input as Record<string, unknown>);
          } catch (e: any) {
            output = JSON.stringify({ error: e.message });
            error = e.message;
          }
          const ms = Math.round(performance.now() - start);

          toolCalls.push({
            name: block.name,
            input: block.input as Record<string, unknown>,
            output: output.slice(0, 500),
            error,
            ms,
          });
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: output });
        }
      }

      messages.push({ role: 'assistant', content: assistantContent });
      messages.push({ role: 'user', content: toolResults });
    }
  }

  return { toolCalls, tokenUsage: { input: totalInput, output: totalOutput }, finalText };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function score(task: Task, result: RunResult): Score {
  const e = task.expect;
  const toolCalls = result.toolCalls.length;
  const errors = result.errors;
  const efficiency = e.maxToolCalls ? toolCalls <= e.maxToolCalls : true;

  const containsExpected = e.containsText
    ? e.containsText.every((t) => result.finalText.toLowerCase().includes(t.toLowerCase()))
    : true;

  const excludesUnwanted = e.excludesText
    ? e.excludesText.every((t) => !result.finalText.toLowerCase().includes(t.toLowerCase()))
    : true;

  const commentsOk = e.minComments ? result.finalInfo.comments >= e.minComments : true;
  const trackedChangesOk = e.minTrackedChanges ? result.finalInfo.trackedChanges >= e.minTrackedChanges : true;

  return {
    toolCalls,
    errors,
    efficiency,
    containsExpected,
    excludesUnwanted,
    commentsOk,
    trackedChangesOk,
    pass: efficiency && containsExpected && excludesUnwanted && commentsOk && trackedChangesOk && errors === 0,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const taskFilter = args.includes('--task') ? args[args.indexOf('--task') + 1] : undefined;
  const configFilter = args.includes('--config') ? args[args.indexOf('--config') + 1] : undefined;
  const model = args.includes('--model') ? args[args.indexOf('--model') + 1] : 'claude-sonnet-4-6';

  const client = new Anthropic();
  const configs = configFilter ? [configFilter] : ['experimental', 'sdk'];
  const selectedTasks = taskFilter ? tasks.filter((t) => t.id === taskFilter) : tasks;

  if (selectedTasks.length === 0) {
    console.error(`No tasks matched filter "${taskFilter}". Available: ${tasks.map((t) => t.id).join(', ')}`);
    process.exit(1);
  }

  console.log(`\nSuperDoc Tool Eval`);
  console.log(`Model: ${model}`);
  console.log(`Tasks: ${selectedTasks.map((t) => t.id).join(', ')}`);
  console.log(`Configs: ${configs.join(', ')}\n`);

  const allResults: Array<{ task: Task; config: string; result: RunResult; score: Score }> = [];

  for (const task of selectedTasks) {
    for (const config of configs) {
      console.log(`--- ${task.id} / ${config} ---`);

      // Prepare fixture copy
      const fixturePath = task.fixture ? resolve(dirname(new URL(import.meta.url).pathname), task.fixture) : '';
      const tmpPath = `/tmp/eval-${task.id}-${config}.docx`;
      if (fixturePath && existsSync(fixturePath)) {
        copyFileSync(fixturePath, tmpPath);
      }

      const docPath = fixturePath ? tmpPath : task.id === 'create-doc' ? '/tmp/eval-new-doc.docx' : tmpPath;
      const { api, editor, exportDoc } = await openDoc(fixturePath ? tmpPath : '');

      // Get tools and dispatch for this config
      const tools = config === 'experimental' ? getExperimentalTools() : getSDKTools();
      const systemPrompt = config === 'experimental' ? getExperimentalSystemPrompt() : getSDKSystemPrompt();
      const dispatch =
        config === 'experimental'
          ? (name: string, input: Record<string, unknown>) => dispatchExperimental(api, name, input)
          : (name: string, input: Record<string, unknown>) => dispatchSDK(api, name, input);

      const start = performance.now();

      try {
        const agentResult = await runAgent(client, model, systemPrompt, tools, task.prompt, dispatch);

        const info = api.info({});
        const finalText = api.getText({});

        // Save output
        const bytes = await exportDoc();
        writeFileSync(tmpPath, bytes);

        const totalMs = Math.round(performance.now() - start);
        const errors = agentResult.toolCalls.filter((tc) => tc.error).length;

        const result: RunResult = {
          taskId: task.id,
          config,
          toolCalls: agentResult.toolCalls,
          errors,
          totalMs,
          tokenUsage: agentResult.tokenUsage,
          finalText,
          finalInfo: {
            comments: info.counts.comments,
            trackedChanges: info.counts.trackedChanges,
            words: info.counts.words,
          },
        };

        const s = score(task, result);
        allResults.push({ task, config, result, score: s });

        console.log(
          `  Tools: ${result.toolCalls.length} | Errors: ${result.errors} | Time: ${result.totalMs}ms | Tokens: ${result.tokenUsage.input}+${result.tokenUsage.output}`,
        );
        console.log(
          `  Comments: ${result.finalInfo.comments} | TC: ${result.finalInfo.trackedChanges} | Pass: ${s.pass ? 'YES' : 'NO'}`,
        );
        if (!s.pass) {
          console.log(
            `  Failures: ${[!s.efficiency && 'efficiency', !s.containsExpected && 'missing-text', !s.excludesUnwanted && 'unwanted-text', !s.commentsOk && 'comments', !s.trackedChangesOk && 'tracked-changes', s.errors > 0 && 'errors'].filter(Boolean).join(', ')}`,
          );
        }
      } catch (e: any) {
        console.log(`  FAILED: ${e.message}`);
        allResults.push({
          task,
          config,
          result: {
            taskId: task.id,
            config,
            toolCalls: [],
            errors: 1,
            totalMs: 0,
            tokenUsage: { input: 0, output: 0 },
            finalText: '',
            finalInfo: { comments: 0, trackedChanges: 0, words: 0 },
          },
          score: {
            toolCalls: 0,
            errors: 1,
            efficiency: false,
            containsExpected: false,
            excludesUnwanted: true,
            commentsOk: false,
            trackedChangesOk: false,
            pass: false,
          },
        });
      }

      editor.destroy();
    }
  }

  // --- Report ---
  console.log('\n\n========== COMPARISON REPORT ==========\n');

  const header = `| Task | Metric | Experimental | SDK |`;
  const sep = `|------|--------|-------------|-----|`;
  console.log(header);
  console.log(sep);

  for (const task of selectedTasks) {
    const exp = allResults.find((r) => r.task.id === task.id && r.config === 'experimental');
    const sdk = allResults.find((r) => r.task.id === task.id && r.config === 'sdk');

    const e = exp?.result;
    const s = sdk?.result;

    console.log(`| **${task.name}** | Tool calls | ${e?.toolCalls.length ?? '-'} | ${s?.toolCalls.length ?? '-'} |`);
    console.log(`| | Errors | ${e?.errors ?? '-'} | ${s?.errors ?? '-'} |`);
    console.log(`| | Time (ms) | ${e?.totalMs ?? '-'} | ${s?.totalMs ?? '-'} |`);
    console.log(
      `| | Tokens (in+out) | ${e ? `${e.tokenUsage.input}+${e.tokenUsage.output}` : '-'} | ${s ? `${s.tokenUsage.input}+${s.tokenUsage.output}` : '-'} |`,
    );
    console.log(`| | Pass | ${exp?.score.pass ? 'YES' : 'NO'} | ${sdk?.score.pass ? 'YES' : 'NO'} |`);
  }

  // Save raw results
  const outputDir = resolve(dirname(new URL(import.meta.url).pathname), 'results');
  mkdirSync(outputDir, { recursive: true });
  const outputPath = `${outputDir}/eval-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(
    outputPath,
    JSON.stringify(
      allResults.map((r) => ({ ...r, task: { id: r.task.id, name: r.task.name } })),
      null,
      2,
    ),
  );
  console.log(`\nResults saved to: ${outputPath}`);
}

main().catch((err) => {
  console.error('Eval failed:', err);
  process.exit(1);
});
