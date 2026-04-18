/**
 * Upload a test document to R2 for rendering tests.
 *
 * Usage:
 *   pnpm docs:upload <file>
 *   pnpm docs:upload <file> --issue SD-2190 --description docpart-first-paragraph
 *
 * Prompts for an optional Linear issue ID and a short description,
 * then uploads to rendering/<issue-id>-<description>.docx in the shared corpus.
 *
 * When --issue and --description are provided, runs non-interactively.
 *
 * Examples:
 *   pnpm docs:upload ~/Downloads/bug-repro.docx
 *   pnpm docs:upload ~/Downloads/bug-repro.docx --issue SD-2190 --description docpart-first-paragraph
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { intro, outro, text, confirm, cancel, isCancel } from '@clack/prompts';

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

function parseCliFlags(argv: string[]): { filePath: string; issue?: string; description?: string } {
  let filePath = '';
  let issue: string | undefined;
  let description: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--issue' && next) {
      issue = next;
      i++;
    } else if (arg === '--description' && next) {
      description = next;
      i++;
    } else if (!arg.startsWith('--')) {
      filePath = arg;
    }
  }

  return { filePath, issue, description };
}

async function main() {
  const flags = parseCliFlags(process.argv.slice(2));

  if (!flags.filePath) {
    console.error('Usage: pnpm docs:upload <file> [--issue SD-1234] [--description short-desc]');
    process.exit(1);
  }

  const resolved = path.resolve(flags.filePath);
  if (!fs.existsSync(resolved)) {
    console.error(`File not found: ${resolved}`);
    process.exit(1);
  }

  const nonInteractive = !!(flags.issue !== undefined && flags.description);

  let issueId: string;
  let description: string;

  if (nonInteractive) {
    issueId = flags.issue!;
    description = flags.description!;

    if (issueId && !/^[A-Za-z]{2,}-\d+$/.test(issueId)) {
      console.error('Invalid issue ID format. Expected: SD-1679');
      process.exit(1);
    }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(description)) {
      console.error('Description must be kebab-case (e.g. anchor-table-overlap)');
      process.exit(1);
    }
  } else {
    intro(`Upload: ${path.basename(resolved)}`);

    issueId = exitIfCancelled(
      await text({
        message: 'Linear issue ID',
        placeholder: 'SD-1679 (press Enter to skip)',
        validate: (v) => {
          if (!v) return;
          if (!/^[A-Za-z]{2,}-\d+$/.test(v)) return 'Format: SD-1679';
        },
      }),
    ) as string;

    description = exitIfCancelled(
      await text({
        message: 'Short description',
        placeholder: 'anchor-table-overlap',
        validate: (v) => {
          if (!v) return 'Description is required';
          if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v)) return 'Use kebab-case (e.g. anchor-table-overlap)';
        },
      }),
    ) as string;
  }

  const parts = [issueId ? toKebab(issueId) : null, description].filter(Boolean);
  const fileName = `${parts.join('-')}.docx`;
  const targetRelativePath = `rendering/${fileName}`;

  if (nonInteractive) {
    console.log(`Uploading as ${targetRelativePath}...`);
  } else {
    const confirmed = exitIfCancelled(await confirm({ message: `Upload as ${targetRelativePath}?` }));

    if (!confirmed) {
      cancel('Upload cancelled.');
      process.exit(0);
    }
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

  const nextSteps =
    `Uploaded! Next:\n` +
    `  1. pnpm corpus:pull             # pull the new file locally\n` +
    `  2. pnpm test:visual             # verify it renders correctly`;

  if (nonInteractive) {
    console.log(nextSteps);
  } else {
    outro(nextSteps);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
