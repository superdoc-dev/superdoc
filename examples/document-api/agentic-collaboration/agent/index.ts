/**
 * SuperDoc Document Editing Agent
 *
 * Demonstrates the SuperDoc SDK for building AI agents that edit documents.
 *
 * KEY SDK FUNCTIONS (from @superdoc-dev/sdk):
 *   - createSuperDocClient() - Create a client instance
 *   - client.connect()       - Connect to the SuperDoc host process
 *   - client.doc.open()      - Open/join a document (with optional collaboration)
 *   - client.doc.getText()   - Get document text content
 *   - chooseTools()          - Get LLM-compatible tool definitions
 *   - dispatchSuperDocTool() - Execute a tool by name
 *
 * Usage: npx tsx agent [documentId]
 */

import 'dotenv/config';
import OpenAI from 'openai';

import {
  createSuperDocClient,
  chooseTools,
  dispatchSuperDocTool,
  type SuperDocClient,
} from '@superdoc-dev/sdk';

import { connectChat } from './chat.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

const PORT = process.env.PORT || '3050';
const COLLAB_URL = `ws://localhost:${PORT}/collaboration`;
const CHAT_URL = `ws://localhost:${PORT}/chat`;
const DEFAULT_DOC_ID = 'superdoc-demo';

// Note: superdoc_mutations has a 19KB schema (vs ~3KB for others) with complex
// oneOf unions. LLMs may struggle with it. Uncomment to exclude if needed.
// const EXCLUDED_TOOLS = new Set(['superdoc_mutations']);

// =============================================================================
// SDK FUNCTIONS
// =============================================================================

/**
 * Connect to SuperDoc and open a collaborative document.
 */
async function connectToDocument(documentId: string): Promise<SuperDocClient> {
  const client = createSuperDocClient();
  await client.connect();
  console.log('[Agent] Connected to SuperDoc host');

  await client.doc.open({
    collaboration: {
      providerType: 'y-websocket',
      url: COLLAB_URL,
      documentId: documentId,
    },
  });
  console.log(`[Agent] Joined collaboration room: ${documentId}`);

  return client;
}

/**
 * Get LLM-compatible tool definitions from the SDK.
 *
 * SDK alpha.48+ uses "intent tools" — 9 high-level tools with `action` params:
 * - superdoc_get_content (action: html, info, markdown, text)
 * - superdoc_edit (action: delete, insert, redo, replace, undo)
 * - superdoc_format, superdoc_create, superdoc_list, etc.
 */
async function getTools(): Promise<{ tools: OpenAI.ChatCompletionTool[]; toolNames: string[] }> {
  const result = await chooseTools({ provider: 'openai' });

  const tools = result.tools as OpenAI.ChatCompletionTool[];
  console.log(`[Agent] chooseTools() returned ${tools.length} intent tools`);

  const toolNames = tools.map((t) => t.function.name);
  console.log(`[Agent] Using ${toolNames.length} tools:`, toolNames.join(', '));

  return { tools, toolNames };
}

/**
 * Execute a tool call using the SDK.
 */
async function executeTool(
  client: SuperDocClient,
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  console.log(`[Agent] Executing: ${toolName}`, JSON.stringify(args).slice(0, 80));
  const result = await dispatchSuperDocTool(client, toolName, args);
  console.log(`[Agent] Result:`, JSON.stringify(result).slice(0, 120));
  return result;
}

// =============================================================================
// AGENTIC LOOP
// =============================================================================

/** Conversation history (persists across messages) */
const conversationHistory: OpenAI.ChatCompletionMessageParam[] = [];

/**
 * Process a user message using OpenAI with SuperDoc tools.
 */
async function processMessage(
  client: SuperDocClient,
  openai: OpenAI,
  tools: OpenAI.ChatCompletionTool[],
  toolNames: string[],
  userMessage: string,
): Promise<string> {
  // Get current document content
  let documentContent = '';
  try {
    const text = await client.doc.getText({});
    documentContent = typeof text === 'string' ? text : String(text);
  } catch (e) {
    console.error('[Agent] Failed to get document text:', e);
  }

  const systemPrompt = `
  You're an expert document editor and professional copy writer.
  You're adept at both writing and formatting documents to look professional and impressive for legal professionals.
  `

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory,
    { role: 'user', content: userMessage },
  ];

  conversationHistory.push({ role: 'user', content: userMessage });

  console.log('[Agent] Processing:', userMessage.slice(0, 60) + (userMessage.length > 60 ? '...' : ''));

  // Agentic loop: call OpenAI, execute tools, repeat
  for (let i = 0; i < 10; i++) {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? (i === 0 ? 'required' : 'auto') : undefined,
    });

    const message = response.choices[0].message;
    messages.push(message);

    // No tool calls = done
    if (!message.tool_calls?.length) {
      const response = message.content || 'Done.';
      conversationHistory.push({ role: 'assistant', content: response });
      return response;
    }

    // Execute each tool call
    for (const call of message.tool_calls) {
      try {
        const args = JSON.parse(call.function.arguments);
        const result = await executeTool(client, call.function.name, args);
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[Agent] Tool error:`, errorMsg);
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: errorMsg }) });
      }
    }
  }

  const response = 'Reached maximum iterations.';
  conversationHistory.push({ role: 'assistant', content: response });
  return response;
}

function clearConversation() {
  conversationHistory.length = 0;
  console.log('[Agent] Conversation cleared');
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const documentId = process.argv[2] || DEFAULT_DOC_ID;

  console.log('[Agent] ' + '='.repeat(50));
  console.log('[Agent] SuperDoc Document Editing Agent');
  console.log('[Agent] ' + '='.repeat(50));
  console.log(`[Agent] Document ID: ${documentId}`);
  console.log(`[Agent] Collaboration URL: ${COLLAB_URL}`);
  console.log(`[Agent] Chat URL: ${CHAT_URL}/${documentId}`);
  console.log();

  // Wait for server startup
  await new Promise((r) => setTimeout(r, 3000));

  // Check OpenAI key
  if (!process.env.OPENAI_API_KEY) {
    console.error('[Agent] ERROR: OPENAI_API_KEY not set in .env file');
    process.exit(1);
  }
  const openai = new OpenAI();

  // Connect to SuperDoc
  const client = await connectToDocument(documentId);

  // Get tools from SDK
  const { tools, toolNames } = await getTools();

  // Connect to chat
  let isProcessing = false;
  const chat = await connectChat(
    `${CHAT_URL}/${documentId}`,
    async (message) => {
      if (isProcessing) return;
      isProcessing = true;
      chat.setStatus('thinking');

      try {
        const response = await processMessage(client, openai, tools, toolNames, message.content);
        chat.send(response);
      } catch (error) {
        console.error('[Agent] Error:', error);
        chat.send('Sorry, I encountered an error.');
      } finally {
        isProcessing = false;
        chat.setStatus('ready');
      }
    },
    clearConversation,
  );

  chat.setStatus('ready');
  console.log('[Agent] Ready for chat. Press Ctrl+C to exit.');

  // Wait for shutdown
  await new Promise<void>((resolve) => {
    process.on('SIGINT', resolve);
    process.on('SIGTERM', resolve);
  });

  console.log('\n[Agent] Shutting down...');
  chat.close();
  await client.doc.close({});
  await client.dispose();
}

main().catch((err) => {
  console.error('[Agent] Fatal error:', err);
  process.exit(1);
});
