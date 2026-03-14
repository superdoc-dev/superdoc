import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { InvokeOptions } from './runtime/process.js';
import { SuperDocCliError } from './runtime/errors.js';
import { dispatchIntentTool } from './generated/intent-dispatch.generated.js';

export type ToolProvider = 'openai' | 'anthropic' | 'vercel' | 'generic';

// Resolve tools directory relative to package root (works from both src/ and dist/)
const toolsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'tools');
const providerFileByName: Record<ToolProvider, string> = {
  openai: 'tools.openai.json',
  anthropic: 'tools.anthropic.json',
  vercel: 'tools.vercel.json',
  generic: 'tools.generic.json',
};

export type ToolCatalog = {
  contractVersion: string;
  generatedAt: string | null;
  toolCount: number;
  tools: ToolCatalogEntry[];
};

type ToolCatalogEntry = {
  toolName: string;
  description: string;
  inputSchema: Record<string, unknown>;
  mutates: boolean;
  operations: Array<{ operationId: string; intentAction: string }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

async function readJson<T>(fileName: string): Promise<T> {
  const filePath = path.join(toolsDir, fileName);
  let raw = '';
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (error) {
    throw new SuperDocCliError('Unable to load packaged tool artifact.', {
      code: 'TOOLS_ASSET_NOT_FOUND',
      details: {
        filePath,
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new SuperDocCliError('Packaged tool artifact is invalid JSON.', {
      code: 'TOOLS_ASSET_INVALID',
      details: {
        filePath,
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

async function loadProviderBundle(provider: ToolProvider): Promise<{
  contractVersion: string;
  tools: unknown[];
}> {
  return readJson(providerFileByName[provider]);
}

async function loadCatalog(): Promise<ToolCatalog> {
  return readJson<ToolCatalog>('catalog.json');
}

export async function getToolCatalog(): Promise<ToolCatalog> {
  return loadCatalog();
}

export async function listTools(provider: ToolProvider): Promise<unknown[]> {
  const bundle = await loadProviderBundle(provider);
  const tools = bundle.tools;
  if (!Array.isArray(tools)) {
    throw new SuperDocCliError('Tool provider bundle is missing tools array.', {
      code: 'TOOLS_ASSET_INVALID',
      details: { provider },
    });
  }
  return tools;
}

export type ToolChooserInput = {
  provider: ToolProvider;
};

/**
 * Select all intent tools for a specific provider.
 *
 * Returns all intent tools in the requested provider format.
 *
 * @example
 * ```ts
 * const { tools } = await chooseTools({ provider: 'openai' });
 * ```
 */
export async function chooseTools(input: ToolChooserInput): Promise<{
  tools: unknown[];
  meta: {
    provider: ToolProvider;
    toolCount: number;
  };
}> {
  const bundle = await loadProviderBundle(input.provider);
  const tools = Array.isArray(bundle.tools) ? bundle.tools : [];

  return {
    tools,
    meta: {
      provider: input.provider,
      toolCount: tools.length,
    },
  };
}

function resolveDocApiMethod(
  client: { doc: Record<string, unknown> },
  operationId: string,
): (args: unknown, options?: InvokeOptions) => Promise<unknown> {
  const tokens = operationId.split('.').slice(1);
  let cursor: unknown = client.doc;

  for (const token of tokens) {
    if (!isRecord(cursor) || !(token in cursor)) {
      throw new SuperDocCliError(`No SDK doc method found for operation ${operationId}.`, {
        code: 'TOOL_DISPATCH_NOT_FOUND',
        details: { operationId, token },
      });
    }
    cursor = cursor[token];
  }

  if (typeof cursor !== 'function') {
    throw new SuperDocCliError(`Resolved member for ${operationId} is not callable.`, {
      code: 'TOOL_DISPATCH_NOT_FOUND',
      details: { operationId },
    });
  }

  return cursor as (args: unknown, options?: InvokeOptions) => Promise<unknown>;
}

export async function dispatchSuperDocTool(
  client: { doc: Record<string, unknown> },
  toolName: string,
  args: Record<string, unknown> = {},
  invokeOptions?: InvokeOptions,
): Promise<unknown> {
  if (!isRecord(args)) {
    throw new SuperDocCliError(`Tool arguments for ${toolName} must be an object.`, {
      code: 'INVALID_ARGUMENT',
      details: { toolName },
    });
  }

  // Strip doc/sessionId — the SDK client manages session targeting after doc.open().
  const { doc: _doc, sessionId: _sid, ...cleanArgs } = args;

  return dispatchIntentTool(toolName, cleanArgs, (operationId, input) => {
    const method = resolveDocApiMethod(client, operationId);
    return method(input, invokeOptions);
  });
}

/**
 * Read the bundled system prompt for intent tools.
 */
export async function getSystemPrompt(): Promise<string> {
  const promptPath = path.join(toolsDir, 'system-prompt.md');
  try {
    return await readFile(promptPath, 'utf8');
  } catch {
    throw new SuperDocCliError('System prompt not found.', {
      code: 'TOOLS_ASSET_NOT_FOUND',
      details: { filePath: promptPath },
    });
  }
}
