/**
 * Derives the real public export surfaces of superdoc v1 and v2.
 *
 * AIDEV-NOTE: This is what keeps the migration catalog honest. It reads the v1
 * export list from a committed snapshot and the v2 list from live source, so a
 * v2 export change fails the drift test instead of silently making the docs
 * wrong. Do not replace this with a hand-maintained array.
 */

import { readFile } from 'node:fs/promises';

import * as ts from 'typescript';

/** Subpaths that are documentation or asset concerns rather than migration surface. */
const NON_CODE_SUBPATHS = new Set(['.', './style.css', './style.layered.css']);

type ParsedExports = { runtime: string[]; types: string[] };

/**
 * Parses a public entry module's exported names, split by runtime vs type-only.
 *
 * AIDEV-NOTE: Uses the TypeScript AST rather than regexes, matching
 * `packages/superdoc/scripts/verify-public-facade-emit.cjs`. A regex version
 * silently missed `export function`, `export class`, and `export enum`, which
 * meant a newly added export could look "removed" to the drift gate and produce
 * a wrong migration entry. If the facade grows a form this misses, extend it
 * here rather than special-casing at a call site.
 */
function parseExports(source: string): ParsedExports {
  const file = ts.createSourceFile('entry.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const runtime = new Set<string>();
  const types = new Set<string>();

  const hasModifier = (node: ts.Node, kind: ts.SyntaxKind): boolean =>
    (ts.canHaveModifiers(node) ? (ts.getModifiers(node) ?? []) : []).some((modifier) => modifier.kind === kind);

  for (const statement of file.statements) {
    if (ts.isExportDeclaration(statement)) {
      const clause = statement.exportClause;
      if (!clause || !ts.isNamedExports(clause)) continue;

      for (const element of clause.elements) {
        const isTypeOnly = statement.isTypeOnly || element.isTypeOnly;
        (isTypeOnly ? types : runtime).add(element.name.text);
      }
      continue;
    }

    if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) continue;

    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) {
      types.add(statement.name.text);
      continue;
    }

    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)) {
      if (statement.name) runtime.add(statement.name.text);
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) runtime.add(declaration.name.text);
      }
    }
  }

  return { runtime: [...runtime].sort(), types: [...types].sort() };
}

/**
 * Resolves a dotted `config.*` path against the v2 `Config` interface.
 *
 * AIDEV-NOTE: An earlier version matched only the final segment anywhere in the
 * types file, so `config.notReal.contextMenu` passed. This walks the declared
 * property chain instead: each segment must be a property of the type the
 * previous segment declared. A resolvable path still only proves the field is
 * DECLARED, never that v2 honors it. Capability claims need the feature matrix,
 * not this check.
 */
export function resolveConfigPath(source: string, path: string): boolean {
  const file = ts.createSourceFile('types.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  const interfaces = new Map<string, ts.InterfaceDeclaration>();
  for (const statement of file.statements) {
    if (ts.isInterfaceDeclaration(statement)) interfaces.set(statement.name.text, statement);
  }

  const findMember = (container: ts.TypeLiteralNode | ts.InterfaceDeclaration, name: string) =>
    container.members.find(
      (member): member is ts.PropertySignature =>
        ts.isPropertySignature(member) && !!member.name && member.name.getText(file) === name,
    );

  const asContainer = (node: ts.TypeNode | undefined): ts.TypeLiteralNode | ts.InterfaceDeclaration | null => {
    if (!node) return null;
    if (ts.isTypeLiteralNode(node)) return node;
    if (ts.isTypeReferenceNode(node)) return interfaces.get(node.typeName.getText(file)) ?? null;
    // Opt-out unions such as `ui?: false | UIConfig` carry exactly one
    // object-like branch, so the chain continues through it. A union with
    // several object-like branches is genuinely ambiguous — which one a path
    // means cannot be decided here — so it fails closed rather than guessing
    // the first, which would let a path resolve against the wrong shape.
    if (ts.isUnionTypeNode(node)) {
      const containers = node.types.map(asContainer).filter((entry) => entry !== null);
      return containers.length === 1 ? containers[0] : null;
    }
    return null;
  };

  const [root, ...segments] = path.split('.');
  if (root !== 'config' || segments.length === 0) return false;

  let container: ts.TypeLiteralNode | ts.InterfaceDeclaration | null = interfaces.get('Config') ?? null;
  for (const segment of segments) {
    if (!container) return false;
    const member = findMember(container, segment);
    if (!member) return false;
    container = asContainer(member.type);
  }
  return true;
}

/** Named runtime (value) exports of a public entry module. */
export function parseRuntimeExports(source: string): string[] {
  return parseExports(source).runtime;
}

/** Type-only exports of a public entry module. */
export function parseTypeExports(source: string): string[] {
  return parseExports(source).types;
}

/**
 * Collects feature ids from `getV2FeatureMatrix()` whose status matches.
 *
 * AIDEV-NOTE: AST rather than regex because a PARTIAL miss is silent. A regex
 * keyed on quote style or line breaks that loses one entry still returns a
 * non-empty set, so an emptiness check passes while the caller quietly stops
 * covering the feature that was reformatted.
 */
export function collectFeaturesByStatus(source: string, status: string): Set<string> {
  const file = ts.createSourceFile('SuperDoc.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const features = new Set<string>();

  const literalText = (node: ts.Node | undefined): string | null =>
    node && ts.isStringLiteralLike(node) ? node.text : null;

  const propertyValue = (object: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined =>
    object.properties.find(
      (property): property is ts.PropertyAssignment =>
        ts.isPropertyAssignment(property) && property.name.getText(file) === name,
    )?.initializer;

  const visit = (node: ts.Node): void => {
    if (ts.isObjectLiteralExpression(node)) {
      const feature = literalText(propertyValue(node, 'feature'));
      if (feature && literalText(propertyValue(node, 'status')) === status) features.add(feature);
    }
    ts.forEachChild(node, visit);
  };

  visit(file);
  return features;
}

/** Reads the code subpaths a package publishes, excluding CSS and the root. */
export async function readCodeSubpaths(packageJsonPath: string): Promise<string[]> {
  const manifest = JSON.parse(await readFile(packageJsonPath, 'utf8')) as {
    exports?: Record<string, unknown>;
  };
  return Object.keys(manifest.exports ?? {})
    .filter((subpath) => !NON_CODE_SUBPATHS.has(subpath))
    .sort();
}

export async function readPackageVersion(packageJsonPath: string): Promise<string> {
  const manifest = JSON.parse(await readFile(packageJsonPath, 'utf8')) as { version?: string };
  if (!manifest.version) throw new Error(`No version field in ${packageJsonPath}`);
  return manifest.version;
}

/** The v2 surface that survived, derived from live package data. */
export type SurvivingSurface = {
  runtimeExports: string[];
  codeSubpaths: string[];
};

/**
 * Reads what v2 still publishes.
 *
 * AIDEV-NOTE: Prose in the generated page quotes these lists and their lengths
 * rather than restating them. A hard-coded "v2 publishes two subpaths" went
 * stale the moment `./collaboration-upgrade-engine` was added, which is the
 * exact drift this catalog exists to prevent.
 */
export async function readSurvivingSurface(packageJsonPath: string, entryPath: string): Promise<SurvivingSurface> {
  return {
    runtimeExports: parseRuntimeExports(await readFile(entryPath, 'utf8')),
    codeSubpaths: await readCodeSubpaths(packageJsonPath),
  };
}
