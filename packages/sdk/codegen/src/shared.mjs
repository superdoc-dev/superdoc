import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const REPO_ROOT = path.resolve(__dirname, '../../../../');
export const CONTRACT_PATH = path.join(REPO_ROOT, 'apps/cli/generated/sdk-contract.json');

export function pascalCase(value) {
  return value
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

export function camelCase(value) {
  const p = pascalCase(value);
  return p.charAt(0).toLowerCase() + p.slice(1);
}

export async function loadContract() {
  const raw = await readFile(CONTRACT_PATH, 'utf8');
  return JSON.parse(raw);
}

export async function writeGeneratedFile(filePath, content) {
  // Allow generate-all.mjs to redirect writes for --check mode
  if (globalThis.__SDK_CODEGEN_WRITE_FN) {
    return globalThis.__SDK_CODEGEN_WRITE_FN(filePath, content);
  }
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');
}

/**
 * Strip 'doc.' prefix and replace dots with spaces for naming.
 * E.g. "doc.comments.add" -> "comments add"
 */
export function sanitizeOperationId(operationId) {
  return operationId.replace(/^doc\./, '').replace(/\./g, ' ');
}

export function toNodeType(paramType) {
  switch (paramType) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'string[]':
      return 'string[]';
    case 'json':
      return 'Record<string, unknown> | unknown[]';
    default:
      return 'unknown';
  }
}

/**
 * Build a nested operation tree from the flat operations object.
 * New contract format: operations is Record<string, OperationEntry>.
 */
export function createOperationTree(operations) {
  const root = {};

  for (const [operationId, operation] of Object.entries(operations)) {
    const pathParts = operationId.split('.').slice(1); // strip 'doc.'
    let node = root;

    for (let i = 0; i < pathParts.length; i += 1) {
      const part = pathParts[i];
      const isLeaf = i === pathParts.length - 1;

      if (isLeaf) {
        node[part] = { __operation: { ...operation, id: operationId } };
      } else {
        node[part] = node[part] ?? {};
        node = node[part];
      }
    }
  }

  return root;
}
