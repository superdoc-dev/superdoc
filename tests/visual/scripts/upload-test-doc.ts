/**
 * Upload a test document to R2.
 *
 * Usage:
 *   pnpm docs:upload <file> <category>
 *
 * Examples:
 *   pnpm docs:upload ~/Downloads/bug-repro.docx behavior/comments-tcs
 *   pnpm docs:upload ~/Downloads/table.docx rendering
 *
 * The file will be uploaded to: documents/<category>/<filename>
 */
import fs from 'node:fs';
import path from 'node:path';
import { createR2Client, DOCUMENTS_PREFIX } from './r2.js';

async function main() {
  const [filePath, category] = process.argv.slice(2);

  if (!filePath || !category) {
    console.error('Usage: pnpm docs:upload <file> <category>');
    console.error('');
    console.error('Categories match the test folder structure:');
    console.error('  behavior/basic-commands');
    console.error('  behavior/formatting');
    console.error('  behavior/comments-tcs');
    console.error('  behavior/lists');
    console.error('  behavior/field-annotations');
    console.error('  behavior/headers');
    console.error('  behavior/search');
    console.error('  behavior/importing');
    console.error('  behavior/structured-content');
    console.error('  rendering');
    process.exit(1);
  }

  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    console.error(`File not found: ${resolved}`);
    process.exit(1);
  }

  const fileName = path.basename(resolved);
  const key = `${DOCUMENTS_PREFIX}/${category}/${fileName}`;

  const client = await createR2Client();

  await client.putObject(key, resolved, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

  console.log(`Uploaded: ${key}`);
  console.log(`\nUse in your test:`);
  console.log(`  const DOC_PATH = path.join(DOCS_DIR, '${category}/${fileName}');`);

  client.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
