import { describe, it, expect } from 'bun:test';
import * as z4mini from 'zod/v4-mini';
import { jsonSchemaPropertyToZod } from '../tools/intent.js';
import { MCP_TOOL_CATALOG } from '../generated/catalog.js';

function emit(prop: Record<string, unknown>) {
  const schema = jsonSchemaPropertyToZod(prop);
  return z4mini.toJSONSchema(schema as never, { target: 'draft-7', io: 'input' }) as Record<string, unknown>;
}

describe('jsonSchemaPropertyToZod', () => {
  it("emits type:'object' for plain object props", () => {
    expect(emit({ type: 'object' }).type).toBe('object');
  });

  it("emits type:'object' for oneOf where every variant is object-typed", () => {
    expect(
      emit({
        oneOf: [
          { type: 'object', properties: {} },
          { type: 'object', properties: { x: { type: 'string' } } },
        ],
      }).type,
    ).toBe('object');
  });

  it('omits type for oneOf containing a non-object variant (object|array)', () => {
    const out = emit({
      oneOf: [{ type: 'object' }, { type: 'array', items: { type: 'object' } }],
    });
    expect(out.type).toBeUndefined();
  });

  it('omits type for oneOf containing a non-object variant (boolean|object)', () => {
    const out = emit({ oneOf: [{ type: 'boolean' }, { type: 'object' }] });
    expect(out.type).toBeUndefined();
  });

  it('handles anyOf and allOf the same way as oneOf', () => {
    expect(emit({ anyOf: [{ type: 'object' }, { type: 'object' }] }).type).toBe('object');
    expect(emit({ allOf: [{ type: 'object' }, { type: 'object' }] }).type).toBe('object');
    expect(emit({ anyOf: [{ type: 'string' }, { type: 'object' }] }).type).toBeUndefined();
  });

  it('falls back to z.unknown() for top-level oneOf with non-object variant in real catalog (superdoc_edit.content)', () => {
    type Tool = { toolName: string; inputSchema: { properties?: Record<string, Record<string, unknown>> } };
    const catalog = MCP_TOOL_CATALOG as { tools: Tool[] };
    const edit = catalog.tools.find((t) => t.toolName === 'superdoc_edit');
    const content = edit?.inputSchema?.properties?.content;
    expect(content?.oneOf).toBeDefined();
    const variants = content!.oneOf as Array<{ type?: string }>;
    const hasNonObject = variants.some((v) => v.type !== 'object');
    expect(hasNonObject).toBe(true);
    expect(emit(content!).type).toBeUndefined();
  });
});
