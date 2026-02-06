import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const CANDIDATE_INPUTS = [
  'packages/llm-tools/dist/tool-definitions.json',
  'packages/llm-tools/dist/tools.json',
  'packages/llm-tools/tool-definitions.json',
  'packages/llm-tools/tools.json',
];

async function findFirstExisting(root: string): Promise<string | null> {
  for (const rel of CANDIDATE_INPUTS) {
    const full = path.join(root, rel);
    try {
      await fs.access(full);
      return full;
    } catch {
      // continue
    }
  }
  return null;
}

async function findFirstExistingFromAncestors(start: string): Promise<string | null> {
  let current = start;
  while (true) {
    const found = await findFirstExisting(current);
    if (found) {
      return found;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }

    current = parent;
  }
}

async function main() {
  const root = process.cwd();
  const outputPath = path.join(root, 'fixtures', 'tool-schemas', 'current.json');

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const found = await findFirstExistingFromAncestors(root);

  if (!found) {
    throw new Error(
      `No tool definition artifact found. Expected one of: ${CANDIDATE_INPUTS.join(', ')} (searched upward from ${root}). ` +
        'Run "pnpm -C packages/llm-tools run tools:generate" first.',
    );
  }

  const raw = await fs.readFile(found, 'utf8');
  const parsed = JSON.parse(raw);
  const tools = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.tools) ? parsed.tools : [];
  if (tools.length === 0) {
    throw new Error(
      `Tool definition artifact has no tools: ${path.relative(root, found)}. ` +
        'Run "pnpm -C packages/llm-tools run tools:generate" first.',
    );
  }

  const source =
    parsed && typeof parsed === 'object' && 'source' in parsed
      ? String((parsed as { source?: string }).source)
      : path.relative(root, found);
  const payload = {
    generatedAt: new Date().toISOString(),
    source,
    tools,
  };

  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`[tools:sync] Synced from ${path.relative(root, found)}`);
  console.log(`[tools:sync] Output: ${path.relative(root, outputPath)}`);
}

main().catch((error) => {
  console.error('[tools:sync] Failed:', error);
  process.exit(1);
});
