import { z, type ZodTypeAny } from 'zod';

type JsonSchemaProp = Record<string, unknown>;

/**
 * Convert a single JSON Schema property descriptor to a Zod type.
 * Handles the subset used by @superdoc/llm-tools definitions:
 * string (with optional enum), number, boolean, object, array, and any.
 */
function propertyToZod(prop: JsonSchemaProp): ZodTypeAny {
  const desc = typeof prop.description === 'string' ? prop.description : undefined;

  let schema: ZodTypeAny;

  switch (prop.type) {
    case 'string':
      if (Array.isArray(prop.enum) && prop.enum.length > 0) {
        schema = z.enum(prop.enum as [string, ...string[]]);
      } else {
        schema = z.string();
      }
      break;

    case 'number':
      schema = z.number();
      break;

    case 'boolean':
      schema = z.boolean();
      break;

    case 'object': {
      if (prop.properties && typeof prop.properties === 'object') {
        const shape: Record<string, ZodTypeAny> = {};
        for (const [k, v] of Object.entries(prop.properties as Record<string, JsonSchemaProp>)) {
          shape[k] = propertyToZod(v).optional();
        }
        schema = z.object(shape);
      } else {
        schema = z.record(z.string(), z.unknown());
      }
      break;
    }

    case 'array': {
      const items = prop.items as JsonSchemaProp | undefined;
      schema = z.array(items ? propertyToZod(items) : z.unknown());
      break;
    }

    default:
      schema = z.any();
      break;
  }

  return desc ? schema.describe(desc) : schema;
}

/**
 * Convert a JSON Schema `{ type: 'object', properties, required }` into a
 * Zod raw shape (`Record<string, ZodTypeAny>`) suitable for `registerTool`.
 *
 * Properties NOT listed in `required` are wrapped with `.optional()`.
 */
export function jsonSchemaToZodShape(schema: Record<string, unknown>): Record<string, ZodTypeAny> {
  const properties = (schema.properties ?? {}) as Record<string, JsonSchemaProp>;
  const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);

  const shape: Record<string, ZodTypeAny> = {};

  for (const [key, prop] of Object.entries(properties)) {
    const zodType = propertyToZod(prop);
    shape[key] = required.has(key) ? zodType : zodType.optional();
  }

  return shape;
}
