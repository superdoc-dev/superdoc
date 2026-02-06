import path from 'node:path';
import process from 'node:process';
import { loadCases } from '../cases/loader.js';

async function main() {
  const repoRoot = process.cwd();
  const casesDir = path.join(repoRoot, 'cases');

  const result = await loadCases(casesDir);

  if (result.errors.length === 0) {
    if (result.cases.length === 0) {
      console.warn('[cases:validate] No case files found under cases/.');
      return;
    }
    console.log(`[cases:validate] Validated ${result.cases.length} file(s).`);
    return;
  }

  for (const error of result.errors) {
    console.error(`\n[cases:validate] ${path.relative(repoRoot, error.filePath)} failed validation:`);
    console.error(`  - ${error.message}`);
    if (error.issues) {
      for (const issue of error.issues) {
        console.error(`    - ${issue.path}: ${issue.message}`);
      }
    }
  }

  console.error(`\n[cases:validate] ${result.errors.length} file(s) failed.`);
  process.exit(1);
}

main().catch((error) => {
  console.error('[cases:validate] Unexpected failure:', error);
  process.exit(1);
});
