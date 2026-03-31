import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadContract, REPO_ROOT, stripBoundParams, writeGeneratedFile } from './shared.mjs';

const TOOLS_OUTPUT_DIR = path.join(REPO_ROOT, 'packages/sdk/tools');
const BROWSER_SDK_DIR = path.join(REPO_ROOT, 'packages/sdk/langs/browser/src');

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

      // Remove empty-object branches ({}) from oneOf — they represent null/clear
      // but are opaque to LLMs. The parent description handles the "use null to clear" guidance.
      result.oneOf = result.oneOf.filter(
        (branch) => !(typeof branch === 'object' && Object.keys(branch).length === 0),
      );

      // Deduplicate oneOf branches with identical simple types (string, number, boolean).
      // Keep the one with the longer description. Don't deduplicate objects (they may have different properties).
      const simpleSeen = new Map();
      const deduped = [];
      for (const branch of result.oneOf) {
        const isSimple = branch.type && branch.type !== 'object' && branch.type !== 'array';
        const key = isSimple ? branch.type : null;
        if (key && simpleSeen.has(key)) {
          const existing = simpleSeen.get(key);
          if ((branch.description || '').length > (existing.description || '').length) {
            deduped[deduped.indexOf(existing)] = branch;
            simpleSeen.set(key, branch);
          }
        } else {
          if (key) simpleSeen.set(key, branch);
          deduped.push(branch);
        }
      }
      result.oneOf = deduped;

      // Collapse oneOf with a single branch
      if (result.oneOf.length === 1) {
        const only = result.oneOf[0];
        delete result.oneOf;
        Object.assign(result, only);
      }
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

  // Strip doc/sessionId — the document handle manages targeting.
  const params = stripBoundParams(operation.params);

  for (const param of params) {
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
// Extract required-field constraints for an operation.
//
// Two sources of truth exist:
//   1. CLI params (via buildInputSchemaFromParams) — use param names the tool
//      schema exposes (e.g. "id", not contract's "commentId").
//   2. Contract inputSchema — captures oneOf / discriminated-union constraints
//      that CLI params can't express.
//
// Strategy:
//   - Flat required → derive from CLI params (names match the grouped tool schema)
//   - oneOf required → derive from contract inputSchema (property names verified
//     to match CLI param names for all oneOf operations)
//
// Returns one of:
//   { required: string[] }        — all listed keys must be present
//   { requiredOneOf: string[][] } — at least one branch must be fully satisfied
//   {}                            — no extractable constraints
// ---------------------------------------------------------------------------

function extractRequiredConstraints(operation) {
  const cliSchema = buildInputSchemaFromParams(operation);
  const cliParamNames = new Set(Object.keys(cliSchema.properties ?? {}));
  const contractSchema = operation.inputSchema;

  // oneOf in contract schema — collect per-branch required arrays.
  // (Verified: all oneOf operations use property names matching CLI params.)
  if (contractSchema && Array.isArray(contractSchema.oneOf)) {
    const branches = [];
    for (const branch of contractSchema.oneOf) {
      if (Array.isArray(branch.oneOf)) {
        for (const sub of branch.oneOf) {
          if (Array.isArray(sub.required) && sub.required.length > 0) {
            branches.push(sub.required);
          }
        }
      } else if (Array.isArray(branch.required) && branch.required.length > 0) {
        branches.push(branch.required);
      }
    }
    if (branches.length > 0) return { requiredOneOf: branches };
  }

  // Flat required — union two sources:
  //   1. Contract inputSchema.required filtered to CLI param names only
  //      (contract is authoritative for required-ness, but may use different
  //      property names, e.g. "commentId" vs CLI "id")
  //   2. CLI params with required: true
  //      (covers names that don't appear in the contract schema)
  const required = new Set(cliSchema.required ?? []);
  if (contractSchema && Array.isArray(contractSchema.required)) {
    for (const key of contractSchema.required) {
      if (cliParamNames.has(key)) required.add(key);
    }
  }
  if (required.size > 0) return { required: [...required] };

  return {};
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
    // Tool dispatch targets a document handle — only document-surface operations qualify.
    if (operation.sdkSurface !== 'document') continue;
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
    const annotations = deriveAnnotations(ops);
    const inputExamples = meta.inputExamples || [];

    if (isSingleOp) {
      // Single-op tool — no action enum, input schema = operation schema
      const { operationId, operation } = ops[0];
      const inputSchema = buildInputSchemaFromParams(operation);

      tools.push({
        toolName: meta.toolName,
        description: meta.description,
        inputSchema,
        mutates,
        annotations,
        inputExamples,
        operations: [{ operationId, intentAction: operation.intentAction, ...extractRequiredConstraints(operation) }],
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
      // Track which actions require each param so we can annotate descriptions.
      const allProperties = { action: actionProperty };
      /** @type {Map<string, { total: number, requiredCount: number, requiredBy: string[] }>} */
      const propPresence = new Map();

      for (const { operation } of ops) {
        const opSchema = buildInputSchemaFromParams(operation);
        const opRequired = new Set(opSchema.required ?? []);

        // Also check the contract inputSchema's required array — CLI params may
        // strip required flags (e.g. when EXTRA_CLI_PARAMS exist), but the
        // contract schema is authoritative for which fields the operation needs.
        const contractRequired = operation.inputSchema?.required;
        if (Array.isArray(contractRequired)) {
          for (const key of contractRequired) opRequired.add(key);
        }

        for (const [propName, propSchema] of Object.entries(opSchema.properties ?? {})) {
          if (propName === 'action') continue;

          if (!allProperties[propName]) {
            allProperties[propName] = { ...propSchema };
          }

          const entry = propPresence.get(propName) ?? { total: 0, requiredCount: 0, requiredBy: [] };
          entry.total++;
          if (opRequired.has(propName)) {
            entry.requiredCount++;
            entry.requiredBy.push(operation.intentAction);
          }
          propPresence.set(propName, entry);
        }
      }

      // 'action' is always required; other props are required only if they
      // appear in every operation AND every operation marks them required.
      const opCount = ops.length;
      const allRequired = ['action'];
      for (const [propName, { total, requiredCount }] of propPresence) {
        if (total === opCount && requiredCount === opCount) {
          allRequired.push(propName);
        }
      }

      // Annotate descriptions so the LLM knows which params belong to which actions.
      // Two cases:
      //   1. Param is required by some actions → "Required for action X, Y."
      //   2. Param only appears in a few actions (not all) → "Only for action X, Y."
      //      This prevents the model from sending list/get params with create calls.
      for (const [propName, { total, requiredCount, requiredBy }] of propPresence) {
        if (!allProperties[propName]) continue;
        const existing = allProperties[propName].description || '';

        if (requiredCount > 0 && requiredCount < opCount) {
          // Case 1: required by some actions
          const actions = requiredBy.map((a) => `'${a}'`).join(', ');
          const suffix = `Required for ${requiredBy.length === 1 ? 'action' : 'actions'} ${actions}.`;
          allProperties[propName] = {
            ...allProperties[propName],
            description: existing ? `${existing} ${suffix}` : suffix,
          };
        } else if (total > 0 && total < opCount && requiredCount === 0) {
          // Case 2: appears in some actions but required by none — annotate scope.
          // Only annotate when the param appears in a MINORITY of actions (at most half).
          // Params in most actions are the norm and don't need "Only for" annotations,
          // which can cause the model to avoid them unnecessarily.
          const presentIn = [];
          for (const { operation } of ops) {
            const opSchema = buildInputSchemaFromParams(operation);
            if (opSchema.properties && propName in opSchema.properties) {
              presentIn.push(operation.intentAction);
            }
          }
          if (presentIn.length <= opCount / 2) {
            const actions = presentIn.map((a) => `'${a}'`).join(', ');
            const suffix = `Only for ${presentIn.length === 1 ? 'action' : 'actions'} ${actions}. Omit for other actions.`;
            allProperties[propName] = {
              ...allProperties[propName],
              description: existing ? `${existing} ${suffix}` : suffix,
            };
          }
        }
      }

      // Add fallback descriptions for complex undescribed params.
      for (const [propName, propSchema] of Object.entries(allProperties)) {
        if (propSchema.description) continue;
        if (propName === 'target') {
          allProperties[propName] = { ...propSchema, description: "Target address. For inline/set_style: prefer 'ref' from superdoc_search, or use {kind:'selection', start:{kind:'text', blockId, offset}, end:{kind:'text', blockId, offset}}. For paragraph actions (set_alignment, set_indentation, set_spacing, set_direction, set_flow_options): use {kind:'block', nodeType:'paragraph'|'heading'|'listItem', nodeId:'<nodeId from blocks list>'}." };
        } else if (propName === 'ref') {
          allProperties[propName] = { ...propSchema, description: "Handle ref string from superdoc_search. Pass handle.ref value directly (e.g. 'text:eyJ...'). Preferred for text-level operations." };
        } else if (propName === 'content') {
          allProperties[propName] = { ...propSchema, description: "Document fragment content (structured JSON)." };
        } else if (propName === 'inline') {
          allProperties[propName] = { ...propSchema, description: "Inline formatting to apply: {bold: true, italic: true, underline: true, ...}." };
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
        annotations,
        inputExamples,
        operations: ops.map(({ operationId, operation }) => ({
          operationId,
          intentAction: operation.intentAction,
          ...extractRequiredConstraints(operation),
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

  if (first) {
    lines.push("    raise SuperDocError(f'Unknown intent tool: {tool_name}', code='TOOL_DISPATCH_NOT_FOUND', details={'toolName': tool_name})");
  } else {
    lines.push('    else:');
    lines.push("        raise SuperDocError(f'Unknown intent tool: {tool_name}', code='TOOL_DISPATCH_NOT_FOUND', details={'toolName': tool_name})");
  }
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
    annotations: entry.annotations,
  };
}

/**
 * Derive tool-level behavioral annotations from per-operation metadata.
 * No hardcoded map — annotations stay correct as operations change.
 *
 * MCP-aligned fields: readOnlyHint, destructiveHint, idempotentHint, openWorldHint.
 * SuperDoc-specific fields: reversible, supportsDryRun, supportsTrackedChanges.
 */
function deriveAnnotations(ops) {
  const allReadOnly = ops.every(({ operation }) => !operation.mutates);
  const anyDryRun = ops.some(({ operation }) => operation.supportsDryRun);
  const anyTracked = ops.some(({ operation }) => operation.supportsTrackedMode);
  const allIdempotent = ops.every(({ operation }) => operation.idempotency === 'idempotent');
  // Destructive if mutations exist but none support dry-run or tracked mode (irreversible)
  const destructive = !allReadOnly && !anyDryRun && !anyTracked;

  return {
    readOnlyHint: allReadOnly,
    destructiveHint: destructive,
    idempotentHint: allIdempotent,
    openWorldHint: false, // SuperDoc tools never interact with external systems
    reversible: !allReadOnly && anyDryRun, // if it supports dry-run, it's undoable
    supportsDryRun: anyDryRun,
    supportsTrackedChanges: anyTracked,
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
    // Browser SDK: intent dispatch (same logic, browser-safe header)
    writeGeneratedFile(
      path.join(BROWSER_SDK_DIR, 'intent-dispatch.ts'),
      dispatchTs.replace(
        '// Auto-generated by generate-intent-tools.mjs — do not edit',
        '// Auto-generated by generate-intent-tools.mjs — do not edit.\n// Pure logic, no Node.js dependencies. Safe for browser bundling.',
      ),
    ),
  ];

  // Browser SDK: embed system-prompt.md as a TypeScript string constant
  try {
    const promptMd = await readFile(path.join(TOOLS_OUTPUT_DIR, 'system-prompt.md'), 'utf8');
    const escaped = promptMd.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
    const promptTs =
      '// Auto-generated from packages/sdk/tools/system-prompt.md\n' +
      '// Do not edit manually — re-run generate:all to update.\n' +
      'export const SYSTEM_PROMPT = `' + escaped + '`;\n';
    writes.push(writeGeneratedFile(path.join(BROWSER_SDK_DIR, 'system-prompt.ts'), promptTs));
  } catch {
    // system-prompt.md may not exist yet during initial bootstrap
  }

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
