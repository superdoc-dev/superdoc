/**
 * Upload a test document to R2 for rendering tests.
 *
 * Usage:
 *   pnpm docs:upload <file>
 *
 * Prompts for an optional Linear issue ID and a short description,
 * then uploads to documents/rendering/<issue-id>-<description>.docx.
 *
 * Examples:
 *   pnpm docs:upload ~/Downloads/bug-repro.docx
 */
import fs from 'node:fs';
import path from 'node:path';
import { intro, outro, text, confirm, cancel, isCancel } from '@clack/prompts';
import { createR2Client, ensureR2Auth, DOCUMENTS_PREFIX } from './r2.js';

function toKebab(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function exitIfCancelled<T>(value: T | symbol): T {
  if (isCancel(value)) {
    cancel('Upload cancelled.');
    process.exit(0);
  }
  return value;
}

async function main() {
  const filePath = process.argv[2];

  if (!filePath) {
    console.error('Usage: pnpm docs:upload <file>');
    process.exit(1);
  }

  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    console.error(`File not found: ${resolved}`);
    process.exit(1);
  }

  ensureR2Auth();

  intro(`Upload: ${path.basename(resolved)}`);

  const issueId = exitIfCancelled(
    await text({
      message: 'Linear issue ID',
      placeholder: 'SD-1679 (press Enter to skip)',
      validate: (v) => {
        if (!v) return;
        if (!/^[A-Za-z]{2,}-\d+$/.test(v)) return 'Format: SD-1679';
      },
    }),
  );

  const description = exitIfCancelled(
    await text({
      message: 'Short description',
      placeholder: 'anchor-table-overlap',
      validate: (v) => {
        if (!v) return 'Description is required';
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v)) return 'Use kebab-case (e.g. anchor-table-overlap)';
      },
    }),
  );

  const parts = [issueId ? toKebab(issueId) : null, description].filter(Boolean);
  const fileName = `${parts.join('-')}.docx`;
  const key = `${DOCUMENTS_PREFIX}/rendering/${fileName}`;

  const confirmed = exitIfCancelled(
    await confirm({ message: `Upload as ${key}?` }),
  );

  if (!confirmed) {
    cancel('Upload cancelled.');
    process.exit(0);
  }

  const client = await createR2Client();
  await client.putObject(key, resolved, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  client.destroy();

  outro(
    `Uploaded! Next:\n` +
      `  1. pnpm docs:download          # pull the new file locally\n` +
      `  2. pnpm test                    # verify it loads and renders\n` +
      `  Baselines are generated in CI from the stable branch.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
