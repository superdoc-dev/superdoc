#!/usr/bin/env bun
/**
 * Validate metadata in demos/ and examples/. Catches drift that broke us
 * during SD-2873:
 *   - Invalid demo-config.json (trailing comma, etc.)
 *   - Hardcoded /Users/<name>/ absolute paths in human-edited content
 *   - Stale docs.superdoc.dev URLs from the old IA
 *
 * Skips: node_modules, dist, build artifacts (.nuxt/, .next/), generated
 * lockfiles, and __tests__.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const TARGETS = [join(REPO_ROOT, 'demos'), join(REPO_ROOT, 'examples')];

const SKIP_DIRS = new Set(['node_modules', 'dist', '.nuxt', '.next', '.output', '.svelte-kit', 'build', '__tests__']);

const SCAN_EXT = /\.(md|mdx|js|ts|tsx|jsx|json|html)$/;

const STALE_URL_PATTERNS: { pattern: RegExp; replacement: string }[] = [
  { pattern: /docs\.superdoc\.dev\/modules\/comments/g, replacement: 'docs.superdoc.dev/editor/built-in-ui/comments' },
  {
    pattern: /docs\.superdoc\.dev\/modules\/track-changes/g,
    replacement: 'docs.superdoc.dev/editor/built-in-ui/track-changes',
  },
  { pattern: /docs\.superdoc\.dev\/modules\/toolbar/g, replacement: 'docs.superdoc.dev/editor/built-in-ui/toolbar' },
  { pattern: /docs\.superdoc\.dev\/modules\/links/g, replacement: 'docs.superdoc.dev/editor/built-in-ui/links' },
  {
    pattern: /docs\.superdoc\.dev\/modules\/context-menu/g,
    replacement: 'docs.superdoc.dev/editor/built-in-ui/context-menu',
  },
  { pattern: /docs\.superdoc\.dev\/modules\/pdf/g, replacement: 'docs.superdoc.dev/editor/pdf' },
  { pattern: /docs\.superdoc\.dev\/modules\/whiteboard/g, replacement: 'docs.superdoc.dev/editor/pdf/whiteboard' },
  {
    pattern: /docs\.superdoc\.dev\/modules\/collaboration/g,
    replacement: 'docs.superdoc.dev/editor/collaboration/overview',
  },
  {
    pattern: /docs\.superdoc\.dev\/extensions\/track-changes/g,
    replacement: 'docs.superdoc.dev/editor/built-in-ui/track-changes',
  },
  {
    pattern: /docs\.superdoc\.dev\/document-engine\/ai-agents\/integrations/g,
    replacement: 'docs.superdoc.dev/ai/agents/integrations',
  },
  {
    pattern: /docs\.superdoc\.dev\/document-engine\/ai-agents\/llm-tools/g,
    replacement: 'docs.superdoc.dev/ai/agents/llm-tools',
  },
  {
    pattern: /docs\.superdoc\.dev\/document-engine\/ai-agents\/mcp-server/g,
    replacement: 'docs.superdoc.dev/ai/mcp/overview',
  },
  { pattern: /docs\.superdoc\.dev\/document-engine\/mcp/g, replacement: 'docs.superdoc.dev/ai/mcp/overview' },
  { pattern: /docs\.superdoc\.dev\/getting-started\/ai-agents/g, replacement: 'docs.superdoc.dev/getting-started/ai' },
  {
    pattern: /docs\.superdoc\.dev\/getting-started\/installation/g,
    replacement: 'docs.superdoc.dev/getting-started/quickstart',
  },
  { pattern: /docs\.superdoc\.dev\/core\/superdoc\//g, replacement: 'docs.superdoc.dev/editor/superdoc/' },
  { pattern: /docs\.superdoc\.dev\/core\/react\//g, replacement: 'docs.superdoc.dev/editor/react/' },
  { pattern: /docs\.superdoc\.dev\/core\/supereditor\//g, replacement: 'docs.superdoc.dev/advanced/supereditor/' },
  {
    pattern: /docs\.superdoc\.dev\/extensions\/creating-extensions/g,
    replacement: 'docs.superdoc.dev/advanced/custom-extensions',
  },
];

const HARDCODED_PATH = /\/Users\/[a-z][a-zA-Z0-9_-]*\//g;

type Issue = { file: string; line: number; kind: string; detail: string };
const issues: Issue[] = [];

// Manifest entry schema (SD-3217 round 4). Every entry in
// demos/manifest.json and examples/manifest.json must declare these.
const ALLOWED_SECTIONS = new Set(['editor', 'document-engine', 'ai', 'solutions', 'getting-started', 'advanced']);
const ALLOWED_KINDS = new Set(['minimal-example', 'integration-example', 'workflow-demo', 'reference-workspace']);
const ALLOWED_STATUSES = new Set(['active', 'hidden', 'archived', 'shim']);
const ALLOWED_SOURCE_KINDS = new Set(['local', 'external']);

// AIDEV-NOTE: `slug` is the published identity at go.superdoc.dev and is
// permanent once shipped. `id` is the internal catalog key and stays free to
// follow section renames; a slug cannot, because external links depend on it.
// Renaming or removing a published slug breaks every link already in the wild,
// so treat a slug change as an API break, not a rename.
// Slugs are opt-in: an entry without one is simply not published.
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Reserved for service-level routes so a slug can never shadow one. `docs`,
// `live`, and `source` are held back for the per-entry variants that v1 does
// not generate yet, so adding them later cannot collide with a published slug.
const RESERVED_SLUGS = new Set(['docs', 'live', 'source', 'health', 'index', 'api', 'assets', '404']);

// AIDEV-NOTE: a published slug must outlive the entry's usefulness. Restricting
// it to `active` would mean archiving an example forces removing its slug,
// breaking the very URL we promised was permanent. `hidden` and `archived` say
// "stop advertising this", not "stop answering links people already hold", so
// both keep their slug. `shim` cannot claim one: a shim stands in for an old
// path and is not a thing deserving a permanent public name.
const SLUGGABLE_STATUSES = new Set(['active', 'hidden', 'archived']);

// Claimed across both manifests: the published namespace is flat, so a slug in
// demos.json and one in examples.json would collide at the same URL.
const seenSlugs = new Map<string, string>();

function validateSlug(e: Record<string, unknown>, eid: string, relPath: string): void {
  if (e.slug === undefined || e.slug === null) return;
  if (typeof e.slug !== 'string' || e.slug.length === 0) {
    issues.push({
      file: relPath,
      line: 0,
      kind: 'manifest-schema',
      detail: `${eid}: slug must be a non-empty string; omit the field when the entry is not published`,
    });
    return;
  }
  if (!SLUG_PATTERN.test(e.slug)) {
    issues.push({
      file: relPath,
      line: 0,
      kind: 'manifest-slug',
      detail: `${eid}: slug '${e.slug}' must be lowercase kebab-case (letters, digits, single hyphens)`,
    });
  }
  if (RESERVED_SLUGS.has(e.slug)) {
    issues.push({
      file: relPath,
      line: 0,
      kind: 'manifest-slug',
      detail: `${eid}: slug '${e.slug}' is reserved for a service route`,
    });
  }
  const owner = seenSlugs.get(e.slug);
  if (owner !== undefined) {
    issues.push({
      file: relPath,
      line: 0,
      kind: 'manifest-duplicate-slug',
      detail: `${eid}: slug '${e.slug}' is already claimed by '${owner}'`,
    });
  } else {
    seenSlugs.set(e.slug, eid);
  }
  if (typeof e.status === 'string' && !SLUGGABLE_STATUSES.has(e.status)) {
    issues.push({
      file: relPath,
      line: 0,
      kind: 'manifest-slug',
      detail: `${eid}: status '${e.status}' cannot hold a slug (allowed: ${[...SLUGGABLE_STATUSES].join(', ')})`,
    });
  }
}

function validateManifest(manifestPath: string, relPath: string): void {
  let entries: unknown;
  try {
    entries = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    issues.push({ file: relPath, line: 0, kind: 'invalid-json', detail: String(err).split('\n')[0] });
    return;
  }
  if (!Array.isArray(entries)) {
    issues.push({ file: relPath, line: 0, kind: 'manifest-shape', detail: 'top-level must be an array' });
    return;
  }
  for (const [index, entry] of entries.entries()) {
    if (typeof entry !== 'object' || entry === null) {
      issues.push({
        file: relPath,
        line: 0,
        kind: 'manifest-shape',
        detail: `entry at index ${index} must be a JSON object with id and metadata fields`,
      });
      continue;
    }
    const e = entry as Record<string, unknown>;
    const eid = typeof e.id === 'string' ? e.id : '<no-id>';
    if (typeof e.section !== 'string' || !ALLOWED_SECTIONS.has(e.section)) {
      issues.push({
        file: relPath,
        line: 0,
        kind: 'manifest-schema',
        detail: `${eid}: section missing or not one of ${[...ALLOWED_SECTIONS].join(', ')}`,
      });
    }
    if (typeof e.subsection !== 'string' || e.subsection.length === 0) {
      issues.push({
        file: relPath,
        line: 0,
        kind: 'manifest-schema',
        detail: `${eid}: subsection missing or empty (use 'core' if no natural subsection)`,
      });
    }
    if (typeof e.kind !== 'string' || !ALLOWED_KINDS.has(e.kind)) {
      issues.push({
        file: relPath,
        line: 0,
        kind: 'manifest-schema',
        detail: `${eid}: kind missing or not one of ${[...ALLOWED_KINDS].join(', ')}`,
      });
    }
    if (typeof e.status !== 'string' || !ALLOWED_STATUSES.has(e.status)) {
      issues.push({
        file: relPath,
        line: 0,
        kind: 'manifest-schema',
        detail: `${eid}: status missing or not one of ${[...ALLOWED_STATUSES].join(', ')}`,
      });
    }
    if (typeof e.sourceKind !== 'string' || !ALLOWED_SOURCE_KINDS.has(e.sourceKind)) {
      issues.push({
        file: relPath,
        line: 0,
        kind: 'manifest-schema',
        detail: `${eid}: sourceKind missing or not one of ${[...ALLOWED_SOURCE_KINDS].join(', ')}`,
      });
    }
    // sourceKind must agree with sourceRepo: monorepo entries are local,
    // anything else is external. Cheap drift check.
    if (typeof e.sourceRepo === 'string' && typeof e.sourceKind === 'string') {
      const expectedKind = e.sourceRepo === 'superdoc/docx-editor' ? 'local' : 'external';
      if (e.sourceKind !== expectedKind) {
        issues.push({
          file: relPath,
          line: 0,
          kind: 'manifest-schema',
          detail: `${eid}: sourceKind '${e.sourceKind}' does not match sourceRepo '${e.sourceRepo}' (expected '${expectedKind}')`,
        });
      }
    }
    validateSlug(e, eid, relPath);
  }
}

validateManifest(join(REPO_ROOT, 'demos/manifest.json'), 'demos/manifest.json');
validateManifest(join(REPO_ROOT, 'examples/manifest.json'), 'examples/manifest.json');

function walk(dir: string, files: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      walk(full, files);
    } else if (SCAN_EXT.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

for (const target of TARGETS) {
  for (const file of walk(target)) {
    const rel = file.slice(REPO_ROOT.length + 1);
    const content = readFileSync(file, 'utf8');

    if (file.endsWith('demo-config.json')) {
      try {
        JSON.parse(content);
      } catch (err) {
        issues.push({ file: rel, line: 0, kind: 'invalid-json', detail: String(err).split('\n')[0] });
      }
    }

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      const pathMatches = line.match(HARDCODED_PATH);
      if (pathMatches) {
        for (const m of pathMatches) {
          issues.push({ file: rel, line: i + 1, kind: 'hardcoded-path', detail: m });
        }
      }

      for (const { pattern, replacement } of STALE_URL_PATTERNS) {
        pattern.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = pattern.exec(line))) {
          issues.push({
            file: rel,
            line: i + 1,
            kind: 'stale-url',
            detail: `${m[0]} -> ${replacement}`,
          });
        }
      }
    }
  }
}

// AIDEV-NOTE: a published slug is a live URL at go.superdoc.dev. Removing one
// breaks every link to it that already exists in docs, posts, and other
// people's writing; renaming one does the same thing while leaving the count
// unchanged, so a count check would pass. Both are compared against a committed
// baseline instead.
//
// Publishing a new slug adds a line to go-links/published-slugs.json in the
// same change. Removing one is a deliberate act that retires a public URL, and
// should be reviewed as such rather than slipping through a merge.
const PUBLISHED_SLUGS_FILE = 'go-links/published-slugs.json';

let publishedBaseline: string[] | null = null;
try {
  const raw = readFileSync(join(REPO_ROOT, PUBLISHED_SLUGS_FILE), 'utf8');
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.some((slug) => typeof slug !== 'string')) {
    issues.push({
      file: PUBLISHED_SLUGS_FILE,
      line: 0,
      kind: 'manifest-slug-baseline',
      detail: 'must be a JSON array of slug strings',
    });
  } else {
    publishedBaseline = parsed as string[];
  }
} catch (err) {
  issues.push({
    file: PUBLISHED_SLUGS_FILE,
    line: 0,
    kind: 'manifest-slug-baseline',
    detail: `cannot read the published slug baseline: ${String(err).split('\n')[0]}`,
  });
}

if (publishedBaseline) {
  const current = new Set(seenSlugs.keys());
  const missing = publishedBaseline.filter((slug) => !current.has(slug));
  const added = [...current].filter((slug) => !publishedBaseline.includes(slug));

  if (missing.length > 0) {
    issues.push({
      file: PUBLISHED_SLUGS_FILE,
      line: 0,
      kind: 'manifest-slug-regression',
      detail:
        `no longer published: ${missing.join(', ')}. ` +
        `These are live URLs at go.superdoc.dev and links to them already exist. ` +
        `Restore the slug, or remove it from ${PUBLISHED_SLUGS_FILE} in the same change if the URL is being retired on purpose.`,
    });
  }

  if (added.length > 0) {
    issues.push({
      file: PUBLISHED_SLUGS_FILE,
      line: 0,
      kind: 'manifest-slug-baseline',
      detail: `newly published: ${added.join(', ')}. Add them to ${PUBLISHED_SLUGS_FILE} so future changes cannot drop them silently.`,
    });
  }
}

if (issues.length === 0) {
  console.log('\u001b[32mAll demo and example metadata is valid.\u001b[0m');
  process.exit(0);
}

const byKind = new Map<string, Issue[]>();
for (const issue of issues) {
  if (!byKind.has(issue.kind)) byKind.set(issue.kind, []);
  byKind.get(issue.kind)!.push(issue);
}

console.log(`\u001b[31mFound ${issues.length} issue(s):\u001b[0m`);
for (const [kind, list] of byKind) {
  console.log(`\n  [${kind}] ${list.length}`);
  for (const i of list.slice(0, 20)) {
    console.log(`    ${i.file}${i.line ? ':' + i.line : ''}  ${i.detail}`);
  }
  if (list.length > 20) console.log(`    ... and ${list.length - 20} more`);
}
process.exit(1);
