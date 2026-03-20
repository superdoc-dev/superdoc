/**
 * SuperDoc Document Editing Agent
 *
 * Edits documents using the SuperDoc SDK and OpenAI.
 * Based on: https://docs.superdoc.dev/document-engine/ai-agents/llm-tools
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

import OpenAI from 'openai';
import { createSuperDocClient, chooseTools, dispatchSuperDocTool, getSystemPrompt } from '@superdoc-dev/sdk';
import { Chat } from './chat.js';

const PORT = process.env.PORT || '3050';
const COLLAB_URL = `ws://localhost:${PORT}/collaboration`;
const CHAT_URL = `ws://localhost:${PORT}/chat`;
const DOC_ID = process.argv[2] || 'superdoc-demo';

console.log('[Agent] Starting...');

// Connect and open document
const client = createSuperDocClient();
await client.connect();

const doc = await client.open({
  collaboration: {
    providerType: 'y-websocket',
    url: COLLAB_URL,
    documentId: DOC_ID,
  },
});
console.log(`[Agent] Joined room: ${DOC_ID}`);

// Load tools
const { tools } = await chooseTools({ provider: 'openai' });
console.log(`[Agent] Loaded ${tools.length} tools`);

// Set up OpenAI
const openai = new OpenAI();
const conversationHistory: OpenAI.ChatCompletionMessageParam[] = [
  { role: 'system', content: await getSystemPrompt() },
];

// Agent loop: process a user message and return a response
async function processMessage(userMessage: string): Promise<string> {
  conversationHistory.push({ role: 'user', content: userMessage });
  const messages: OpenAI.ChatCompletionMessageParam[] = [...conversationHistory];

  while (true) {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      tools: tools as OpenAI.ChatCompletionTool[],
    });

    const message = response.choices[0].message;
    messages.push(message);

    if (!message.tool_calls?.length) {
      conversationHistory.push({ role: 'assistant', content: message.content || 'Done.' });
      return message.content || 'Done.';
    }

    for (const call of message.tool_calls) {
      const result = await dispatchSuperDocTool(
        doc,
        call.function.name,
        JSON.parse(call.function.arguments),
      );
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }
}

// Connect to chat and serve messages
const chat = await new Chat(`${CHAT_URL}/${DOC_ID}`).connect();
chat.serve(processMessage);

console.log('[Agent] Ready. Press Ctrl+C to exit.');

process.on('SIGINT', async () => {
  chat.close();
  await doc.close();
  await client.dispose();
  process.exit(0);
});
