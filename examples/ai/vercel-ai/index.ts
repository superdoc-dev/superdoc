/**
 * SuperDoc + Vercel AI SDK
 *
 * Minimal agentic loop: any model via the Vercel AI SDK uses SuperDoc tools
 * to review and edit a Word document.
 *
 * Usage: OPENAI_API_KEY=sk-... npx tsx index.ts [input.docx] [output.docx]
 *
 * Requires: OPENAI_API_KEY (or swap the provider — Vercel AI supports
 * Anthropic, Google, Mistral, and others with the same interface).
 */

import path from 'node:path';
import { copyFileSync } from 'node:fs';
import { generateText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import {
  createSuperDocClient,
  chooseTools,
  dispatchSuperDocTool,
} from '@superdoc-dev/sdk';
import { z } from 'zod';

async function main() {
  const [rawInput = 'contract.docx', rawOutput = 'reviewed.docx'] = process.argv.slice(2);
  const inputPath = path.resolve(rawInput);
  const outputPath = path.resolve(rawOutput);

  // 1. Connect to SuperDoc — copy to output path so the original is preserved
  copyFileSync(inputPath, outputPath);
  const client = createSuperDocClient();
  await client.connect();
  await client.doc.open({ doc: outputPath });

  // 2. Get tools in Vercel AI format (all tools — no discover_tools since the framework manages a fixed tool set)
  const { tools: sdTools } = await chooseTools({ provider: 'vercel', mode: 'all' });

  // Convert SuperDoc tool definitions to Vercel AI `tool()` objects
  const vercelTools: Record<string, ReturnType<typeof tool>> = {};
  for (const t of sdTools as Array<{ type: string; function: { name: string; description: string; parameters: Record<string, unknown> } }>) {
    const fn = t.function;
    vercelTools[fn.name] = tool({
      description: fn.description,
      parameters: z.object({}).passthrough(), // Accept any params — SuperDoc SDK validates
      execute: async (args) => {
        console.log(`  Tool: ${fn.name}`);
        return dispatchSuperDocTool(client, fn.name, args as Record<string, unknown>);
      },
    });
  }

  // 3. Run with generateText — handles the agentic loop automatically
  const result = await generateText({
    model: openai('gpt-4o'),
    system: 'You edit .docx files using SuperDoc tools. Use tracked changes for all edits.',
    prompt: 'Review this contract. Fix vague language and one-sided terms.',
    tools: vercelTools,
    maxSteps: 20,
  });

  console.log(result.text);

  // 4. Save (in-place to the copy)
  await client.doc.save();
  await client.dispose();
  console.log(`\nSaved to ${outputPath}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
