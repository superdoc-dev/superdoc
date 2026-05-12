export function requireTableNodeId(result: { success: boolean; table?: { nodeId?: string } }, label: string): string {
  if (!result.success) {
    throw new Error(`${label} failed: expected success.`);
  }
  const nodeId = (result as { table?: { nodeId?: string } }).table?.nodeId;
  if (!nodeId) {
    throw new Error(`${label}: expected result.table.nodeId to be defined.`);
  }
  return nodeId;
}
