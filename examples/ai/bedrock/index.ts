/**
 * SuperDoc + AWS Bedrock
 *
 * Minimal agentic loop: Claude on Bedrock uses SuperDoc tools
 * to review and edit a Word document.
 *
 * Usage: npx tsx index.ts [input.docx] [output.docx]
 *
 * Requires: AWS credentials configured, Bedrock model access enabled.
 */

import path from 'node:path';
import { copyFileSync } from 'node:fs';
import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type Message,
  type Tool,
} from '@aws-sdk/client-bedrock-runtime';
import {
  createSuperDocClient,
  chooseTools,
  dispatchSuperDocTool,
  formatToolResult,
  formatToolError,
  mergeDiscoveredTools,
  type ToolGroup,
} from '@superdoc-dev/sdk';

const MODEL_ID = process.env.BEDROCK_MODEL_ID ?? 'amazon.nova-pro-v1:0';
const REGION = process.env.AWS_REGION ?? 'us-east-1';

async function main() {
  const [rawInput = 'contract.docx', rawOutput = 'reviewed.docx'] = process.argv.slice(2);
  const inputPath = path.resolve(rawInput);
  const outputPath = path.resolve(rawOutput);

  // 1. Connect to SuperDoc — copy to output path so the original is preserved
  copyFileSync(inputPath, outputPath);
  const client = createSuperDocClient();
  await client.connect();
  await client.doc.open({ doc: outputPath });

  // 2. Get tools in Anthropic format and convert to Bedrock toolSpec shape
  const { tools: sdTools } = await chooseTools({ provider: 'anthropic' });
  const toolConfig = { tools: [] as Tool[] };
  mergeDiscoveredTools(toolConfig, { tools: sdTools }, { provider: 'anthropic', target: 'bedrock' });

  // 3. Agentic loop
  const bedrock = new BedrockRuntimeClient({ region: REGION });
  const messages: Message[] = [
    { role: 'user', content: [{ text: 'Review this contract. Fix vague language and one-sided terms.' }] },
  ];

  for (let turn = 0; turn < 20; turn++) {
    const response = await bedrock.send(
      new ConverseCommand({
        modelId: MODEL_ID,
        messages,
        system: [{ text: 'You edit .docx files using SuperDoc tools. Use tracked changes for all edits.' }],
        toolConfig,
      }),
    );

    const output = response.output?.message;
    if (!output) break;
    messages.push(output);

    const toolUses = (output.content ?? []).filter((b): b is ContentBlock.ToolUseMember => 'toolUse' in b);
    if (!toolUses.length) {
      // Print final response
      for (const b of output.content ?? []) if ('text' in b) console.log(b.text);
      break;
    }

    const results: ContentBlock[] = [];
    for (const block of toolUses) {
      const { name, input, toolUseId } = block.toolUse!;
      console.log(`  Tool: ${name}`);
      try {
        let result: unknown;

        if (name === 'discover_tools') {
          // discover_tools is a meta-tool — handle client-side via chooseTools
          const groups = ((input ?? {}) as Record<string, unknown>).groups as ToolGroup[] | undefined;
          const discovered = await chooseTools({ provider: 'anthropic', groups });
          mergeDiscoveredTools(toolConfig, discovered, { provider: 'anthropic', target: 'bedrock' });
          result = discovered;
        } else {
          result = await dispatchSuperDocTool(client, name!, (input ?? {}) as Record<string, unknown>);
        }

        results.push(formatToolResult(result, { target: 'bedrock', toolUseId }) as ContentBlock);
      } catch (err) {
        results.push(formatToolError(err, { target: 'bedrock', toolUseId }) as ContentBlock);
      }
    }
    messages.push({ role: 'user', content: results });
  }

  // 4. Save (in-place to the copy)
  await client.doc.save();
  await client.dispose();
  console.log(`\nSaved to ${outputPath}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
