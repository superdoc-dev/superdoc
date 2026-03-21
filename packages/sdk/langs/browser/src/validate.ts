// Extracted from packages/sdk/langs/node/src/tools.ts — pure logic, no Node.js deps.

export type ToolCatalog = {
  contractVersion: string;
  generatedAt: string | null;
  toolCount: number;
  tools: ToolCatalogEntry[];
};

export type ToolCatalogEntry = {
  toolName: string;
  description: string;
  inputSchema: Record<string, unknown>;
  mutates: boolean;
  operations: OperationEntry[];
};

export type OperationEntry = {
  operationId: string;
  intentAction: string;
  required?: string[];
  requiredOneOf?: string[][];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

export function validateToolArgs(toolName: string, args: Record<string, unknown>, tool: ToolCatalogEntry): void {
  const schema = tool.inputSchema;
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const required: string[] = Array.isArray(schema.required) ? (schema.required as string[]) : [];

  // 1. Reject unknown keys
  const knownKeys = new Set(Object.keys(properties));
  const unknownKeys = Object.keys(args).filter((k) => !knownKeys.has(k));
  if (unknownKeys.length > 0) {
    throw new Error(`Unknown argument(s) for ${toolName}: ${unknownKeys.join(', ')}`);
  }

  // 2. Reject missing universally-required keys
  const missingKeys = required.filter((k) => args[k] == null);
  if (missingKeys.length > 0) {
    throw new Error(`Missing required argument(s) for ${toolName}: ${missingKeys.join(', ')}`);
  }

  // 3. Per-operation required constraints
  const action = args.action;
  let op: OperationEntry | undefined;
  if (typeof action === 'string' && tool.operations.length > 1) {
    op = tool.operations.find((o) => o.intentAction === action);
  } else if (tool.operations.length === 1) {
    op = tool.operations[0];
  }

  if (op) {
    validateOperationRequired(toolName, action, args, op);
  }
}

function validateOperationRequired(
  toolName: string,
  action: unknown,
  args: Record<string, unknown>,
  op: OperationEntry,
): void {
  const actionLabel = typeof action === 'string' ? ` action "${action}"` : '';

  if (op.requiredOneOf && op.requiredOneOf.length > 0) {
    const satisfied = op.requiredOneOf.some((branch) => branch.every((k) => args[k] != null));
    if (!satisfied) {
      const options = op.requiredOneOf.map((b) => b.join(' + ')).join(' | ');
      throw new Error(`Missing required argument(s) for ${toolName}${actionLabel}: must provide one of: ${options}`);
    }
  } else if (op.required && op.required.length > 0) {
    const missingActionKeys = op.required.filter((k) => args[k] == null);
    if (missingActionKeys.length > 0) {
      throw new Error(`Missing required argument(s) for ${toolName}${actionLabel}: ${missingActionKeys.join(', ')}`);
    }
  }
}
