import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allTools } from '../src/definitions/index.js';
import { formatForGeneric } from '../src/formatters/generic.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');
const outDir = path.join(packageRoot, 'dist');
const outFile = path.join(outDir, 'tool-definitions.json');

async function main() {
  await fs.mkdir(outDir, { recursive: true });

  const payload = {
    generatedAt: new Date().toISOString(),
    tools: formatForGeneric(allTools),
  };

  await fs.writeFile(outFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`[llm-tools] Wrote ${path.relative(packageRoot, outFile)}`);
}

main().catch((error) => {
  console.error('[llm-tools] Failed to generate tools:', error);
  process.exit(1);
});
