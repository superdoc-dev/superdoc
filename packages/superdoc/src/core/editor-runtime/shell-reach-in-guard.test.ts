// Shell consumer reach-in source guard.
//
// Two staged gates protect the editor-runtime boundary:
//
//   Gate 1 (primary): the shell must not reach into v1's static
//     `PresentationEditor.getInstance(...)` instance registry. This is the
//     concrete "around-the-runtime-boundary" reach-in. Forbidden in shared-shell
//     sources except a dated allowlist. The navigation-reveal + caret/selection
//     screen-rect capability groups those callers need are not present yet, so
//     they stay deferred and allowlisted with owner, expiry, and removal
//     conditions.
//
//   Gate 2: migrated files must route through the runtime and may
//     not add new raw v1 member-access reach-ins (`editor.state` /
//     `editor.commands`). A single legacy fallback may be retained when tagged
//     with a `reach-in-allow:` sentinel.
//
// Out of scope for the scan:
//   - `core/editor-runtime/**`: the v1 adapter legitimately delegates to v1
//     surfaces and is already covered by `import-boundary.test.ts`.
//   - `components/V2SuperEditor/**`: v2-owned host internals may use
//     `V2EditorHost` internals.
//   - test/spec files: they assert against forbidden names.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// `__dirname` = packages/superdoc/src/core/editor-runtime → src root is two up.
const SRC_ROOT = join(__dirname, '..', '..');

const SCAN_EXTENSIONS = ['.js', '.ts', '.vue'];

// Directories (relative to SRC_ROOT, posix-style) excluded from the scan.
const EXCLUDED_DIR_PREFIXES = ['core/editor-runtime/', 'components/V2SuperEditor/'];

/**
 * Dated allowlist for Gate 1. Each entry stays until its capability group lands
 * and the consumer migrates. Owner: Nick Bernal. Expires: 2026-09-01.
 */
const PRESENTATION_GETINSTANCE_ALLOWLIST = new Set<string>([
  // the editor runtime boundary-owned v1 lifecycle wiring + PE geometry / comment-position bridge.
  // Needs a navigation-reveal + caret/selection screen-rect capability (absent
  // after the editor runtime boundary). Remove when the runtime exposes those and the shell uses them.
  'SuperDoc.vue',
  // Comment / tracked-change cursor navigation via PE. Needs comments +
  // trackedChanges + navigation capability groups (absent after the editor runtime boundary).
  // Remove when the adapter ships them and CommentDialog routes through them.
  'components/CommentsLayer/CommentDialog.vue',
]);

/** Files that Gate 2 scans for new raw v1 reach-ins. */
const MIGRATED_FILES = ['composables/use-selected-text.js'];

function toPosix(p: string): string {
  return p.split(sep).join('/');
}

function isTestFile(file: string): boolean {
  return /\.(test|spec)\.[jt]s$/.test(file) || /\.(test|spec)\.vue$/.test(file);
}

function isExcluded(relPosix: string): boolean {
  return EXCLUDED_DIR_PREFIXES.some((prefix) => relPosix.startsWith(prefix));
}

function* walkSourceFiles(dir: string): IterableIterator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walkSourceFiles(full);
      continue;
    }
    if (!SCAN_EXTENSIONS.some((ext) => full.endsWith(ext))) continue;
    if (isTestFile(full)) continue;
    yield full;
  }
}

// ---------------------------------------------------------------------------
// Scanners (pure functions so the self-tests can exercise them directly)
// ---------------------------------------------------------------------------

