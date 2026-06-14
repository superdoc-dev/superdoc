import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
// JS module without types — pull via dynamic import.
const { mergeMergedProperty, collectContractProperties, sanitizeSchema } = await import('../generate-intent-tools.mjs');

const REPO_ROOT = path.resolve(import.meta.dir, '../../../../../');
const CATALOG_PATH = path.join(REPO_ROOT, 'packages/sdk/tools/catalog.json');

interface Catalog {
  tools: Array<{
    toolName: string;
    inputSchema: { properties?: Record<string, any> };
  }>;
}

// ---------------------------------------------------------------------------
// mergeMergedProperty unit tests — these guard the codegen merge logic that
// SD-2540 review found broken (position enum collapsed to row-only, color
// dropped its nullable variant). Cover enum union, nullable broadening, and
// the oneOf fallback when types are incompatible.
// ---------------------------------------------------------------------------

describe('mergeMergedProperty', () => {
  test('identical schemas pass through unchanged', () => {
    const a = { type: 'string', enum: ['a', 'b'] };
    const result = mergeMergedProperty(a, { ...a });
    expect(result).toEqual(a);
  });

  test('unions enum values when both sides have an enum', () => {
    const a = { type: 'string', enum: ['above', 'below'] };
    const b = { type: 'string', enum: ['left', 'right', 'first', 'last'] };
    const result = mergeMergedProperty(a, b);
    expect(result.type).toBe('string');
    expect(result.enum).toEqual(['above', 'below', 'left', 'right', 'first', 'last']);
  });

  test('enum union is deduplicated', () => {
    const a = { type: 'string', enum: ['a', 'b'] };
    const b = { type: 'string', enum: ['b', 'c'] };
    const result = mergeMergedProperty(a, b);
    expect(result.enum).toEqual(['a', 'b', 'c']);
  });

  test('broadens to nullable when one side allows null (oneOf branch)', () => {
    const stringWithPattern = { type: 'string', pattern: '^[A-F0-9]{6}$' };
    const nullable = { oneOf: [{ type: 'string', pattern: '^[A-F0-9]{6}$' }, { type: 'null' }] };
    const result = mergeMergedProperty(stringWithPattern, nullable);
    expect(Array.isArray(result.oneOf)).toBe(true);
    const nullBranch = result.oneOf.find((b: any) => b.type === 'null');
    const stringBranch = result.oneOf.find((b: any) => b.type === 'string');
    expect(nullBranch).toBeDefined();
    expect(stringBranch?.pattern).toBe('^[A-F0-9]{6}$');
  });

  test('broadens to nullable in the reverse direction (nullable first, then non-null)', () => {
    const nullable = { oneOf: [{ type: 'string' }, { type: 'null' }] };
    const stringOnly = { type: 'string' };
    const result = mergeMergedProperty(nullable, stringOnly);
    // nullable already accepts both, so it stays as the broader form.
    expect(Array.isArray(result.oneOf)).toBe(true);
    expect(result.oneOf.some((b: any) => b.type === 'null')).toBe(true);
  });

  test('falls back to oneOf when types are truly incompatible', () => {
    const a = { type: 'string' };
    const b = { type: 'number' };
    const result = mergeMergedProperty(a, b);
    expect(Array.isArray(result.oneOf)).toBe(true);
    expect(result.oneOf).toContainEqual(a);
    expect(result.oneOf).toContainEqual(b);
  });

  test('preserves the existing description when merging', () => {
    const a = { type: 'string', enum: ['a'], description: 'first description' };
    const b = { type: 'string', enum: ['b'], description: 'second description' };
    const result = mergeMergedProperty(a, b);
    expect(result.description).toBe('first description');
  });

  test('returns incoming when existing is null/undefined', () => {
    const incoming = { type: 'string' };
    expect(mergeMergedProperty(null, incoming)).toEqual(incoming);
    expect(mergeMergedProperty(undefined, incoming)).toEqual(incoming);
  });
});

// ---------------------------------------------------------------------------
// collectContractProperties — verifies we walk top-level + oneOf branches
// when discovering per-property contract schemas. The setShading regression
// (lost nullable in catalog) was caused by skipping top-level properties
// when the schema had a oneOf for the required-discriminator.
// ---------------------------------------------------------------------------

