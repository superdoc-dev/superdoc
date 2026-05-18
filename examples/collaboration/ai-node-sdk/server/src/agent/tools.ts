import { chooseTools, dispatchSuperDocTool, getSystemPrompt } from '@superdoc-dev/sdk';

let cachedTools: unknown[] | null = null;
let cachedPrompt: string | null = null;

// ============================================================================
// CUSTOM TOOLS EXAMPLE
// ============================================================================
// This demonstrates how to add your own tools alongside SuperDoc's built-in tools.
// The pattern is: 1) define schema, 2) define implementation, 3) dispatch by name.

/**
 * 1. DEFINE TOOL SCHEMAS
 * These are what the LLM sees. The `description` is critical for discoverability.
 */
const customToolSchemas = [
  {
    type: 'function' as const,
    function: {
      name: 'ping',
      description:
        'A simple no-op tool that echoes back the input. ' +
        'Use this to test that tool calling is working correctly.',
      parameters: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'The message to echo back',
          },
        },
        required: ['message'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'extract_headings',
      description:
        'Extract all headings from the document with their stable IDs and text. ' +
        'Use this BEFORE making edits to headings - the returned nodeId can be used ' +
        'to reliably target specific headings for replacement.',
      parameters: {
        type: 'object',
        properties: {
          level: {
            type: 'number',
            description: 'Optional: filter to a specific heading level (1-9). Omit for all levels.',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_block_by_id',
      description:
        'Get the content of a specific block (paragraph, heading, etc.) by its stable ID. ' +
        'Use this to inspect a block before editing it.',
      parameters: {
        type: 'object',
        properties: {
          blockId: {
            type: 'string',
            description: 'The stable nodeId of the block (obtained from extract_headings or other query tools)',
          },
        },
        required: ['blockId'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'replace_block_text',
      description:
        'Replace the entire text content of a block using its ref handle. ' +
        'Get the ref from list_paragraphs or extract_headings first. ' +
        'This is more reliable than search/replace.',
      parameters: {
        type: 'object',
        properties: {
          ref: {
            type: 'string',
            description: 'The ref handle from list_paragraphs or extract_headings',
          },
          newText: {
            type: 'string',
            description: 'The new text content for the block',
          },
        },
        required: ['ref', 'newText'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_paragraphs',
      description:
        'List all paragraphs in the document with their stable IDs and text preview. ' +
        'Useful for understanding document structure before making edits.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Maximum number of paragraphs to return (default: 20)',
          },
        },
      },
    },
  },
];

/**
 * 2. DEFINE TOOL IMPLEMENTATIONS
 * Map tool names to functions. Each receives (documentHandle, args).
 */
type ToolImpl = (documentHandle: unknown, args: Record<string, unknown>) => unknown | Promise<unknown>;

const customToolImplementations: Record<string, ToolImpl> = {
  ping: (_documentHandle, args) => {
    // No-op: just echo back the input
    return { ok: true, echo: args.message, timestamp: new Date().toISOString() };
  },

  extract_headings: async (documentHandle: any, args) => {
    // Query the document for all heading blocks
    const result = await documentHandle.blocks.list({ nodeTypes: ['heading'], includeText: true });
    const blocks = result.blocks;

    // Filter by level if specified
    const filtered = args.level
      ? blocks.filter((b: any) => b.headingLevel === args.level)
      : blocks;

    // Return headings with their ref handles for mutations
    return {
      ok: true,
      count: filtered.length,
      headings: filtered.map((block: any) => ({
        ref: block.ref,              // Use this ref for edits (pass to replace_block_text)
        nodeId: block.nodeId,        // Stable ID for reference
        level: block.headingLevel,
        text: block.text,
      })),
    };
  },

  get_block_by_id: async (documentHandle: any, args) => {
    try {
      // Get all blocks and filter to find the one with matching nodeId
      const result = await documentHandle.blocks.list({ includeText: true });
      const block = result.blocks.find((b: any) => b.nodeId === args.blockId);

      if (!block) {
        return {
          ok: false,
          error: `Block not found: ${args.blockId}`,
        };
      }

      return {
        ok: true,
        block: {
          ref: block.ref,            // Use this for mutations
          nodeId: block.nodeId,
          type: block.nodeType,
          text: block.text,
          ...(block.headingLevel && { level: block.headingLevel }),
        },
      };
    } catch (error: any) {
      return {
        ok: false,
        error: `Failed to get block: ${args.blockId}`,
        message: error?.message,
      };
    }
  },

  replace_block_text: async (documentHandle: any, args) => {
    try {
      // Use the Document API to replace text using the ref handle
      // The ref should come from list_paragraphs or extract_headings
      await documentHandle.replace({
        ref: args.ref,
        value: args.newText,
      });
      return {
        ok: true,
        ref: args.ref,
        newText: args.newText,
      };
    } catch (error: any) {
      return {
        ok: false,
        error: `Failed to replace block text`,
        ref: args.ref,
        message: error?.message,
      };
    }
  },

  list_paragraphs: async (documentHandle: any, args) => {
    const limit = args.limit || 20;

    // Query for paragraph blocks
    const result = await documentHandle.blocks.list({ nodeTypes: ['paragraph'], includeText: true });
    const blocks = result.blocks;

    // Return limited list with ref handles for mutations
    const paragraphs = blocks.slice(0, limit).map((block: any) => ({
      ref: block.ref,          // Use this for mutations (pass to replace_block_text)
      nodeId: block.nodeId,    // Stable ID for reference
      text: block.text?.substring(0, 100) + (block.text?.length > 100 ? '...' : ''),
    }));

    return {
      ok: true,
      count: paragraphs.length,
      total: result.total,
      paragraphs,
    };
  },
};

/**
 * 3. DISPATCH FUNCTION
 * Routes tool calls to either custom implementations or SuperDoc's dispatcher.
 */
export async function dispatchTool(
  documentHandle: unknown,
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  // Check custom tools first
  if (toolName in customToolImplementations) {
    return customToolImplementations[toolName](documentHandle, args);
  }
  // Fall back to SuperDoc tools
  return dispatchSuperDocTool(documentHandle, toolName, args);
}

// ============================================================================
// TOOL LOADING (combines custom + SuperDoc tools)
// ============================================================================

export async function loadTools(): Promise<unknown[]> {
  if (!cachedTools) {
    const result = await chooseTools({ provider: 'openai' });
    // Merge custom tools with SuperDoc tools
    cachedTools = [...customToolSchemas, ...result.tools];
  }
  return cachedTools;
}

export async function loadSystemPrompt(): Promise<string> {
  if (!cachedPrompt) {
    cachedPrompt = await getSystemPrompt();
  }
  return cachedPrompt;
}

// Keep for backwards compatibility, but prefer dispatchTool
export { dispatchSuperDocTool };
