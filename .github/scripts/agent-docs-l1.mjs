#!/usr/bin/env node
/**
 * Layer 1: deterministic agent-docs scan. No model calls, no network.
 *
 * Walks the repo (respecting ignore patterns), inventories every agent doc,
 * classifies AGENTS.md/CLAUDE.md pairs, detects broken @imports and broken
 * path refs (with context-aware resolution), surfaces over-budget files.
 *
 * Exported entry: runL1Scan(repoRoot) -> { files, pairs, config }
 * CLI mode: prints a Markdown report to stdout. Usage:
 *   node agent-docs-l1.mjs [--target <path>]
 */

import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

// ── Config ─────────────────────────────────────────────────────────────────
// Inline for SuperDoc. If we extend this script to other repos, lift to YAML.

export const CONFIG = {
  budgets: { root: 120, nestedWarn: 200 },
  ignore: [
    'node_modules',
    '.git',
    '.tmp',
    'dist',
    'tests/consumer-typecheck/node_modules',
  ],
  intentionalDifferentPairs: ['packages/superdoc/AGENTS.md:packages/superdoc/CLAUDE.md'],
  canonicalSymlinkTarget: 'AGENTS.md',
  knownCommands: [
    'pnpm test',
    'pnpm dev',
    'pnpm build',
    'pnpm docs:download',
    'pnpm docs:upload',
  ],
  docBasenames: new Set(['AGENTS.md', 'CLAUDE.md', 'CLAUDE.local.md']),
  rulesDir: '.claude/rules',
};

// ── Walk ───────────────────────────────────────────────────────────────────

function shouldIgnore(relPath) {
  for (const ig of CONFIG.ignore) {
    if (relPath === ig || relPath.startsWith(`${ig}/`)) return true;
    if (relPath.includes(`/${ig}/`) || relPath.endsWith(`/${ig}`)) return true;
  }
  return false;
}

function findAgentDocs(repoRoot) {
  const found = [];
  function walk(absDir, relDir) {
    let entries;
    try {
      entries = readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (shouldIgnore(relPath)) continue;
      const abs = join(absDir, entry.name);
      if (entry.isSymbolicLink()) {
        // A symlinked AGENTS.md or CLAUDE.md still counts.
        if (CONFIG.docBasenames.has(entry.name)) found.push(relPath);
        continue;
      }
      if (entry.isDirectory()) {
        walk(abs, relPath);
        continue;
      }
      if (entry.isFile()) {
        if (CONFIG.docBasenames.has(entry.name)) found.push(relPath);
        else if (relDir.endsWith(CONFIG.rulesDir) && entry.name.endsWith('.md')) found.push(relPath);
      }
    }
  }
  walk(repoRoot, '');
  return found.sort();
}

// ── Per-file inspection ────────────────────────────────────────────────────

function inspectFile(repoRoot, relPath) {
  const abs = join(repoRoot, relPath);
  const lst = lstatSync(abs);
  const isSymlink = lst.isSymbolicLink();
  let symlinkTarget = null;
  let brokenSymlinkTarget = null;
  if (isSymlink) {
    const raw = readlinkSync(abs);
    symlinkTarget = isAbsolute(raw) ? raw : resolve(dirname(abs), raw);
    if (!existsSync(symlinkTarget)) brokenSymlinkTarget = symlinkTarget;
  }

  // If the symlink target is missing, readFileSync(abs) would follow the link
  // and throw ENOENT, killing the audit before any artifacts upload. Catch
  // and surface as a finding instead.
  if (brokenSymlinkTarget) {
    return {
      relPath,
      absPath: abs,
      isSymlink: true,
      symlinkTarget,
      brokenSymlinkTarget,
      lineCount: 0,
      brokenPathRefs: [],
      brokenImports: [],
      unresolvedCommands: [],
      sections: [],
    };
  }

  const readPath = isSymlink && symlinkTarget ? symlinkTarget : abs;
  let content = '';
  try {
    content = readFileSync(readPath, 'utf-8');
  } catch (err) {
    return {
      relPath,
      absPath: abs,
      isSymlink,
      symlinkTarget,
      brokenSymlinkTarget: readPath,
      readError: err.message,
      lineCount: 0,
      brokenPathRefs: [],
      brokenImports: [],
      unresolvedCommands: [],
      sections: [],
    };
  }
  const newlines = (content.match(/\n/g) ?? []).length;
  const lineCount = content.endsWith('\n') ? newlines : newlines + 1;

  return {
    relPath,
    absPath: abs,
    isSymlink,
    symlinkTarget,
    lineCount,
    brokenPathRefs: findBrokenPathRefs(content, repoRoot, relPath),
    brokenImports: findBrokenImports(content, dirname(abs)),
    unresolvedCommands: findUnresolvedCommands(content, repoRoot),
    sections: extractSections(content),
  };
}

