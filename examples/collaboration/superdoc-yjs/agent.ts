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
 * Usage: npx tsx agent.ts [documentId]
 */

import 'dotenv/config';
import OpenAI from 'openai';
import WebSocket from 'ws';

// =============================================================================
// SUPERDOC SDK IMPORTS
// =============================================================================

import {
  createSuperDocClient,
  chooseTools,
  dispatchSuperDocTool,
  type SuperDocClient,
} from '@superdoc-dev/sdk';

// =============================================================================
// CONFIGURATION
// =============================================================================

const PORT = process.env.PORT || '3050';
const COLLAB_URL = `ws://localhost:${PORT}/collaboration`;
const CHAT_URL = `ws://localhost:${PORT}/chat`;
const DEFAULT_DOC_ID = 'superdoc-demo';

/** Tools to exclude (complex schemas that LLMs can't use correctly) */
const EXCLUDED_TOOLS = new Set([
  'apply_mutations', 'preview_mutations', 'query_match',
  'doc_mutations_apply', 'doc_mutations_preview',
  'doc_lists_setLevelRestart', 'doc_lists_setValue',
  'doc_sections_setPageBorders', 'set_list_level_restart',
  'set_list_value', 'set_section_page_borders', 'discover_tools',
]);

/** Tools to prioritize (most useful for document editing demos) */
const PREFERRED_TOOLS = new Set([
  'get_document_text', 'get_document_info', 'find_content', 'get_node', 'get_node_by_id',
  'insert_content', 'replace_content', 'delete_content',
  'create_paragraph', 'create_heading', 'create_table', 'create_image',
  'format_bold', 'format_italic', 'format_underline', 'format_strike',
  'format_highlight', 'format_color', 'format_font_size', 'format_font_family',
  'create_list', 'insert_list_item',
  'insert_table_row', 'insert_table_column', 'delete_table_row', 'delete_table_column',
  'undo', 'redo',
]);

// =============================================================================
// SDK USAGE EXAMPLES
// =============================================================================

/**
 * Connect to SuperDoc and open a collaborative document.
 *
 * SDK Functions:
 *   - createSuperDocClient() creates the client
 *   - client.connect() starts the host process
 *   - client.doc.open() joins the document/collaboration room
 */
async function connectToDocument(documentId: string): Promise<SuperDocClient> {
  // Create and connect the SDK client
  const client = createSuperDocClient();
  await client.connect();
  console.log('[SDK] Connected to SuperDoc host');

  // Open document with collaboration
  await client.doc.open({
    collaboration: {
      providerType: 'y-websocket',
      url: COLLAB_URL,
      documentId: documentId,
    },
  });
  console.log(`[SDK] Joined collaboration room: ${documentId}`);

  return client;
}

/**
 * Get LLM-compatible tool definitions from the SDK.
 *
 * SDK Function: chooseTools()
 *   - Returns tool schemas formatted for OpenAI/Anthropic/etc.
 *   - mode: 'all' includes mutation tools, 'essential' is read-only
 */
async function getTools(): Promise<{ tools: OpenAI.ChatCompletionTool[]; toolNames: string[] }> {
  const result = await chooseTools({
    provider: 'openai',
    mode: 'all',
    includeDiscoverTool: false,
  });

  const allTools = result.tools as OpenAI.ChatCompletionTool[];
  console.log(`[SDK] chooseTools() returned ${allTools.length} tools`);

  // Filter and limit tools for OpenAI (max 128)
  const tools = allTools
    .filter((t) => !EXCLUDED_TOOLS.has(t.function.name))
    .sort((a, b) => {
      const aScore = PREFERRED_TOOLS.has(a.function.name) ? 0 : 1;
      const bScore = PREFERRED_TOOLS.has(b.function.name) ? 0 : 1;
      return aScore - bScore;
    })
    .slice(0, 100);

  const toolNames = tools.map((t) => t.function.name);
  console.log(`[SDK] Using ${toolNames.length} tools:`, toolNames.slice(0, 10).join(', '), '...');

  return { tools, toolNames };
}

/**
 * Execute a tool call using the SDK.
 *
 * SDK Function: dispatchSuperDocTool(client, toolName, args)
 *   - Routes the tool call to the appropriate SDK method
 *   - Returns the result (or throws on error)
 */
async function executeTool(
  client: SuperDocClient,
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  console.log(`[SDK] Executing: ${toolName}`, JSON.stringify(args).slice(0, 80));
  const result = await dispatchSuperDocTool(client, toolName, args);
  console.log(`[SDK] Result:`, JSON.stringify(result).slice(0, 120));
  return result;
}

