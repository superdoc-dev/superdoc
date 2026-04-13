#!/usr/bin/env node
/**
 * Interactive DOCX output reviewer.
 *
 * Opens each benchmark output file one at a time in Word/Preview.
 * Shows an AppleScript dialog explaining what to look for.
 * Waits for you to close the dialog before opening the next file.
 *
 * Usage: node evals/scripts/review-docx-outputs.mjs
 */

import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS = resolve(__dirname, '../artifacts/benchmark-runs/latest.json');

if (!existsSync(RESULTS)) {
  console.error('No results at', RESULTS);
  process.exit(1);
}

const d = JSON.parse(readFileSync(RESULTS, 'utf8'));

// Collect output files with context
const files = [];
for (const r of d.results.results) {
  const o = JSON.parse(r.response?.output || '{}');
  if (!o.outputFile || !existsSync(o.outputFile)) continue;
  if (!r.vars?.keepFile) continue;

  const provider = r.provider?.label || '?';
  const task = r.vars?.task || '?';
  const taskShort = (r.test?.description || task).substring(0, 50);
  const status = r.error ? 'ERROR' : r.success ? 'PASS' : 'FAIL';
  const steps = o.stepCount || 0;
  const path = o.pathUsed || '?';

  files.push({ provider, task, taskShort, status, steps, path, file: o.outputFile });
}

// Group by task for better review flow
const byTask = {};
for (const f of files) {
  const key = f.task.substring(0, 40);
  if (!byTask[key]) byTask[key] = [];
  byTask[key].push(f);
}

// What to look for per task type
const reviewGuide = {
  'Replace': [
    'Is "SuperDoc Inc" (or "Apex Holdings") present throughout?',
    'Is the old name ("Amazing") completely gone?',
    'Is "TechCraft" still intact (collateral)?',
    'Is the formatting preserved? (bold, font, size unchanged)',
    'Are headings, numbering, and styles intact?',
  ],
  'section': [
    'Is the "Force Majeure" heading present at the end?',
    'Does it have Heading 1 style (large, bold)?',
    'Is the body paragraph below the heading?',
    'Is the rest of the document unchanged?',
  ],
  'placeholder': [
    'Is "Jane Smith" present where "[Candidate Name]" was?',
    'Are ALL occurrences replaced (check header, body, signature)?',
    'Is formatting preserved around the replacement?',
  ],
  'table': [
    'Is there a summary table at the end?',
    'Does it have the correct columns and data?',
    'Does it have borders and proper alignment?',
    'Is the rest of the document unchanged?',
  ],
  'bold': [
    'Is "TechCraft LLC" displayed in bold?',
    'Are ALL occurrences bold (not just the first)?',
    'Is the text content unchanged (no extra/missing words)?',
  ],
  'tracked': [
    'Is there a tracked change showing $500,000 → $750,000?',
    'Is it shown as a suggestion (not a direct edit)?',
    'Enable "Track Changes" view in Word to verify.',
    'Is the rest of the document unchanged?',
  ],
  'comment': [
    'Is there a comment on the indemnification clause?',
    'Does the comment text mention "legal review" or similar?',
    'Is the comment anchored to the right text?',
    'Open the Comments pane in Word to verify.',
  ],
  'heading': [
    'Is there a properly styled heading (Heading 1)?',
    'Does it appear at the right position in the document?',
    'Is the heading text correct?',
  ],
};

function getGuide(task) {
  for (const [key, guide] of Object.entries(reviewGuide)) {
    if (task.toLowerCase().includes(key.toLowerCase())) return guide;
  }
  return ['Check that the edit was applied correctly.', 'Check that unrelated content is unchanged.'];
}

function showDialog(title, message) {
  const escaped = message.replace(/"/g, '\\"').replace(/\n/g, '\\n');
  try {
    const result = execSync(`osascript -e 'button returned of (display dialog "${escaped}" with title "${title}" buttons {"Skip Rest", "Next"} default button "Next")'`, { encoding: 'utf8' }).trim();
    return result === 'Skip Rest' ? 'skip' : 'next';
  } catch {
    return 'skip';
  }
}

function openFile(path) {
  execSync(`open "${path}"`);
}

// Review flow
const taskEntries = Object.entries(byTask);
let fileIndex = 0;
const total = files.length;

console.log(`Found ${total} output files across ${taskEntries.length} tasks.`);
console.log('Opening files one at a time with review guidance.');
console.log('');

for (const [taskKey, taskFiles] of taskEntries) {
  // Sort: SuperDoc MCP first, then baseline, for easy comparison
  taskFiles.sort((a, b) => {
    const order = { 'superdoc-skill': 0, 'superdoc-cli': 1, 'raw': 2, 'vendor-skill': 3 };
    return (order[a.path] ?? 4) - (order[b.path] ?? 4);
  });

  for (const f of taskFiles) {
    fileIndex++;
    const guide = getGuide(f.task);
    const guideText = guide.map((g, i) => `${i + 1}. ${g}`).join('\\n');

    const title = `[${fileIndex}/${total}] ${f.status} — ${f.provider}`;
    const message = [
      `Task: ${f.taskShort}`,
      `Provider: ${f.provider}`,
      `Status: ${f.status} | Path: ${f.path} | Steps: ${f.steps}`,
      ``,
      `What to look for:`,
      ...guide.map((g, i) => `${i + 1}. ${g}`),
      ``,
      `File: ${f.file.split('/').pop()}`,
    ].join('\\n');

    console.log(`[${fileIndex}/${total}] ${f.status} ${f.provider.padEnd(22)} ${f.taskShort}`);

    openFile(f.file);
    const action = showDialog(title, message);

    if (action === 'skip') {
      console.log('Skipping remaining files.');
      process.exit(0);
    }
  }
}

console.log('');
console.log('Review complete!');
