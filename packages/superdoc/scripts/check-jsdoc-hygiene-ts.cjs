#!/usr/bin/env node
/**
 * SD-673 / type-hygiene-ts: gate for type-bearing JSDoc in `.ts`
 * source under `packages/superdoc/src/` and `packages/super-editor/src/`.
 *
 * Policy: TypeScript syntax is the only source of truth for shape on
 * the public contract surface. Type-bearing JSDoc in `.ts` files is
 * documentation-only — TS ignores it — so duplicated type information
 * drifts silently. See `type-hygiene.md` for the full rule.
 *
 * Detection model:
 *
 *   - Positive detection on tag name. Two sets:
 *
 *     ALWAYS_FLAG_TAGS — tag is a violation purely by being present
 *     in a `.ts` file (the tag is a JSDoc-type-system construct that
 *     has a native TS equivalent):
 *       @type, @typedef, @callback, @template, @implements,
 *       @extends, @augments, @enum
 *
 *     FLAG_WHEN_TYPED_TAGS — tag is a violation only when it carries
 *     a type expression (the `{Type}` brace). Prose-only forms are
 *     fine:
 *       @param, @returns, @return, @this
 *
 *   - Every other JSDoc tag is ignored (allows `@deprecated`,
 *     `@example`, `@throws`, `@see`, `@typeParam`, etc.).
 *
 * Snapshot/ratchet pattern mirrors `check-jsdoc.cjs`:
 *
 *   - Existing violations are recorded in
 *     `jsdoc-hygiene-ts-baseline.json`. New violations on top of the
 *     baseline fail.
 *   - Stale baseline entries (file removed, JSDoc cleaned up) also
 *     fail; rerun with --write to refresh.
 *
 * Refreshing the baseline:
 *
 *   node packages/superdoc/scripts/check-jsdoc-hygiene-ts.cjs --write
 *
 * Scope: see `type-hygiene.md` § Scope. Excludes test files and
 * declaration files.
 */

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const scriptDir = __dirname;
const repoRoot = path.resolve(scriptDir, '..', '..', '..');

const BASELINE_PATH = path.join(scriptDir, 'jsdoc-hygiene-ts-baseline.json');
const POLICY_RELATIVE = 'packages/superdoc/scripts/type-hygiene.md';

const SCAN_ROOTS = ['packages/superdoc/src', 'packages/super-editor/src'];

const EXCLUDED_DIRS = new Set(['node_modules', 'dist', '__mocks__', '__fixtures__', 'dev']);
const EXCLUDED_FILE_SUFFIXES = ['.d.ts', '.test.ts', '.spec.ts', '.test.tsx', '.spec.tsx'];

const ALWAYS_FLAG_TAGS = new Set([
  'type',
  'typedef',
  'callback',
  'template',
  'implements',
  'extends',
  'augments',
  'enum',
]);

const FLAG_WHEN_TYPED_TAGS = new Set(['param', 'returns', 'return', 'this']);

const CLASS_BY_TAG = {
  type: 'inline-fake-cast',
  typedef: 'typedef-style',
  callback: 'typedef-style',
  enum: 'typedef-style',
  template: 'declaration-doc-type',
  implements: 'declaration-doc-type',
  extends: 'declaration-doc-type',
  augments: 'declaration-doc-type',
  param: 'declaration-doc-type',
  returns: 'declaration-doc-type',
  return: 'declaration-doc-type',
  this: 'declaration-doc-type',
};

// ─── File discovery ───────────────────────────────────────────────────

function listTsFiles(rootRel) {
  const out = [];
  const absRoot = path.join(repoRoot, rootRel);
  if (!fs.existsSync(absRoot)) return out;

  const stack = [absRoot];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(abs);
      } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.tsx')) {
        if (EXCLUDED_FILE_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))) continue;
        out.push(path.relative(repoRoot, abs).replace(/\\/g, '/'));
      } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
        if (EXCLUDED_FILE_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))) continue;
        out.push(path.relative(repoRoot, abs).replace(/\\/g, '/'));
      }
    }
  }
  return out;
}

// ─── AST walk ─────────────────────────────────────────────────────────

/**
 * Render a member name from the AST node that carries it. Handles
 * `Identifier`, `PrivateIdentifier` (returns `#name` so private
 * methods don't collapse onto their enclosing class's key), and
 * string/numeric literal property names.
 *
 * Returns null when the name shape is not one we render — caller
 * falls through to the next ancestor.
 */