const GETINSTANCE_RE = /PresentationEditor\s*\.\s*getInstance\s*\(/;

/** True when a source reaches into the static PresentationEditor registry. */
function hasPresentationGetInstance(source: string): boolean {
  return GETINSTANCE_RE.test(source);
}

const REACH_IN_ALLOW_TAG = 'reach-in-allow:';

// Raw v1 member-access reach-ins forbidden in migrated files. `editor.state`
// (PM state) and `editor.commands` (PM command surface) must route through the
// runtime once a file is migrated.
const MEMBER_REACH_IN_RES: { name: string; re: RegExp }[] = [
  { name: 'editor.state', re: /\beditor\s*\??\.\s*state\b/ },
  { name: 'editor.commands', re: /\beditor\s*\??\.\s*commands\b/ },
];

/** Lines with an un-tagged raw v1 member-access reach-in. */
function findUntaggedMemberReachIns(source: string): { line: string; match: string }[] {
  const offenders: { line: string; match: string }[] = [];
  for (const raw of source.split('\n')) {
    const trimmed = raw.trim();
    // Skip comment lines (prose may name the patterns) and tagged fallbacks.
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
    if (raw.includes(REACH_IN_ALLOW_TAG)) continue;
    for (const { name, re } of MEMBER_REACH_IN_RES) {
      if (re.test(raw)) offenders.push({ line: trimmed, match: name });
    }
  }
  return offenders;
}

// ---------------------------------------------------------------------------
// Gate 1: PresentationEditor.getInstance reach-in allowlist
// ---------------------------------------------------------------------------

describe('shell reach-in guard  -  PresentationEditor.getInstance (Gate 1)', () => {
  it('only allowlisted shared-shell files reach into the static PresentationEditor registry', () => {
    const offenders: string[] = [];
    const seenAllowlisted = new Set<string>();
    for (const file of walkSourceFiles(SRC_ROOT)) {
      const relPosix = toPosix(relative(SRC_ROOT, file));
      if (isExcluded(relPosix)) continue;
      const source = readFileSync(file, 'utf8');
      if (!hasPresentationGetInstance(source)) continue;
      if (PRESENTATION_GETINSTANCE_ALLOWLIST.has(relPosix)) {
        seenAllowlisted.add(relPosix);
        continue;
      }
      offenders.push(relPosix);
    }
    // No un-allowlisted reach-in may exist.
    expect(offenders).toEqual([]);
    // The allowlist must not rot: every entry must still correspond to a real
    // reach-in (excluding the v1 adapter dir, which is out of scan scope).
    const stale = [...PRESENTATION_GETINSTANCE_ALLOWLIST].filter((f) => !seenAllowlisted.has(f));
    expect(stale).toEqual([]);
  });

  it('self-test: getInstance scanner flags a non-allowlisted reach-in', () => {
    const synthetic = `const p = PresentationEditor.getInstance(documentId);`;
    expect(hasPresentationGetInstance(synthetic)).toBe(true);
  });

  it('self-test: getInstance scanner ignores unrelated PresentationEditor references', () => {
    const synthetic = `import type { PresentationEditor } from '@superdoc/super-editor';\nconst x = PresentationEditor.setGlobalZoom;`;
    expect(hasPresentationGetInstance(synthetic)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Gate 2: migrated files route through the runtime, no new raw reach-ins
// ---------------------------------------------------------------------------

describe('shell reach-in guard  -  migrated files (Gate 2)', () => {
  it('migrated files route through the active runtime accessor', () => {
    for (const rel of MIGRATED_FILES) {
      const source = readFileSync(join(SRC_ROOT, rel), 'utf8');
      expect(source, `${rel} should reference getActiveRuntime`).toContain('getActiveRuntime');
    }
  });

  it('migrated files have no untagged raw v1 member-access reach-ins', () => {
    const offenders: { file: string; match: string; line: string }[] = [];
    for (const rel of MIGRATED_FILES) {
      const source = readFileSync(join(SRC_ROOT, rel), 'utf8');
      for (const hit of findUntaggedMemberReachIns(source)) {
        offenders.push({ file: rel, ...hit });
      }
    }
    expect(offenders).toEqual([]);
  });

  it('self-test: member-access scanner flags an untagged editor.state reach-in', () => {
    const synthetic = `const t = editor.state.doc.textBetween(a, b, ' ');`;
    expect(findUntaggedMemberReachIns(synthetic).map((o) => o.match)).toEqual(['editor.state']);
  });

  it('self-test: member-access scanner flags an untagged editor.commands reach-in', () => {
    const synthetic = `editor.commands.insertContent(text);`;
    expect(findUntaggedMemberReachIns(synthetic).map((o) => o.match)).toEqual(['editor.commands']);
  });

  it('self-test: member-access scanner allows a same-line tagged legacy fallback', () => {
    const tagged = `return editor.state.doc.textBetween(a, b, ' '); // reach-in-allow: legacy`;
    expect(findUntaggedMemberReachIns(tagged)).toEqual([]);
  });

  it('self-test: a tag on a PRECEDING line does not cover an untagged reach-in line', () => {
    // The sentinel must be on the same line as the reach-in; a comment above it
    // does not silence the next line. This keeps the allowance narrow.
    const synthetic = `// reach-in-allow: legacy fallback\nreturn editor.state.doc.textBetween(a, b, ' ');`;
    expect(findUntaggedMemberReachIns(synthetic).map((o) => o.match)).toEqual(['editor.state']);
  });
});

// ---------------------------------------------------------------------------
// Gate 3: product DOM hit routing must stay wired (positive guard)
// ---------------------------------------------------------------------------
//
// The runtime activation API (`activateRuntimeFromEventTarget`) was added before
// any product code called it from real DOM events, making it test-only dead
// code. This positive guard requires `SuperDoc.vue` to reference the helper so a
// future refactor cannot silently drop product hit routing and leave the API
// exercised only by tests. Mirrors the Gate 2 `getActiveRuntime` requirement.

describe('shell hit-routing positive guard (Gate 3)', () => {
  const HIT_ROUTING_FILES = ['SuperDoc.vue'];

  it('SuperDoc.vue routes product DOM hits through activateRuntimeFromEventTarget', () => {
    for (const rel of HIT_ROUTING_FILES) {
      const source = readFileSync(join(SRC_ROOT, rel), 'utf8');
      expect(source, `${rel} should reference activateRuntimeFromEventTarget`).toContain(
        'activateRuntimeFromEventTarget',
      );
    }
  });
});
