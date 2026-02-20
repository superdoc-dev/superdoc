/**
 * Upload a test document to R2 for rendering tests.
 *
 * Usage:
 *   pnpm docs:upload <file>
 *
 * Prompts for an optional Linear issue ID and a short description,
 * then uploads to rendering/<issue-id>-<description>.docx in the shared corpus.
 *
 * Examples:
 *   pnpm docs:upload ~/Downloads/bug-repro.docx
 */
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { intro, outro, text, confirm, cancel, isCancel, log } from '@clack/prompts';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');

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
  const targetRelativePath = `rendering/${fileName}`;

  const confirmed = exitIfCancelled(await confirm({ message: `Upload as ${targetRelativePath}?` }));

  if (!confirmed) {
    cancel('Upload cancelled.');
    process.exit(0);
  }

  const uploadArgs = ['run', 'corpus:push', '--', '--path', targetRelativePath, resolved];
  const uploadChild = spawn('pnpm', uploadArgs, {
    cwd: REPO_ROOT,
    env: process.env,
    stdio: 'inherit',
  });
  const uploadExitCode = await new Promise<number>((resolve) => {
    uploadChild.on('close', (code) => resolve(code ?? 1));
    uploadChild.on('error', (err) => {
      console.error(`Failed to spawn corpus:push: ${err.message}`);
      resolve(1);
    });
  });
  if (uploadExitCode !== 0) {
    throw new Error(`Corpus upload failed with exit code ${uploadExitCode}.`);
  }

  // Trigger baseline generation if gh CLI is available
  let triggered = false;
  try {
    execSync('gh auth status', { stdio: 'ignore' });
    const trigger = exitIfCancelled(await confirm({ message: 'Trigger baseline generation in CI?' }));
    if (trigger) {
      execSync('gh workflow run visual-baseline.yml --repo superdoc-dev/superdoc', { stdio: 'inherit' });
      triggered = true;
    }
  } catch {
    log.info('Tip: run `gh auth login` to auto-trigger baseline generation after upload.');
  }

  outro(
    `Uploaded! Next:\n` +
      `  1. pnpm docs:download          # pull the new file locally\n` +
      `  2. pnpm test                    # verify it loads and renders\n` +
      (triggered
        ? `  Baselines are being generated in CI from the stable branch.`
        : `  Baselines: trigger manually via gh workflow run visual-baseline.yml`),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