function renderName(nameNode) {
  if (!nameNode) return null;
  if (ts.isIdentifier(nameNode)) return String(nameNode.escapedText);
  if (ts.isPrivateIdentifier(nameNode)) {
    // `nameNode.text` is the original source ('#name'). escapedText
    // may also include the leading '#' depending on TS version; using
    // .text avoids depending on that detail.
    return nameNode.text;
  }
  if (ts.isStringLiteral(nameNode) || ts.isNumericLiteral(nameNode)) return String(nameNode.text);
  return null;
}

/**
 * Walk up from a node to find the nearest named declaration ancestor.
 * Used to anchor each violation to a stable enclosing-symbol name so
 * the baseline key survives line shifts caused by edits elsewhere in
 * the file.
 *
 * Returns '<inline>' when no named ancestor is found (e.g. inline
 * `/** @type *​/` cast inside an anonymous expression at module scope).
 */
function enclosingSymbolName(node) {
  let n = node;
  while (n) {
    // Direct .name on the node (FunctionDeclaration, MethodDeclaration,
    // ClassDeclaration, InterfaceDeclaration, TypeAliasDeclaration,
    // PropertyDeclaration / PropertySignature, GetAccessorDeclaration,
    // EnumDeclaration, etc.). Includes PrivateIdentifier so `#method`
    // doesn't collapse onto its enclosing class's key.
    if (n.name) {
      const rendered = renderName(n.name);
      if (rendered) return rendered;
    }
    // VariableStatement -> VariableDeclarationList -> VariableDeclaration[].
    // Use the first declared name as the anchor.
    if (ts.isVariableStatement(n) && n.declarationList && n.declarationList.declarations.length > 0) {
      const d = n.declarationList.declarations[0];
      const rendered = renderName(d.name);
      if (rendered) return rendered;
    }
    if (ts.isVariableDeclaration(n)) {
      const rendered = renderName(n.name);
      if (rendered) return rendered;
    }
    n = n.parent;
  }
  return '<inline>';
}

/**
 * Walk a source file's AST and emit one violation per type-bearing
 * JSDoc tag.
 *
 * Each violation's identity is the stable tuple
 * `{file, symbol, tag, occurrenceIndex}`. `line` is captured for
 * human-readable display only; it is NOT part of the baseline key
 * because line numbers shift under unrelated edits and would produce
 * spurious stale-plus-new pairs on the ratchet.
 */
function findViolations(filePath, sourceText) {
  const sf = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, /* setParentNodes */ true);
  const findings = [];
  const seenPositions = new Set();
  const occurrenceCounter = new Map();

  function visit(node) {
    const tags = ts.getJSDocTags(node);
    if (tags && tags.length > 0) {
      const symbol = enclosingSymbolName(node);
      for (const tag of tags) {
        const name = tag.tagName && tag.tagName.escapedText ? String(tag.tagName.escapedText) : '';
        const violation = classifyTag(name, tag);
        if (!violation) continue;
        // Position de-dupe so the same tag surfaced via multiple parent
        // walks counts once.
        const positionKey = `${tag.pos}:${tag.end}:${name}`;
        if (seenPositions.has(positionKey)) continue;
        seenPositions.add(positionKey);
        // Occurrence index within (symbol, tag) so multiple `@param`s
        // on the same method are distinguished without depending on
        // line numbers.
        const counterKey = `${symbol}::${name}`;
        const occurrenceIndex = occurrenceCounter.get(counterKey) || 0;
        occurrenceCounter.set(counterKey, occurrenceIndex + 1);
        const { line } = sf.getLineAndCharacterOfPosition(tag.pos);
        findings.push({
          file: filePath,
          line: line + 1,
          tag: name,
          class: violation,
          symbol,
          occurrenceIndex,
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);

  findings.sort(
    (a, b) =>
      a.symbol.localeCompare(b.symbol) ||
      a.tag.localeCompare(b.tag) ||
      a.occurrenceIndex - b.occurrenceIndex,
  );
  return findings;
}

function classifyTag(name, tag) {
  if (ALWAYS_FLAG_TAGS.has(name)) {
    return CLASS_BY_TAG[name];
  }
  if (FLAG_WHEN_TYPED_TAGS.has(name)) {
    // tag.typeExpression is set when the tag carries a `{Type}` brace.
    if (tag.typeExpression) return CLASS_BY_TAG[name];
  }
  return null;
}

// ─── Baseline serialization ───────────────────────────────────────────

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) {
    return { $comment: '', knownViolations: [] };
  }
  const raw = fs.readFileSync(BASELINE_PATH, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`Failed to parse baseline at ${BASELINE_PATH}: ${e.message}`);
  }
}

