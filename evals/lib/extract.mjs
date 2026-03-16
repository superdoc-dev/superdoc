#!/usr/bin/env node

/**
 * Extract essential tool definitions from SDK-generated artifacts.
 *
 * Reads:
 *   packages/sdk/tools/tools-policy.json   (committed -- lists essentialTools)
 *   packages/sdk/tools/tools.openai.json   (generated -- full OpenAI-format tools)
 *
 * Writes:
 *   evals/lib/essential.json               (subset for promptfoo)
 *
 * If SDK artifacts are missing, run `pnpm run generate:all` from repo root.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');
const SDK_TOOLS = resolve(REPO_ROOT, 'packages/sdk/tools');

async function readJSON(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    console.error(`Cannot read ${path}.\nRun "pnpm run generate:all" from repo root first.`);
    process.exit(1);
  }
}

async function main() {
  const policy = await readJSON(resolve(SDK_TOOLS, 'tools-policy.json'));
  const bundle = await readJSON(resolve(SDK_TOOLS, 'tools.openai.json'));

  const essentialNames = new Set(policy.essentialTools);

  // Extract matching tools from the full bundle
  const tools = bundle.tools.filter((t) => essentialNames.has(t.function?.name));

  // Add discover_tools as a synthetic tool (it's a meta-tool, not in the catalog)
  tools.push({
    type: 'function',
    function: {
      name: policy.discoverTool.name,
      description: policy.discoverTool.description,
      parameters: policy.discoverTool.schema,
    },
  });

  const found = new Set(tools.map((t) => t.function.name));
  const expected = new Set([...essentialNames, 'discover_tools']);
  const missing = [...expected].filter((n) => !found.has(n));
  if (missing.length > 0) {
    console.warn(`Warning: missing tools: ${missing.join(', ')}`);
  }

  await mkdir(dirname(resolve(__dirname, 'essential.json')), { recursive: true });
  await writeFile(
    resolve(__dirname, 'essential.json'),
    JSON.stringify(tools, null, 2) + '\n',
  );

  console.log(`Extracted ${tools.length} essential tools -> lib/essential.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