function stripCodeBlocks(content) {
  return content.replace(/```[\s\S]*?```/g, '');
}

function findPackageRoot(docRelPath) {
  const parts = docRelPath.split('/');
  if (parts.length < 2) return null;
  if (['packages', 'apps', 'shared'].includes(parts[0])) return `${parts[0]}/${parts[1]}`;
  if (parts[0] === 'tests') return parts.slice(0, 2).join('/');
  return null;
}

function looksLikeFilesystemPath(s) {
  if (!s || s.length < 2 || s.length > 160) return false;
  if (!s.includes('/')) return false;
  if (/\s/.test(s)) return false;
  if (/^https?:\/\//.test(s)) return false;
  if (/[*?{}[\]<>]/.test(s)) return false;
  if (s.startsWith('@') || s.startsWith('~/')) return false;
  if (/^[a-z]+:\/\//i.test(s)) return false;
  if (/^cdn\./.test(s) || /^unpkg\./.test(s)) return false;
  if (/^\/[a-z]/.test(s) && /(icon|image|img|asset|file|path)/i.test(s)) return false;
  if (/^(cd|pnpm|npm|yarn|bun|node|git|ls|cat|grep|find|sed|awk|mkdir|rm|mv|cp|echo|export|source|sudo|brew|docker|curl|wget)\b/.test(s)) return false;
  return /[a-zA-Z0-9_.-]\/[a-zA-Z0-9_.-]/.test(s);
}

function resolveInContext(repoRoot, candidate, docDir, pkgRoot) {
  const tryPaths = [candidate];
  if (docDir && docDir !== '.') tryPaths.push(`${docDir}/${candidate}`);
  if (pkgRoot) tryPaths.push(`${pkgRoot}/${candidate}`);
  tryPaths.push(`packages/${candidate}`, `apps/${candidate}`, `shared/${candidate}`);
  for (const p of tryPaths) {
    const norm = p.replace(/\/+/g, '/');
    if (existsSync(join(repoRoot, norm))) return true;
  }
  return false;
}

function findBrokenPathRefs(content, repoRoot, docRelPath) {
  const prose = stripCodeBlocks(content);
  const docDir = dirname(docRelPath);
  const pkgRoot = findPackageRoot(docRelPath);
  const refs = new Set();
  const re = /`([^`\n]{2,200})`/g;
  let m;
  while ((m = re.exec(prose)) !== null) {
    const candidate = m[1].trim().replace(/[#?].*$/, '');
    if (!looksLikeFilesystemPath(candidate)) continue;
    if (resolveInContext(repoRoot, candidate, docDir, pkgRoot)) continue;
    refs.add(candidate);
  }
  return [...refs].sort();
}

function findBrokenImports(content, fileDir) {
  const refs = new Set();
  const re = /@([\w./@~-]+\.md)/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const path = m[1];
    if (path.startsWith('~/')) continue;
    const resolved = path.startsWith('/') ? path : resolve(fileDir, path);
    if (!existsSync(resolved)) refs.add(path);
  }
  return [...refs].sort();
}

function findUnresolvedCommands(content, repoRoot) {
  const refs = new Set();
  const re = /\bpnpm\s+(?:run\s+|--filter\s+\S+\s+(?:run\s+)?)?([a-zA-Z][\w:.\-]*)/g;
  const pkgPath = join(repoRoot, 'package.json');
  let scripts = new Set();
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      scripts = new Set(Object.keys(pkg.scripts ?? {}));
    } catch {
      /* skip */
    }
  }
  const builtins = new Set(['install', 'add', 'remove', 'update', 'i', 'audit', 'list', 'ls', 'why', 'outdated', 'exec', 'run']);
  const known = new Set(CONFIG.knownCommands.map((c) => c.replace(/^pnpm /, '')));
  let m;
  while ((m = re.exec(content)) !== null) {
    const script = m[1];
    if (scripts.has(script) || builtins.has(script) || known.has(script)) continue;
    refs.add(`pnpm ${script}`);
  }
  return [...refs].sort();
}

function extractSections(content) {
  const lines = content.split('\n');
  const sections = [];
  let cur = null;
  lines.forEach((line, i) => {
    if (/^##\s+/.test(line)) {
      if (cur) sections.push({ header: cur.header, lines: i - cur.start });
      cur = { header: line.replace(/^##\s+/, '').trim(), start: i };
    }
  });
  if (cur) sections.push({ header: cur.header, lines: lines.length - cur.start });
  return sections.sort((a, b) => b.lines - a.lines);
}

// ── Pair classification ────────────────────────────────────────────────────

function classifyPairs(files) {
  const byDir = new Map();
  for (const f of files) {
    const dir = dirname(f.relPath);
    const entry = byDir.get(dir) ?? {};
    const base = f.relPath.split('/').pop();
    if (base === 'AGENTS.md') entry.agents = f;
    if (base === 'CLAUDE.md') entry.claude = f;
    byDir.set(dir, entry);
  }
  const intentional = new Set(CONFIG.intentionalDifferentPairs);
  const pairs = [];
  for (const [dir, e] of byDir) {
    if (!e.agents && !e.claude) continue;
    if (!e.agents || !e.claude) {
      pairs.push({ dir, classification: 'single', detail: e.agents ? 'only AGENTS.md' : 'only CLAUDE.md' });
      continue;
    }
    const a = e.agents;
    const c = e.claude;
    const key1 = `${a.relPath}:${c.relPath}`;
    const key2 = `${c.relPath}:${a.relPath}`;
    if (intentional.has(key1) || intentional.has(key2)) {
      pairs.push({ dir, classification: 'intentional-different', detail: `allowlisted: ${a.lineCount}L vs ${c.lineCount}L` });
      continue;
    }
    const agentsPointsToClaude = a.isSymlink && a.symlinkTarget === c.absPath;
    const claudePointsToAgents = c.isSymlink && c.symlinkTarget === a.absPath;
    if (agentsPointsToClaude || claudePointsToAgents) {
      const canonical = agentsPointsToClaude ? 'CLAUDE.md' : 'AGENTS.md';
      const classification = canonical === CONFIG.canonicalSymlinkTarget ? 'linked' : 'linked-inverted';
      const detail = canonical === CONFIG.canonicalSymlinkTarget
        ? `canonical: ${canonical}`
        : `canonical: ${canonical}; expected ${CONFIG.canonicalSymlinkTarget}`;
      pairs.push({ dir, classification, detail });
      continue;
    }
    // Either side might be a broken symlink we already flagged; if so we
    // can't read its content, so report the pair as unexpected-duplicate
    // without the byte-match check.
    let aContent = '';
    let cContent = '';
    try { aContent = readFileSync(a.absPath, 'utf-8'); } catch { aContent = null; }
    try { cContent = readFileSync(c.absPath, 'utf-8'); } catch { cContent = null; }
    let detail;
    if (aContent === null || cContent === null) {
      detail = `one side unreadable (broken symlink?); cannot byte-compare`;
    } else if (aContent === cContent) {
      detail = `byte-for-byte duplicate (${a.lineCount}L), not symlinked`;
    } else {
      detail = `divergent (${a.lineCount}L vs ${c.lineCount}L), not in intentional-different allowlist`;
    }
    pairs.push({ dir, classification: 'unexpected-duplicate', detail });
  }
  return pairs.sort((p, q) => p.dir.localeCompare(q.dir));
}

// ── Entry ──────────────────────────────────────────────────────────────────

export function runL1Scan(repoRoot) {
  const docPaths = findAgentDocs(repoRoot);
  const files = docPaths.map((p) => inspectFile(repoRoot, p));
  const pairs = classifyPairs(files);
  return { files, pairs, config: CONFIG };
}

// Compute deterministic flags for every file. Used both for the L1 markdown
// (so PR-mode reports surface single-finding issues) and as input to the
// L2/L3 gating below.
export function computeFlags(file) {
  const reasons = [];
  if (file.brokenSymlinkTarget) reasons.push(`broken symlink target: ${file.brokenSymlinkTarget}`);
  if (file.isSymlink) return reasons;
  const isRoot = !file.relPath.includes('/');
  if (isRoot && file.lineCount > CONFIG.budgets.root) reasons.push(`over root budget (${file.lineCount} > ${CONFIG.budgets.root})`);
  if (!isRoot && file.lineCount > CONFIG.budgets.nestedWarn) reasons.push(`over nested-warn (${file.lineCount} > ${CONFIG.budgets.nestedWarn})`);
  if (file.brokenPathRefs.length > 0) reasons.push(`${file.brokenPathRefs.length} broken path ref(s)`);
  if (file.brokenImports.length > 0) reasons.push(`${file.brokenImports.length} broken @import(s)`);
  if (file.unresolvedCommands.length > 0) reasons.push(`${file.unresolvedCommands.length} unresolved command(s)`);
  return reasons;
}

export function pairFlaggedForReview(pair) {
  if (pair.classification === 'linked-inverted') return true;
  if (pair.classification === 'unexpected-duplicate') return true;
  return false;
}

// L2/L3 gating: stricter than computeFlags. A single-broken-ref doc still
// appears in the L1 report (via computeFlags) but only triggers paid L2/L3
// review when there are 2+ broken refs or budget is significantly exceeded.
export function flaggedForReview(scan) {
  return scan.files
    .map((f) => ({ ...f, reasons: computeFlags(f) }))
    .filter((f) => {
      if (f.reasons.length === 0) return false;
      if (f.isSymlink) return false;
      const isRoot = !f.relPath.includes('/');
      if (f.brokenPathRefs.length >= 2) return true;
      if (f.brokenImports.length >= 1) return true; // any broken @import is high-signal
      if (isRoot ? f.lineCount > 144 : f.lineCount > 240) return true;
      return false;
    });
}

export function renderL1Markdown(scan) {
  const lines = [`# Agent docs L1 audit\n`];
  lines.push(`Found ${scan.files.length} agent-doc files in ${new Set(scan.files.map((f) => dirname(f.relPath))).size} directories.\n`);

  // Inventory
  lines.push('## Inventory\n');
  lines.push('| File | Lines | Kind | Notes |');
  lines.push('|---|---|---|---|');
  for (const f of [...scan.files].sort((a, b) => b.lineCount - a.lineCount)) {
    const isRoot = !f.relPath.includes('/');
    let kind = 'file';
    if (f.isSymlink) {
      kind = f.brokenSymlinkTarget
        ? `symlink → BROKEN (${relative(process.cwd(), f.brokenSymlinkTarget) || f.brokenSymlinkTarget})`
        : `symlink → ${relative(process.cwd(), f.symlinkTarget) || '?'}`;
    }
    const notes = isRoot && f.lineCount > CONFIG.budgets.root
      ? `over root budget (${f.lineCount} > ${CONFIG.budgets.root})`
      : !isRoot && f.lineCount > CONFIG.budgets.nestedWarn
        ? `over nested-warn (${f.lineCount} > ${CONFIG.budgets.nestedWarn})`
        : '';
    lines.push(`| \`${f.relPath}\` | ${f.lineCount} | ${kind} | ${notes} |`);
  }

  // Pairs
  lines.push('\n## Pair classification\n');
  lines.push('| Directory | Class | Detail |');
  lines.push('|---|---|---|');
  for (const p of scan.pairs) lines.push(`| \`${p.dir || '(root)'}\` | ${p.classification} | ${p.detail} |`);

  // Deterministic findings (per-doc broken refs/imports/commands). Non-symlinks
  // only, since symlinks share content with their target.
  const findingsByFile = [];
  for (const f of scan.files) {
    if (f.isSymlink) continue;
    const reasons = computeFlags(f);
    if (reasons.length === 0) continue;
    findingsByFile.push({ file: f, reasons });
  }
  lines.push('\n## Deterministic findings\n');
  const pairFindings = scan.pairs.filter(pairFlaggedForReview);
  if (findingsByFile.length === 0 && pairFindings.length === 0) {
    lines.push('None.\n');
  } else {
    for (const pair of pairFindings) {
      lines.push(`### \`${pair.dir || '(root)'}\`\n`);
      lines.push(`- ${pair.classification}: ${pair.detail}\n`);
    }
    for (const { file, reasons } of findingsByFile) {
      lines.push(`### \`${file.relPath}\`\n`);
      lines.push(reasons.map((r) => `- ${r}`).join('\n'));
      if (file.brokenPathRefs.length > 0) {
        lines.push('\nBroken path refs:');
        for (const r of file.brokenPathRefs) lines.push(`  - \`${r}\``);
      }
      if (file.brokenImports.length > 0) {
        lines.push('\nBroken @imports:');
        for (const r of file.brokenImports) lines.push(`  - \`${r}\``);
      }
      if (file.unresolvedCommands.length > 0) {
        lines.push('\nUnresolved commands (advisory):');
        for (const r of file.unresolvedCommands) lines.push(`  - \`${r}\``);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

// CLI mode
if (import.meta.url === `file://${process.argv[1]}`) {
  const targetIdx = process.argv.indexOf('--target');
  const target = targetIdx >= 0 ? process.argv[targetIdx + 1] : process.cwd();
  const scan = runL1Scan(resolve(target));
  console.log(renderL1Markdown(scan));
}
