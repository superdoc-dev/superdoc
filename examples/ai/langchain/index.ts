/**
 * SuperDoc + LangChain
 *
 * Minimal agentic loop: any LangChain-compatible model uses SuperDoc tools
 * to review and edit a Word document.
 *
 * Usage: OPENAI_API_KEY=sk-... npx tsx index.ts [input.docx] [output.docx]
 *
 * Requires: OPENAI_API_KEY (or swap ChatOpenAI for ChatAnthropic, ChatGoogleGenerativeAI, etc.)
 */

import { ChatOpenAI } from '@langchain/openai';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';
import {
  createSuperDocClient,
  chooseTools,
  dispatchSuperDocTool,
} from '@superdoc-dev/sdk';

async function main() {
  const [inputPath = 'contract.docx', outputPath = 'reviewed.docx'] = process.argv.slice(2);

  // 1. Connect to SuperDoc
  const client = createSuperDocClient();
  await client.connect();
  await client.doc.open({ doc: inputPath });

  // 2. Get tools in generic format and wrap as LangChain tools (all tools — no discover_tools since the framework manages a fixed tool set)
  const { tools: sdTools } = await chooseTools({ provider: 'generic', mode: 'all' });

  const langchainTools = (
    sdTools as Array<{ name: string; description: string; parameters: Record<string, unknown> }>
  ).map(
    (t) =>
      new DynamicStructuredTool({
        name: t.name,
        description: t.description,
        schema: z.object({}).passthrough(), // Accept any params — SuperDoc SDK validates
        func: async (args) => {
          console.log(`  Tool: ${t.name}`);
          const result = await dispatchSuperDocTool(client, t.name, args as Record<string, unknown>);
          return JSON.stringify(result);
        },
      }),
  );

  // 3. Create a ReAct agent
  const model = new ChatOpenAI({ model: 'gpt-4o' });
  const agent = createReactAgent({
    llm: model,
    tools: langchainTools,
    prompt: 'You edit .docx files using SuperDoc tools. Use tracked changes for all edits.',
  });

  // 4. Run the agent
  const result = await agent.invoke({
    messages: [new HumanMessage('Review this contract. Fix vague language and one-sided terms.')],
  });

  const lastMessage = result.messages[result.messages.length - 1];
  console.log(lastMessage.content);

  // 5. Save
  await client.doc.save({ doc: outputPath });
  await client.dispose();
  console.log(`\nSaved to ${outputPath}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
