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
 * Strict-zero gate. Every type-bearing JSDoc tag in scope is a
 * violation; the script exits non-zero on any violation. There is no
 * baseline, grandfathering, or --write mode.
 *
 * Scope: see `type-hygiene.md` § Scope. Excludes test files and
 * declaration files.
 */

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const scriptDir = __dirname;
const repoRoot = path.resolve(scriptDir, '..', '..', '..');

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
 * Used to render each violation's enclosing-symbol name in the
 * failure message so a contributor can jump straight to the
 * declaration that owns the bad JSDoc.
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
 * JSDoc tag. Returns findings with `{file, line, tag, class, symbol}`
 * for display in the failure message.
 */
function findViolations(filePath, sourceText) {
  const sf = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, /* setParentNodes */ true);
  const findings = [];
  const seenPositions = new Set();

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
        const { line } = sf.getLineAndCharacterOfPosition(tag.pos);
        findings.push({
          file: filePath,
          line: line + 1,
          tag: name,
          class: violation,
          symbol,
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);

  findings.sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      a.line - b.line ||
      a.tag.localeCompare(b.tag),
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

// ─── Main ─────────────────────────────────────────────────────────────

function main() {
  // --write was used during the ratchet phase to refresh the
  // grandfathered baseline. Strict-zero mode rejects it loudly so
  // contributors don't accidentally re-introduce grandfathering.
  if (process.argv.includes('--write')) {
    console.error(
      '[jsdoc-hygiene-ts] --write is no longer supported. The gate is\n' +
        'strict zero — every type-bearing JSDoc tag in scope must be\n' +
        'fixed, not grandfathered. See ' +
        POLICY_RELATIVE +
        ' for fix patterns.',
    );
    process.exit(2);
  }

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

  console.log(`[jsdoc-hygiene-ts] type-bearing JSDoc scanner (strict zero)`);
  console.log('========================================================================');
  console.log(`Scope:              ${SCAN_ROOTS.join(', ')} (excludes test files / .d.ts)`);
  console.log(`Files scanned:      ${files.length}`);
  console.log(`Total violations:   ${allViolations.length}`);

  if (allViolations.length > 0) {
    console.log('');
    console.log(`FAIL  ${allViolations.length} type-bearing JSDoc tag(s) in .ts source:`);
    for (const v of allViolations.slice(0, 30)) {
      console.log(`  - ${v.file}:${v.line}  @${v.tag}  on \`${v.symbol}\` [${v.class}]`);
    }
    if (allViolations.length > 30) {
      console.log(`  ... and ${allViolations.length - 30} more.`);
    }
    console.log('');
    console.log(
      'Type-bearing JSDoc is not allowed in .ts source under packages/superdoc/src\n' +
        'or packages/super-editor/src. Use TypeScript for shape (signatures, interfaces,\n' +
        '`as Type` casts) and prose-only JSDoc for documentation. Zero allowed — fix\n' +
        'each violation in place. See ' +
        POLICY_RELATIVE +
        ' for the rule and fix patterns.\n',
    );
    process.exit(1);
  }

  console.log('');
  console.log(`OK    zero type-bearing JSDoc in .ts source.`);
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
