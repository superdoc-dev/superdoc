import { promises as fs } from 'node:fs';
import path from 'node:path';

export type ToolDefinition = {
  name: string;
  description?: string;
  parameters?: unknown;
  returns?: unknown;
};

export type ToolSnapshot = {
  generatedAt?: string;
  source?: string;
  tools: ToolDefinition[];
};

function isToolDefinition(value: unknown): value is ToolDefinition {
  if (!value || typeof value !== 'object') return false;
  return typeof (value as ToolDefinition).name === 'string';
}

function extractTools(parsed: unknown): ToolDefinition[] {
  if (Array.isArray(parsed)) {
    return parsed.filter(isToolDefinition);
  }

  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { tools?: unknown }).tools)) {
    return (parsed as { tools: unknown[] }).tools.filter(isToolDefinition);
  }

  return [];
}

/**
 * Loads the tool definition snapshot from `fixtures/tool-schemas/current.json`.
 *
 * @param root - Project root directory.
 * @returns The parsed tool snapshot.
 * @throws {Error} If no tools are found in the snapshot file.
 */
export async function loadToolSnapshot(root: string): Promise<ToolSnapshot> {
  const snapshotPath = path.join(root, 'fixtures', 'tool-schemas', 'current.json');
  const raw = await fs.readFile(snapshotPath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  const tools = extractTools(parsed);

  if (tools.length === 0) {
    throw new Error(
      `No tools found in ${path.relative(root, snapshotPath)}. Run "pnpm run tools:sync" after generating packages/llm-tools/dist/tool-definitions.json.`,
    );
  }

  const generatedAt =
    parsed && typeof parsed === 'object' && 'generatedAt' in parsed
      ? String((parsed as { generatedAt?: string }).generatedAt)
      : undefined;
  const source =
    parsed && typeof parsed === 'object' && 'source' in parsed
      ? String((parsed as { source?: string }).source)
      : undefined;

  return { generatedAt, source, tools };
}

export function assertToolExists(snapshot: ToolSnapshot, toolName: string): void {
  if (!snapshot.tools.some((tool) => tool.name === toolName)) {
    throw new Error(`Tool not found in snapshot: ${toolName}`);
  }
}
