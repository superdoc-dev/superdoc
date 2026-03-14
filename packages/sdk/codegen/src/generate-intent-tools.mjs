import path from 'node:path';
import { loadContract, REPO_ROOT, writeGeneratedFile } from './shared.mjs';

const TOOLS_OUTPUT_DIR = path.join(REPO_ROOT, 'packages/sdk/tools');

// ---------------------------------------------------------------------------
// Schema sanitization — ensure JSON Schema 2020-12 compliance
// ---------------------------------------------------------------------------

/**
 * Recursively fix bare `{ const: value }` nodes to include `type`.
 * Anthropic requires `const` to be accompanied by a `type` field.
 */
function sanitizeSchema(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return schema;

  const result = { ...schema };

  // "type": "json" is a SuperDoc contract sentinel for "any JSON value".
  if (result.type === 'json') {
    delete result.type;
    return result;
  }

  // Fix bare const: add type based on the const value
  if ('const' in result && !result.type) {
    const val = result.const;
    if (typeof val === 'string') result.type = 'string';
    else if (typeof val === 'number') result.type = 'number';
    else if (typeof val === 'boolean') result.type = 'boolean';
  }

  // Recurse into nested structures
  if (result.properties) {
    result.properties = Object.fromEntries(
      Object.entries(result.properties).map(([k, v]) => [k, sanitizeSchema(v)]),
    );
  }
  if (Array.isArray(result.oneOf)) {
    const allConst = result.oneOf.every((v) => v && typeof v === 'object' && 'const' in v && Object.keys(v).length <= 2);
    if (allConst && result.oneOf.length > 0) {
      const values = result.oneOf.map((v) => v.const);
      delete result.oneOf;
      result.enum = values;
    } else {
      result.oneOf = result.oneOf.map(sanitizeSchema);
    }
  }
  if (Array.isArray(result.anyOf)) {
    result.anyOf = result.anyOf.map(sanitizeSchema);
  }
  if (Array.isArray(result.allOf)) {
    result.allOf = result.allOf.map(sanitizeSchema);
  }
  if (result.items) {
    result.items = sanitizeSchema(result.items);
  }
  if (result.additionalProperties && typeof result.additionalProperties === 'object') {
    result.additionalProperties = sanitizeSchema(result.additionalProperties);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Build input schema from CLI params (for CLI-only ops or as fallback)
// ---------------------------------------------------------------------------

function buildInputSchemaFromParams(operation) {
  const properties = {};
  const required = [];

  for (const param of operation.params ?? []) {
    if (param.agentVisible === false) continue;

    let schema;
    if (param.type === 'string' && param.schema) schema = { type: 'string', ...param.schema };
    else if (param.type === 'string') schema = { type: 'string' };
    else if (param.type === 'number') schema = { type: 'number' };
    else if (param.type === 'boolean') schema = { type: 'boolean' };
    else if (param.type === 'string[]') schema = { type: 'array', items: { type: 'string' } };
    else if (param.type === 'json' && param.schema && param.schema.type !== 'json') schema = param.schema;
    else schema = { type: 'object' };

    schema = sanitizeSchema(schema);
    if (param.description) schema.description = param.description;
    properties[param.name] = schema;
    if (param.required) required.push(param.name);
  }

  const result = { type: 'object', properties };
  if (required.length > 0) result.required = required;
  result.additionalProperties = false;
  return result;
}

// ---------------------------------------------------------------------------
// Build intent tools from grouped operations
// ---------------------------------------------------------------------------

function buildIntentTools(contract) {
  const intentGroupMeta = contract.intentGroupMeta ?? {};

  // Group operations by intentGroup
  const groups = new Map();
  for (const [operationId, operation] of Object.entries(contract.operations)) {
    if (operation.skipAsATool) continue;
    if (!operation.intentGroup) continue;

    const group = operation.intentGroup;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push({ operationId, operation });
  }

  const tools = [];

  for (const [groupKey, ops] of groups) {
    const meta = intentGroupMeta[groupKey];
    if (!meta) {
      console.warn(`No INTENT_GROUP_META for group "${groupKey}", skipping.`);
      continue;
    }

    const isSingleOp = ops.length === 1;
    const mutates = ops.some(({ operation }) => operation.mutates);

    if (isSingleOp) {
      // Single-op tool — no action enum, input schema = operation schema
      const { operationId, operation } = ops[0];
      const inputSchema = buildInputSchemaFromParams(operation);

      tools.push({
        toolName: meta.toolName,
        description: meta.description,
        inputSchema,
        mutates,
        operations: [{ operationId, intentAction: operation.intentAction }],
      });
    } else {
      // Multi-op tool — add action discriminator
      const actionEnum = ops.map(({ operation }) => operation.intentAction).sort();

      // Build properties: action + union of all operation properties
      const actionProperty = {
        type: 'string',
        enum: actionEnum,
        description: `The action to perform. One of: ${actionEnum.join(', ')}.`,
      };

      // Collect all properties across all operations (excluding action).
      // A property is marked required only if every operation that defines it
      // also marks it required — otherwise it's conditionally required per-action
      // and must stay optional in the merged schema.
      const allProperties = { action: actionProperty };
      /** @type {Map<string, { total: number, requiredCount: number }>} */
      const propPresence = new Map();

      for (const { operation } of ops) {
        const opSchema = buildInputSchemaFromParams(operation);
        const opRequired = new Set(opSchema.required ?? []);

        for (const [propName, propSchema] of Object.entries(opSchema.properties ?? {})) {
          if (propName === 'action') continue;

          if (!allProperties[propName]) {
            allProperties[propName] = { ...propSchema };
          }

          const entry = propPresence.get(propName) ?? { total: 0, requiredCount: 0 };
          entry.total++;
          if (opRequired.has(propName)) entry.requiredCount++;
          propPresence.set(propName, entry);
        }
      }

      // 'action' is always required; other props are required only if they
      // appear in every operation AND every operation marks them required.
      // If a param only exists in some actions, it's conditionally required
      // and must stay optional in the merged schema.
      const opCount = ops.length;
      const allRequired = ['action'];
      for (const [propName, { total, requiredCount }] of propPresence) {
        if (total === opCount && requiredCount === opCount) {
          allRequired.push(propName);
        }
      }

      const inputSchema = {
        type: 'object',
        properties: allProperties,
        required: allRequired,
        additionalProperties: false,
      };

      tools.push({
        toolName: meta.toolName,
        description: meta.description,
        inputSchema,
        mutates,
        operations: ops.map(({ operationId, operation }) => ({
          operationId,
          intentAction: operation.intentAction,
        })),
      });
    }
  }

  return tools;
}

// ---------------------------------------------------------------------------
// Generate dispatch code
// ---------------------------------------------------------------------------

function generateDispatchCode(tools) {
  const lines = [
    '// Auto-generated by generate-intent-tools.mjs — do not edit',
    '',
    'export function dispatchIntentTool(',
    '  toolName: string,',
    '  args: Record<string, unknown>,',
    '  execute: (operationId: string, input: Record<string, unknown>) => unknown,',
    '): unknown {',
    '  switch (toolName) {',
  ];

  for (const tool of tools) {
    const isSingleOp = tool.operations.length === 1;

    if (isSingleOp) {
      const { operationId } = tool.operations[0];
      lines.push(`    case '${tool.toolName}':`);
      lines.push(`      return execute('${operationId}', args);`);
    } else {
      lines.push(`    case '${tool.toolName}': {`);
      lines.push('      const { action, ...rest } = args;');
      lines.push('      switch (action) {');
      for (const { operationId, intentAction } of tool.operations) {
        lines.push(`        case '${intentAction}': return execute('${operationId}', rest);`);
      }
      lines.push(`        default: throw new Error(\`Unknown action for ${tool.toolName}: \${action}\`);`);
      lines.push('      }');
      lines.push('    }');
    }
  }

  lines.push('    default:');
  lines.push('      throw new Error(`Unknown intent tool: ${toolName}`);');
  lines.push('  }');
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Generate Python dispatch code
// ---------------------------------------------------------------------------

function generatePythonDispatchCode(tools) {
  const lines = [
    '# Auto-generated by generate-intent-tools.mjs — do not edit',
    '',
    'from typing import Any, Callable, Dict',
    '',
    'from ..errors import SuperDocError',
    '',
    '',
    'def dispatch_intent_tool(',
    '    tool_name: str,',
    '    args: Dict[str, Any],',
    '    execute: Callable[[str, Dict[str, Any]], Any],',
    ') -> Any:',
  ];

  // Build if/elif chain
  let first = true;
  for (const tool of tools) {
    const isSingleOp = tool.operations.length === 1;
    const prefix = first ? '    if' : '    elif';
    first = false;

    if (isSingleOp) {
      const { operationId } = tool.operations[0];
      lines.push(`${prefix} tool_name == '${tool.toolName}':`);
      lines.push(`        return execute('${operationId}', args)`);
    } else {
      lines.push(`${prefix} tool_name == '${tool.toolName}':`);
      lines.push("        action = args.get('action')");
      lines.push('        rest = {k: v for k, v in args.items() if k != \'action\'}');
      let firstAction = true;
      for (const { operationId, intentAction } of tool.operations) {
        const actionPrefix = firstAction ? '        if' : '        elif';
        firstAction = false;
        lines.push(`${actionPrefix} action == '${intentAction}':`);
        lines.push(`            return execute('${operationId}', rest)`);
      }
      lines.push(`        else:`);
      lines.push(`            raise SuperDocError(f'Unknown action for ${tool.toolName}: {action}', code='TOOL_DISPATCH_NOT_FOUND', details={'toolName': '${tool.toolName}', 'action': action})`);
    }
  }

  lines.push('    else:');
  lines.push("        raise SuperDocError(f'Unknown intent tool: {tool_name}', code='TOOL_DISPATCH_NOT_FOUND', details={'toolName': tool_name})");
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Provider formatters
// ---------------------------------------------------------------------------

function toOpenAiTool(entry) {
  return {
    type: 'function',
    function: {
      name: entry.toolName,
      description: entry.description,
      parameters: entry.inputSchema,
    },
  };
}

function toAnthropicTool(entry) {
  return {
    name: entry.toolName,
    description: entry.description,
    input_schema: entry.inputSchema,
  };
}

function toVercelTool(entry) {
  return {
    type: 'function',
    function: {
      name: entry.toolName,
      description: entry.description,
      parameters: entry.inputSchema,
    },
  };
}

function toGenericTool(entry) {
  return {
    name: entry.toolName,
    description: entry.description,
    parameters: entry.inputSchema,
    metadata: {
      mutates: entry.mutates,
      operationCount: entry.operations.length,
      operations: entry.operations.map((op) => op.operationId),
    },
  };
}

// ---------------------------------------------------------------------------
// Main generation
// ---------------------------------------------------------------------------

export async function generateIntentTools(contract) {
  const tools = buildIntentTools(contract);

  // Full catalog
  const catalog = {
    contractVersion: contract.contractVersion,
    generatedAt: null,
    toolCount: tools.length,
    tools: tools.map((t) => ({
      toolName: t.toolName,
      description: t.description,
      inputSchema: t.inputSchema,
      mutates: t.mutates,
      operations: t.operations,
    })),
  };

  // Tools policy (simplified for intent tools)
  const policy = {
    policyVersion: 'v4',
    toolCount: tools.length,
    tools: tools.map((t) => ({
      toolName: t.toolName,
      mutates: t.mutates,
    })),
    contractHash: contract.sourceHash,
  };

  // Provider bundles
  const providers = {
    openai: { formatter: toOpenAiTool, file: 'tools.openai.json' },
    anthropic: { formatter: toAnthropicTool, file: 'tools.anthropic.json' },
    vercel: { formatter: toVercelTool, file: 'tools.vercel.json' },
    generic: { formatter: toGenericTool, file: 'tools.generic.json' },
  };

  // Generated dispatch code
  const dispatchTs = generateDispatchCode(tools);
  const dispatchPy = generatePythonDispatchCode(tools);

  const writes = [
    writeGeneratedFile(path.join(TOOLS_OUTPUT_DIR, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n'),
    writeGeneratedFile(path.join(TOOLS_OUTPUT_DIR, 'tools-policy.json'), JSON.stringify(policy, null, 2) + '\n'),
    writeGeneratedFile(
      path.join(REPO_ROOT, 'packages/sdk/langs/node/src/generated/intent-dispatch.generated.ts'),
      dispatchTs,
    ),
    writeGeneratedFile(
      path.join(REPO_ROOT, 'packages/sdk/langs/python/superdoc/tools/intent_dispatch_generated.py'),
      dispatchPy,
    ),
  ];

  for (const { formatter, file } of Object.values(providers)) {
    const providerTools = tools.map(formatter);
    const bundle = {
      contractVersion: contract.contractVersion,
      tools: providerTools,
    };
    writes.push(writeGeneratedFile(path.join(TOOLS_OUTPUT_DIR, file), JSON.stringify(bundle, null, 2) + '\n'));
  }

  await Promise.all(writes);
}

if (import.meta.url.endsWith(process.argv[1]?.replace(/^file:\/\//, '') ?? '')) {
  const contract = await loadContract();
  await generateIntentTools(contract);
  console.log('Generated intent tool files.');
}
