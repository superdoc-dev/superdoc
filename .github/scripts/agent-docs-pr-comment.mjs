#!/usr/bin/env node
/**
 * Post a sticky PR comment with diff-scoped L1 findings.
 *
 * PR runs are deterministic only: no AI, no Bash, no secrets. The comment
 * includes only findings for agent-doc files changed by the PR.
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { computeFlags, pairFlaggedForReview, runL1Scan } from './agent-docs-l1.mjs';

const MARKER = '<!-- agent-docs-audit -->';
const PR = process.env.PR_NUMBER;
const REPO = process.env.REPO ?? 'superdoc-dev/superdoc';
const REPO_ROOT = resolve(process.env.REPO_ROOT ?? process.cwd());
const SHA = process.env.GITHUB_SHA ?? 'unknown-sha';
const DRY_RUN = process.argv.includes('--dry-run');

if (!PR && !DRY_RUN) {
  console.log('PR_NUMBER not set; not in a PR context. Skipping.');
  process.exit(0);
}

function isAgentDocPath(path) {
  if (/(?:^|\/)(?:AGENTS|CLAUDE)(?:\.local)?\.md$/.test(path)) return true;
  return /(?:^|\/)\.claude\/rules\/.+\.md$/.test(path);
}

function getChangedAgentDocs() {
  if (DRY_RUN) {
    const filesIdx = process.argv.indexOf('--files');
    if (filesIdx < 0 || !process.argv[filesIdx + 1]) return [];
    return process.argv[filesIdx + 1].split(',').map((p) => p.trim()).filter(Boolean).filter(isAgentDocPath);
  }

  try {
    const out = execFileSync('gh', ['pr', 'diff', PR, '--repo', REPO, '--name-only'], { encoding: 'utf-8' });
    return out.split('\n').map((p) => p.trim()).filter(Boolean).filter(isAgentDocPath);
  } catch (err) {
    console.log(`Could not list PR changed files: ${err.message}`);
    return [];
  }
}

function symlinkTargetRel(file) {
  if (!file.isSymlink || !file.symlinkTarget) return null;
  return relative(REPO_ROOT, file.symlinkTarget).replaceAll('\\', '/');
}

function changedPairDirs(paths) {
  const dirs = new Set();
  for (const path of paths) {
    if (/(?:^|\/)(?:AGENTS|CLAUDE)(?:\.local)?\.md$/.test(path)) {
      dirs.add(dirname(path));
    }
  }
  return dirs;
}

function collectFindings(scan, changed) {
  const filesByPath = new Map(scan.files.map((file) => [file.relPath, file]));
  const findings = [];

  for (const requestedPath of changed) {
    const requestedFile = filesByPath.get(requestedPath);
    if (!requestedFile) continue; // Deleted files are handled through pair findings where applicable.

    let file = requestedFile;
    const targetRel = symlinkTargetRel(requestedFile);
    if (targetRel && filesByPath.has(targetRel) && !requestedFile.brokenSymlinkTarget) {
      file = filesByPath.get(targetRel);
    }

    const reasons = computeFlags(file);
    if (reasons.length > 0) {
      findings.push({ type: 'file', requestedPath, file, reasons });
    }
  }

  const pairDirs = changedPairDirs(changed);
  for (const pair of scan.pairs) {
    if (!pairDirs.has(pair.dir)) continue;
    if (!pairFlaggedForReview(pair)) continue;
    findings.push({ type: 'pair', pair, reasons: [`${pair.classification}: ${pair.detail}`] });
  }

  return findings;
}

function formatFileFinding(finding) {
  const { requestedPath, file, reasons } = finding;
  const label = requestedPath === file.relPath
    ? `\`${file.relPath}\``
    : `\`${requestedPath}\` (canonical: \`${file.relPath}\`)`;
  const lines = [`### ${label} (${file.lineCount} lines)`, ''];
  for (const reason of reasons) lines.push(`- ${reason}`);

  if (file.brokenPathRefs.length > 0) {
    lines.push('', 'Broken path refs:');
    for (const ref of file.brokenPathRefs) lines.push(`  - \`${ref}\``);
  }
  if (file.brokenImports.length > 0) {
    lines.push('', 'Broken `@imports`:');
    for (const ref of file.brokenImports) lines.push(`  - \`${ref}\``);
  }
  if (file.unresolvedCommands.length > 0) {
    lines.push('', 'Unresolved pnpm commands (advisory):');
    for (const ref of file.unresolvedCommands) lines.push(`  - \`${ref}\``);
  }

  return lines.join('\n');
}

function formatPairFinding(finding) {
  const dir = finding.pair.dir === '.' ? '(root)' : finding.pair.dir;
  return [
    `### \`${dir}\` pair`,
    '',
    `- ${finding.pair.classification}: ${finding.pair.detail}`,
  ].join('\n');
}

function buildFindingsBody(findings) {
  const lines = [
    MARKER,
    '## Agent docs audit',
    '',
    `Found deterministic findings on ${findings.length} changed agent-doc item(s).`,
    '',
  ];

  for (const finding of findings) {
    lines.push(finding.type === 'pair' ? formatPairFinding(finding) : formatFileFinding(finding));
    lines.push('');
  }

  lines.push('---');
  lines.push('Deterministic L1 only: no AI, no Bash, no secrets. Semantic L2/L3 audit runs weekly on `main`. Policy: `agent-docs-policy.md`.');
  return lines.join('\n');
}

function buildResolvedBody(changed) {
  const files = changed.map((path) => `\`${path}\``).join(', ');
  return [
    MARKER,
    '## Agent docs audit',
    '',
    `All changed agent-doc files are clean as of \`${SHA.slice(0, 12)}\`.`,
    '',
    files ? `Checked: ${files}` : 'No changed agent-doc files detected.',
  ].join('\n');
}

function getExistingCommentId() {
  try {
    const out = execFileSync('gh', ['api', `/repos/${REPO}/issues/${PR}/comments`, '--paginate'], { encoding: 'utf-8' });
    const comments = JSON.parse(out);
    const match = comments.find((comment) => typeof comment.body === 'string' && comment.body.startsWith(MARKER));
    return match ? match.id : null;
  } catch (err) {
    console.log(`Could not list existing comments: ${err.message}`);
    return null;
  }
}

function upsertComment(body) {
  const tmpFile = join(tmpdir(), `agent-docs-comment-${process.pid}.json`);
  writeFileSync(tmpFile, JSON.stringify({ body }));
  const existing = getExistingCommentId();

  try {
    if (existing) {
      execFileSync('gh', ['api', '-X', 'PATCH', `/repos/${REPO}/issues/comments/${String(existing)}`, '--input', tmpFile], { stdio: 'inherit' });
      console.log(`Updated comment ${existing}`);
    } else {
      execFileSync('gh', ['api', '-X', 'POST', `/repos/${REPO}/issues/${PR}/comments`, '--input', tmpFile], { stdio: 'inherit' });
      console.log('Created comment');
    }
  } catch (err) {
    const msg = String(err.message || err);
    if (/403|Resource not accessible|forbid/i.test(msg)) {
      console.log('No write access (fork PR or read-only token). Skipping comment gracefully.');
      process.exit(0);
    }
    throw err;
  }
}

const changed = getChangedAgentDocs();
if (changed.length === 0) {
  console.log('No agent-doc files changed in this PR. Skipping comment.');
  process.exit(0);
}

console.log(`Changed agent-doc files: ${changed.join(', ')}`);

const scan = runL1Scan(REPO_ROOT);
const findings = collectFindings(scan, changed);
const body = findings.length > 0 ? buildFindingsBody(findings) : buildResolvedBody(changed);

if (DRY_RUN) {
  console.log('\n--- comment body ---\n');
  console.log(body);
  process.exit(0);
}

if (findings.length === 0) {
  const existing = getExistingCommentId();
  if (!existing) {
    console.log('No L1 findings and no previous sticky comment. Skipping comment.');
    process.exit(0);
  }
}

upsertComment(body);
