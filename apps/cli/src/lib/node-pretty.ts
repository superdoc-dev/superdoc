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

export function buildNodePretty(revision: number, headerLabel: string, result: unknown): string {
  const lines: string[] = [`Revision ${revision}: ${headerLabel}`];
  const record = asRecord(result);
  if (!record) return lines.join('\n');

  // SDNodeResult format: { node: { kind, ... }, address: { nodeId, ... } }
  const sdNode = asRecord(record.node);
  const sdAddress = asRecord(record.address);

  const nodeId =
    (sdAddress && typeof sdAddress.nodeId === 'string' ? sdAddress.nodeId : '') ||
    (typeof record.nodeId === 'string' ? record.nodeId : '');
  const nodeKind =
    (sdNode && typeof sdNode.kind === 'string' ? sdNode.kind : '') ||
    (typeof record.nodeType === 'string' ? record.nodeType : '');

  if (nodeId.length > 0 || nodeKind.length > 0) {
    const parts: string[] = [];
    if (nodeId.length > 0) parts.push(nodeId);
    if (nodeKind.length > 0) parts.push(`(${nodeKind})`);
    lines.push(`  ${parts.join(' ')}`);
  }

  // Try to extract text from SDM/1 node structure
  const text = extractNodeText(sdNode) || (typeof record.text === 'string' ? toSingleLine(record.text) : '');
  if (text.length > 0) {
    lines.push('');
    lines.push(`  Text: "${truncate(text, 80)}"`);
  }

  // Check for properties on the node's kind-keyed object (e.g., node.paragraph.props)
  const kindData = sdNode && typeof sdNode.kind === 'string' ? asRecord(sdNode[sdNode.kind]) : null;
  const properties = asRecord(kindData?.props) ?? asRecord(record.properties);
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

/** Extract text content from an SDM/1 node. */
function extractNodeText(node: NodeLike | null): string {
  if (!node || typeof node.kind !== 'string') return '';
  const kindData = asRecord(node[node.kind]);
  if (!kindData) return '';

  // Run nodes: { kind: 'run', run: { text: '...' } }
  if (node.kind === 'run' && typeof kindData.text === 'string') {
    return toSingleLine(kindData.text);
  }

  // Paragraph/heading nodes: collect inline text
  const inlines = Array.isArray(kindData.inlines) ? kindData.inlines : [];
  const texts: string[] = [];
  for (const inline of inlines) {
    const inlineRecord = asRecord(inline);
    if (!inlineRecord) continue;
    if (inlineRecord.kind === 'run') {
      const runData = asRecord(inlineRecord.run);
      if (runData && typeof runData.text === 'string') texts.push(runData.text);
    }
  }
  return texts.length > 0 ? toSingleLine(texts.join('')) : '';
}
