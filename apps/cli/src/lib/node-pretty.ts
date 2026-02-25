import { toSingleLine, truncate } from './pretty-helpers';

type NodeLike = Record<string, unknown>;

function asRecord(value: unknown): NodeLike | null {
  if (typeof value !== 'object' || value == null || Array.isArray(value)) return null;
  return value as NodeLike;
}

function formatPropertyValue(value: unknown): string | null {
  if (value == null || value === false) return null;
  if (typeof value === 'string') return value.length > 0 ? value : null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    const serialized = JSON.stringify(value);
    return serialized && serialized !== 'null' ? serialized : null;
  } catch {
    return null;
  }
}

export function buildNodePretty(revision: number, headerLabel: string, node: unknown): string {
  const lines: string[] = [`Revision ${revision}: ${headerLabel}`];
  const record = asRecord(node);
  if (!record) return lines.join('\n');

  const nodeId = typeof record.nodeId === 'string' ? record.nodeId : '';
  const nodeType = typeof record.nodeType === 'string' ? record.nodeType : '';
  if (nodeId.length > 0 || nodeType.length > 0) {
    const parts: string[] = [];
    if (nodeId.length > 0) parts.push(nodeId);
    if (nodeType.length > 0) parts.push(`(${nodeType})`);
    lines.push(`  ${parts.join(' ')}`);
  }

  const text = typeof record.text === 'string' ? toSingleLine(record.text) : '';
  if (text.length > 0) {
    lines.push('');
    lines.push(`  Text: "${truncate(text, 80)}"`);
  }

  const properties = asRecord(record.properties);
  if (!properties) return lines.join('\n');

  const formatted = Object.entries(properties)
    .map(([key, raw]) => {
      const value = formatPropertyValue(raw);
      if (!value) return null;
      return `${key}=${truncate(toSingleLine(value), 48)}`;
    })
    .filter((entry): entry is string => entry != null)
    .slice(0, 6);

  if (formatted.length > 0) {
    lines.push(`  Properties: ${formatted.join(', ')}`);
  }

  return lines.join('\n');
}