describe('collectContractProperties', () => {
  test('returns top-level properties', () => {
    const result = collectContractProperties({
      type: 'object',
      properties: { color: { type: 'string', pattern: '^[A-F0-9]{6}$' } },
    });
    expect(result.get('color')).toEqual({ type: 'string', pattern: '^[A-F0-9]{6}$' });
  });

  test('walks both top-level + oneOf branches and merges', () => {
    // Mirrors the tables.setShading shape: top-level has the nullable
    // `color`; oneOf at the top level discriminates required (target XOR nodeId).
    const schema = {
      type: 'object',
      properties: {
        color: { oneOf: [{ type: 'string', pattern: '^[A-F0-9]{6}$' }, { type: 'null' }] },
      },
      oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
    };
    const result = collectContractProperties(schema);
    const color = result.get('color');
    expect(color).toBeDefined();
    expect(Array.isArray(color.oneOf)).toBe(true);
    expect(color.oneOf.some((b: any) => b.type === 'null')).toBe(true);
  });

  test('handles missing input gracefully', () => {
    expect(collectContractProperties(null).size).toBe(0);
    expect(collectContractProperties(undefined).size).toBe(0);
    expect(collectContractProperties({}).size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// sanitizeSchema — catalog schemas must remain self-describing for clients
// that do not resolve `$ref`/`oneOf` branches. MCP clients such as Claude Code
// preserve object arguments only when the emitted schema carries
// `type: "object"`; otherwise object-only params can be stringified before
// they reach DocumentApi validation.
// ---------------------------------------------------------------------------

describe('sanitizeSchema', () => {
  const defs = {
    BlockNodeAddress: {
      type: 'object',
      properties: {
        kind: { const: 'block' },
        nodeType: { type: 'string' },
        nodeId: { type: 'string' },
      },
      required: ['kind', 'nodeType', 'nodeId'],
    },
    TextAddress: {
      type: 'object',
      properties: {
        kind: { const: 'text' },
        blockId: { type: 'string' },
      },
      required: ['kind', 'blockId'],
    },
    TextTarget: {
      type: 'object',
      properties: {
        kind: { const: 'text' },
        segments: { type: 'array' },
      },
      required: ['kind', 'segments'],
    },
    SelectionTarget: {
      oneOf: [
        {
          type: 'object',
          properties: {
            kind: { const: 'selection' },
          },
          required: ['kind'],
        },
      ],
    },
    DeleteBehavior: {
      enum: ['selection', 'exact'],
    },
  };

  test('adds object type to refs that resolve to object schemas', () => {
    const result = sanitizeSchema({ $ref: '#/$defs/BlockNodeAddress' }, defs);
    expect(result).toEqual({
      $ref: '#/$defs/BlockNodeAddress',
      type: 'object',
    });
  });

  test('adds object type to nested object-only oneOf branches', () => {
    const result = sanitizeSchema(
      {
        oneOf: [
          {
            oneOf: [{ $ref: '#/$defs/TextAddress' }, { $ref: '#/$defs/SelectionTarget' }],
          },
        ],
      },
      defs,
    );

    expect(result.type).toBe('object');
    expect(result.oneOf?.[0]).toMatchObject({ $ref: '#/$defs/TextAddress', type: 'object' });
    expect(result.oneOf?.[1]).toMatchObject({ $ref: '#/$defs/SelectionTarget', type: 'object' });
  });

  test('adds object type after dropping opaque empty oneOf branches', () => {
    const result = sanitizeSchema(
      {
        oneOf: [{ $ref: '#/$defs/TextAddress' }, {}],
      },
      defs,
    );

    expect(result).toMatchObject({
      $ref: '#/$defs/TextAddress',
      type: 'object',
    });
  });

  test('does not mark non-object refs as object', () => {
    const result = sanitizeSchema({ $ref: '#/$defs/DeleteBehavior' }, defs);
    expect(result).toEqual({ $ref: '#/$defs/DeleteBehavior' });
  });

  test('keeps mixed object and scalar unions untyped at the parent level', () => {
    const result = sanitizeSchema(
      {
        oneOf: [{ $ref: '#/$defs/BlockNodeAddress' }, { type: 'string' }],
      },
      defs,
    );

    expect(result.type).toBeUndefined();
    expect(result.oneOf?.[0]).toMatchObject({ $ref: '#/$defs/BlockNodeAddress', type: 'object' });
    expect(result.oneOf?.[1]).toEqual({ type: 'string' });
  });

  test('adds object type to merged object-only property schemas', () => {
    const merged = mergeMergedProperty(
      { oneOf: [{ $ref: '#/$defs/TextAddress' }, { $ref: '#/$defs/TextAddress' }] },
      { oneOf: [{ $ref: '#/$defs/TextTarget' }, { $ref: '#/$defs/SelectionTarget' }] },
    );

    const result = sanitizeSchema(merged, defs);

    expect(result.type).toBe('object');
    expect(result.oneOf?.every((branch: any) => branch?.type === 'object')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Integration: superdoc_table catalog regressions — these were briefly broken
// in the SD-2540 review pass (position collapsed, color lost nullable). They
// stay here as a final guard against regressions in the merged-tool surface.
// ---------------------------------------------------------------------------

describe('superdoc_table catalog regressions', () => {
  test('position enum unions row + column variants', async () => {
    const catalog: Catalog = JSON.parse(await readFile(CATALOG_PATH, 'utf8'));
    const table = catalog.tools.find((t) => t.toolName === 'superdoc_table');
    expect(table).toBeDefined();
    const position = table!.inputSchema.properties?.position;
    expect(position).toBeDefined();
    expect(Array.isArray(position.enum)).toBe(true);
    for (const value of ['above', 'below', 'left', 'right', 'first', 'last']) {
      expect(position.enum).toContain(value);
    }
  });

  test('set_shading.color preserves nullable branch + loose hex pattern', async () => {
    const catalog: Catalog = JSON.parse(await readFile(CATALOG_PATH, 'utf8'));
    const table = catalog.tools.find((t) => t.toolName === 'superdoc_table');
    const color = table!.inputSchema.properties?.color;
    expect(color).toBeDefined();
    expect(Array.isArray(color.oneOf)).toBe(true);
    const hasNullBranch = color.oneOf.some((b: any) => b?.type === 'null');
    expect(hasNullBranch).toBe(true);
    const stringBranch = color.oneOf.find((b: any) => b?.type === 'string');
    expect(stringBranch).toBeDefined();
    // Pattern must accept #-prefixed and 3-digit forms (the runtime adapter
    // normalizes back to canonical RRGGBB).
    expect(stringBranch.pattern).toMatch(/#\?/);
  });

  test('set_borders carries outer-branch `required` (mode/applyTo/border/edges) in every requiredOneOf leaf', async () => {
    // Regression: round-2 codegen merged only top-level baseRequired + the
    // inner sub-branch's required, dropping the OUTER branch's required.
    // For tables.setBorders this meant `mode`, `applyTo`, `border` (and
    // `edges` for the patch branch) were not enforced at the SDK validator,
    // so `superdoc_table({action:'set_borders', nodeId:'t1'})` reached the
    // runtime adapter and threw inside executeTablesSetBorders.
    interface CatalogWithOps {
      tools: Array<{
        toolName: string;
        operations: Array<{
          intentAction: string;
          required?: string[];
          requiredOneOf?: string[][];
        }>;
      }>;
    }
    const catalog: CatalogWithOps = JSON.parse(await readFile(CATALOG_PATH, 'utf8'));
    const table = catalog.tools.find((t) => t.toolName === 'superdoc_table');
    const setBorders = table!.operations.find((o) => o.intentAction === 'set_borders');
    expect(setBorders).toBeDefined();
    expect(Array.isArray(setBorders!.requiredOneOf)).toBe(true);
    // Every leaf must include `mode` (top-level required for all setBorders calls).
    for (const branch of setBorders!.requiredOneOf!) {
      expect(branch).toContain('mode');
    }
    // Each leaf carries either `applyTo+border` (apply branch) or `edges` (patch branch).
    const leafJoined = setBorders!.requiredOneOf!.map((b) => b.slice().sort().join(','));
    expect(leafJoined.some((s) => s.includes('applyTo') && s.includes('border'))).toBe(true);
    expect(leafJoined.some((s) => s.includes('edges'))).toBe(true);
  });

  test('set_shading carries `color` in every requiredOneOf branch', async () => {
    // Regression: codegen previously dropped the top-level `required: ['color']`
    // when emitting `requiredOneOf`, which let LLMs call setShading without
    // a color and the runtime then crashed inside normalizeColorInput.
    interface CatalogWithOps {
      tools: Array<{
        toolName: string;
        operations: Array<{
          intentAction: string;
          required?: string[];
          requiredOneOf?: string[][];
        }>;
      }>;
    }
    const catalog: CatalogWithOps = JSON.parse(await readFile(CATALOG_PATH, 'utf8'));
    const table = catalog.tools.find((t) => t.toolName === 'superdoc_table');
    const setShading = table!.operations.find((o) => o.intentAction === 'set_shading');
    expect(setShading).toBeDefined();
    expect(Array.isArray(setShading!.requiredOneOf)).toBe(true);
    for (const branch of setShading!.requiredOneOf!) {
      expect(branch).toContain('color');
    }
  });
});
