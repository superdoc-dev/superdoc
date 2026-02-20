import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadContract, REPO_ROOT } from './shared.mjs';
import { generateNodeSdk } from './generate-node.mjs';
import { generatePythonSdk } from './generate-python.mjs';
import { generateToolCatalogs } from './generate-tool-catalogs.mjs';

/**
 * When SDK_CODEGEN_OUTPUT_ROOT is set (for --check mode), redirect outputs
 * to subdirectories under that root instead of the real repo paths.
 */
const outputRoot = process.env.SDK_CODEGEN_OUTPUT_ROOT;

function redirectedWriteGeneratedFile(filePath, content) {
  const relToRepo = path.relative(REPO_ROOT, filePath);
  let destPath;

  if (relToRepo.startsWith(path.join('packages', 'sdk', 'langs', 'node', 'src', 'generated'))) {
    const relPart = path.relative(path.join(REPO_ROOT, 'packages/sdk/langs/node/src/generated'), filePath);
    destPath = path.join(outputRoot, 'node-generated', relPart);
  } else if (relToRepo.startsWith(path.join('packages', 'sdk', 'langs', 'python', 'superdoc', 'generated'))) {
    const relPart = path.relative(path.join(REPO_ROOT, 'packages/sdk/langs/python/superdoc/generated'), filePath);
    destPath = path.join(outputRoot, 'python-generated', relPart);
  } else if (relToRepo.startsWith(path.join('packages', 'sdk', 'tools'))) {
    const relPart = path.relative(path.join(REPO_ROOT, 'packages/sdk/tools'), filePath);
    destPath = path.join(outputRoot, 'tools', relPart);
  } else {
    destPath = path.join(outputRoot, 'other', path.basename(filePath));
  }

  return mkdir(path.dirname(destPath), { recursive: true })
    .then(() => writeFile(destPath, content, 'utf8'));
}

async function main() {
  const contract = await loadContract();

  // Set global redirect function for --check mode (shared.mjs reads this)
  if (outputRoot) {
    globalThis.__SDK_CODEGEN_WRITE_FN = redirectedWriteGeneratedFile;
  }

  await Promise.all([
    generateNodeSdk(contract),
    generatePythonSdk(contract),
    generateToolCatalogs(contract),
  ]);

  console.log('Generated Node + Python SDKs + tool catalogs from contract.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