// =============================================================================
// AGENTIC LOOP (OpenAI Integration)
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
  // Get current document content using SDK
  let documentContent = '';
  try {
    const text = await client.doc.getText({});
    documentContent = typeof text === 'string' ? text : String(text);
  } catch (e) {
    console.error('[Agent] Failed to get document text:', e);
  }

  const systemPrompt = `You are a document editing assistant. Your job is to EDIT THE DOCUMENT when asked.

IMPORTANT: Always take action immediately. Do NOT ask clarifying questions. Make reasonable assumptions:
- If no position specified, insert at the END of the document
- If formatting is unclear, use sensible defaults
- Just do it, then confirm what you did

Available tools: ${toolNames.join(', ')}

Key tools:
- insert_content: Insert text. Just pass { "value": "your text", "type": "markdown" }. Omit "target" to append at end.
- format_bold, format_italic: Format selected text
- delete_content, replace_content: Modify existing content

Current document:
---
${documentContent || '(empty document)'}
---

Rules:
- Do NOT pass "doc" or "sessionId" parameters
- ALWAYS call a tool to make edits - never just describe what you would do
- Be concise in responses`;

  // Build messages: system + history + new user message
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory,
    { role: 'user', content: userMessage },
  ];

  // Add user message to history
  conversationHistory.push({ role: 'user', content: userMessage });

  console.log('[Agent] Processing:', userMessage.slice(0, 60) + (userMessage.length > 60 ? '...' : ''));
  console.log('[Agent] Conversation history:', conversationHistory.length, 'messages');

  // Agentic loop: call OpenAI, execute tools, repeat
  for (let i = 0; i < 10; i++) {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      tools: tools.length > 0 ? tools : undefined,
      // First call: require a tool call. Subsequent: auto
      tool_choice: tools.length > 0 ? (i === 0 ? 'required' : 'auto') : undefined,
    });

    const message = response.choices[0].message;
    messages.push(message);

    // No tool calls = done
    if (!message.tool_calls?.length) {
      const response = message.content || 'Done.';
      // Add assistant response to history
      conversationHistory.push({ role: 'assistant', content: response });
      return response;
    }

    // Execute each tool call using the SDK
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

/** Clear conversation history */
function clearConversation() {
  conversationHistory.length = 0;
  console.log('[Agent] Conversation cleared');
}

// =============================================================================
// CHAT WEBSOCKET (Simple message passing)
// =============================================================================

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

function connectChat(
  url: string,
  onMessage: (msg: ChatMessage) => void,
  onClear: () => void,
): Promise<{ send: (content: string) => void; setStatus: (status: string) => void; close: () => void }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timeout = setTimeout(() => reject(new Error('Chat connection timeout')), 10000);

    ws.on('open', () => {
      clearTimeout(timeout);
      console.log('[Chat] Connected');

      const send = (content: string) => {
        ws.send(JSON.stringify({
          type: 'message',
          role: 'assistant',
          id: `agent-${Date.now()}`,
          content,
          timestamp: Date.now(),
        }));
      };

      const setStatus = (status: string) => {
        ws.send(JSON.stringify({ type: 'status', status }));
      };

      const close = () => {
        setStatus('offline');
        ws.close();
      };

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'message' && msg.message?.role === 'user') {
            onMessage(msg.message);
          } else if (msg.type === 'clear') {
            onClear();
          }
        } catch (e) {
          console.error('[Chat] Parse error:', e);
        }
      });

      resolve({ send, setStatus, close });
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const documentId = process.argv[2] || DEFAULT_DOC_ID;

  console.log('='.repeat(60));
  console.log('SuperDoc Document Editing Agent');
  console.log('='.repeat(60));
  console.log(`Document: ${documentId}`);
  console.log();

  // Wait for server startup
  await new Promise((r) => setTimeout(r, 3000));

  // Check OpenAI key
  if (!process.env.OPENAI_API_KEY) {
    console.error('ERROR: OPENAI_API_KEY not set in .env file');
    process.exit(1);
  }
  const openai = new OpenAI();

  // Connect to SuperDoc using SDK
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
  console.log();
  console.log('Ready for chat. Press Ctrl+C to exit.');

  // Wait for shutdown
  await new Promise<void>((resolve) => {
    process.on('SIGINT', resolve);
    process.on('SIGTERM', resolve);
  });

  console.log('\nShutting down...');
  chat.close();
  await client.doc.close({});
  await client.dispose();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
