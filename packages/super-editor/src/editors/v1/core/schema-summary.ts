import type { Schema } from 'prosemirror-model';
import type { SchemaSummaryJSON, SchemaSummaryAttribute } from './types/EditorSchema.js';
import type { AttributeValue } from './Attribute.js';

declare const __APP_VERSION__: string | undefined;
declare const version: string | undefined;

const summaryVersion =
  (typeof __APP_VERSION__ === 'string' && __APP_VERSION__) || (typeof version === 'string' && version) || '0.0.0';

const nodeKeys = ['group', 'content', 'marks', 'inline', 'atom', 'defining', 'code', 'tableRole', 'summary'] as const;

const markKeys = ['group', 'inclusive', 'excludes', 'spanning', 'code'] as const;

function mapAttributes(
  attrs: Record<string, { default?: unknown }> | null | undefined,
): Record<string, SchemaSummaryAttribute> {
  if (!attrs) return {};
  return Object.fromEntries(
    Object.entries(attrs).map(([name, attrSpec]) => {
      const defaultValue = attrSpec?.default as AttributeValue | undefined;
      return [
        name,
        {
          default: defaultValue ?? null,
          required: defaultValue === undefined,
        },
      ];
    }),
  ) as Record<string, SchemaSummaryAttribute>;
}

function pickSpecFields(
  spec: Record<string, unknown>,
  keys: readonly string[],
): Partial<SchemaSummaryJSON['nodes'][number]> | Partial<SchemaSummaryJSON['marks'][number]> {
  return Object.fromEntries(keys.map((key) => [key, spec[key]]).filter(([, value]) => value !== undefined));
}

export function buildSchemaSummary(schema: Schema, schemaVersion?: string): SchemaSummaryJSON {
  if (!schema || typeof schema !== 'object') {
    throw new Error('Invalid schema: schema must be a valid ProseMirror Schema object.');
  }

  const resolvedSchemaVersion = schemaVersion || 'current';

  const nodes: SchemaSummaryJSON['nodes'] = [];
  schema.spec.nodes.forEach((name, spec) => {
    nodes.push({
      name,
      attrs: mapAttributes(spec.attrs),
      ...pickSpecFields(spec as Record<string, unknown>, nodeKeys),
    });
  });

  const marks: SchemaSummaryJSON['marks'] = [];
  schema.spec.marks.forEach((name, spec) => {
    marks.push({
      name,
      attrs: mapAttributes(spec.attrs),
      ...pickSpecFields(spec as Record<string, unknown>, markKeys),
    });
  });

  return {
    version: summaryVersion,
    schemaVersion: resolvedSchemaVersion,
    topNode: schema.topNodeType?.name,
    nodes,
    marks,
  };
}