function violationKey(v) {
  // Stable across line shifts and re-orderings of unrelated code.
  // `line` is intentionally excluded: editing above a JSDoc block
  // would otherwise produce one stale + one new entry for an
  // unchanged violation, and the ratchet would be noisy.
  return `${v.file}::${v.symbol}::${v.tag}::${v.class}::${v.occurrenceIndex}`;
}

function writeBaseline(violations) {
  const data = {
    $comment:
      'Auto-managed by packages/superdoc/scripts/check-jsdoc-hygiene-ts.cjs. ' +
      'Each entry is "file::enclosingSymbol::tagName::class::occurrenceIndex"; ' +
      'line numbers are NOT part of the key, so the baseline survives unrelated ' +
      'edits that shift line numbers. The gate grandfathers these and fails on ' +
      'net-new violations. Refresh after intentional cleanup with --write. ' +
      'Goal is to drain to zero, then flip to "zero allowed" in a separate PR. ' +
      'See packages/superdoc/scripts/type-hygiene.md.',
    knownViolations: violations.map(violationKey).sort(),
  };
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(data, null, 2) + '\n');
}

// ─── Main ─────────────────────────────────────────────────────────────

function main() {
  const writeMode = process.argv.includes('--write');

  const files = [];
  for (const root of SCAN_ROOTS) {
    files.push(...listTsFiles(root));
  }
  files.sort();

  const allViolations = [];
  for (const rel of files) {
    const abs = path.join(repoRoot, rel);
    const text = fs.readFileSync(abs, 'utf8');
    const violations = findViolations(rel, text);
    allViolations.push(...violations);
  }

  const currentKeys = new Set(allViolations.map(violationKey));
  const baseline = loadBaseline();
  const baselineKeys = new Set(baseline.knownViolations);

  const newViolations = allViolations.filter((v) => !baselineKeys.has(violationKey(v)));
  const staleEntries = [...baselineKeys].filter((k) => !currentKeys.has(k)).sort();

  if (writeMode) {
    writeBaseline(allViolations);
    console.log(`[jsdoc-hygiene-ts] wrote ${BASELINE_PATH} (${allViolations.length} entries).`);
    return;
  }

  // Report
  const total = allViolations.length;
  const grandfathered = total - newViolations.length;
  console.log(`[jsdoc-hygiene-ts] type-bearing JSDoc scanner`);
  console.log('========================================================================');
  console.log(`Scope:              ${SCAN_ROOTS.join(', ')} (excludes test files / .d.ts)`);
  console.log(`Files scanned:      ${files.length}`);
  console.log(`Total violations:   ${total}`);
  console.log(`Grandfathered:      ${grandfathered}`);
  console.log(`Baseline at:        ${path.relative(repoRoot, BASELINE_PATH)}`);

  if (newViolations.length > 0 || staleEntries.length > 0) {
    console.log('');
    if (newViolations.length > 0) {
      console.log(`FAIL  ${newViolations.length} new type-bearing JSDoc tag(s) in .ts source:`);
      for (const v of newViolations.slice(0, 30)) {
        console.log(`  - ${v.file}:${v.line}  @${v.tag}  on \`${v.symbol}\` [${v.class}]`);
      }
      if (newViolations.length > 30) {
        console.log(`  ... and ${newViolations.length - 30} more.`);
      }
      console.log('');
      console.log(
        'Type-bearing JSDoc is not allowed in .ts source under packages/superdoc/src\n' +
          'or packages/super-editor/src. Use TypeScript for shape (signatures, interfaces,\n' +
          '`as Type` casts) and prose-only JSDoc for documentation. See ' +
          POLICY_RELATIVE +
          ' for the rule and fix patterns.\n',
      );
    }
    if (staleEntries.length > 0) {
      console.log(`FAIL  ${staleEntries.length} stale baseline entry/entries (no longer violating):`);
      for (const k of staleEntries.slice(0, 30)) {
        console.log(`  - ${k}`);
      }
      if (staleEntries.length > 30) {
        console.log(`  ... and ${staleEntries.length - 30} more.`);
      }
      console.log('');
      console.log(
        'These entries were cleaned up but the baseline still records them.\n' +
          'Run with --write to refresh the snapshot and lock in the win.\n',
      );
    }
    process.exit(1);
  }

  console.log('');
  console.log(`OK    ${total} violation(s) tracked as baseline; no net-new entries.`);
}

// Export the AST + classification helpers so the test runner can
// exercise them on in-memory fixtures without touching the file
// system. Only invoke main() when executed directly as a CLI.
module.exports = {
  findViolations,
  classifyTag,
  ALWAYS_FLAG_TAGS,
  FLAG_WHEN_TYPED_TAGS,
  CLASS_BY_TAG,
};

if (require.main === module) {
  main();
}
