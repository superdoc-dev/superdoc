import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { executeTool } from '../sandbox/executor.js';
import type { SandboxState } from '../sandbox/state.js';
import { loadToolSnapshot } from '../tools/snapshot.js';

async function main() {
  const repoRoot = process.cwd();
  const fixturePath = path.join(repoRoot, 'fixtures', 'docs', 'simple_doc.json');
  const raw = await fs.readFile(fixturePath, 'utf8');
  const state = JSON.parse(raw) as SandboxState;
  const toolSnapshot = await loadToolSnapshot(repoRoot);

  const result = executeTool(
    state,
    'find_content',
    {
      selector: { type: 'text', pattern: 'service provider', flags: 'i' },
    },
    toolSnapshot,
  );

  if (!result.ok) {
    console.error(`[sandbox:smoke] Failed: ${result.error}`);
    process.exit(1);
  }

  const resultObj = result.result as { matches?: unknown[] };
  const matchCount = Array.isArray(resultObj.matches) ? resultObj.matches.length : 0;

  console.log(`[sandbox:smoke] ok; matches=${matchCount}`);
}

main().catch((error) => {
  console.error('[sandbox:smoke] Unexpected failure:', error);
  process.exit(1);
});
