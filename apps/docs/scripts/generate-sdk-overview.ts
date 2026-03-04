/**
 * Generate the operations table in the SDK overview page.
 *
 * Reads the SDK contract JSON and injects a categorized operations table
 * into the marker block in `apps/docs/document-engine/sdks.mdx`.
 *
 * Requires: `apps/cli/generated/sdk-contract.json` to exist on disk.
 * Run `pnpm run cli:export-sdk-contract` first if it doesn't.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');
const CONTRACT_PATH = resolve(REPO_ROOT, 'apps/cli/generated/sdk-contract.json');
const SDK_OVERVIEW_PATH = resolve(REPO_ROOT, 'apps/docs/document-engine/sdks.mdx');

// ---------------------------------------------------------------------------
// Marker block
// ---------------------------------------------------------------------------

const MARKER_START = '{/* SDK_OPERATIONS_START */}';
const MARKER_END = '{/* SDK_OPERATIONS_END */}';

function replaceMarkerBlock(content: string, replacement: string): string {
  const startIndex = content.indexOf(MARKER_START);
  const endIndex = content.indexOf(MARKER_END);

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error(`Marker block not found in SDK overview. Expected ${MARKER_START} ... ${MARKER_END}.`);
  }

  const endMarkerEnd = endIndex + MARKER_END.length;
  return `${content.slice(0, startIndex)}${replacement}${content.slice(endMarkerEnd)}`;
}

// ---------------------------------------------------------------------------
// Contract types (minimal — only what we need for rendering)
// ---------------------------------------------------------------------------

interface ContractOperation {
  operationId: string;
  command: string;
  category: string;
  description: string;
  mutates: boolean;
  supportsTrackedMode: boolean;
  supportsDryRun: boolean;
}

interface SdkContract {
  operations: Record<string, ContractOperation>;
}

// ---------------------------------------------------------------------------
// Rendering metadata
// ---------------------------------------------------------------------------

type SdkLanguage = 'node' | 'python';

interface SdkLanguageTab {
  id: SdkLanguage;
  title: string;
}

const SDK_LANGUAGE_TABS: readonly SdkLanguageTab[] = [
  { id: 'node', title: 'Node.js' },
  { id: 'python', title: 'Python' },
];

const CATEGORY_DISPLAY_ORDER = [
  'lifecycle',
  'query',
  'mutation',
  'format',
  'format.paragraph',
  'styles',
  'styles.paragraph',
  'create',
  'sections',
  'blocks',
  'lists',
  'tables',
  'toc',
  'comments',
  'trackChanges',
  'capabilities',
  'history',
  'session',
  'introspection',
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  lifecycle: 'Lifecycle',
  query: 'Query',
  mutation: 'Mutation',
  format: 'Format',
  'format.paragraph': 'Format / Paragraph',
  styles: 'Styles',
  'styles.paragraph': 'Styles / Paragraph',
  create: 'Create',
  sections: 'Sections',
  blocks: 'Blocks',
  lists: 'Lists',
  tables: 'Tables',
  toc: 'Table of contents',
  comments: 'Comments',
  trackChanges: 'Track changes',
  capabilities: 'Capabilities',
  history: 'History',
  session: 'Session',
  introspection: 'Introspection',
};

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function groupByCategory(operations: ContractOperation[]): Map<string, ContractOperation[]> {
  const groups = new Map<string, ContractOperation[]>();

  for (const op of operations) {
    const list = groups.get(op.category) ?? [];
    list.push(op);
    groups.set(op.category, list);
  }

  return groups;
}

function toSnakeCase(value: string): string {
  return value
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function operationPathForLanguage(operationId: string, language: SdkLanguage): string {
  if (language === 'node') {
    return operationId;
  }

  return operationId
    .split('.')
    .map((token, index) => (index === 0 ? token : toSnakeCase(token)))
    .join('.');
}

function resolveCategoryOrder(operations: ContractOperation[]): string[] {
  const availableCategories = Array.from(new Set(operations.map((op) => op.category)));

  const preferredCategories = CATEGORY_DISPLAY_ORDER.filter((category) => availableCategories.includes(category));
  const additionalCategories = availableCategories
    .filter((category) => !CATEGORY_DISPLAY_ORDER.includes(category))
    .sort((left, right) => left.localeCompare(right));

  return [...preferredCategories, ...additionalCategories];
}

function humanizeCategoryName(category: string): string {
  if (CATEGORY_LABELS[category]) {
    return CATEGORY_LABELS[category];
  }

  return category
    .split('.')
    .map((token) =>
      token
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase()),
    )
    .join(' / ');
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function renderOperationsTable(operations: ContractOperation[], language: SdkLanguage): string {
  const grouped = groupByCategory(operations);
  const categoryOrder = resolveCategoryOrder(operations);

  const sections: string[] = [];

  for (const category of categoryOrder) {
    const ops = grouped.get(category);
    if (!ops || ops.length === 0) continue;

    const label = humanizeCategoryName(category);
    const rows = ops
      .map((op) => {
        const operationPath = operationPathForLanguage(op.operationId, language);
        return `| \`${operationPath}\` | \`${op.command}\` | ${escapeTableCell(op.description)} |`;
      })
      .join('\n');

    sections.push(`#### ${label}\n\n| Operation | CLI command | Description |\n| --- | --- | --- |\n${rows}`);
  }

  return sections.join('\n\n');
}

function renderLanguageTab(operations: ContractOperation[], languageTab: SdkLanguageTab): string {
  const table = renderOperationsTable(operations, languageTab.id);

  return `  <Tab title="${languageTab.title}">

${table}

  </Tab>`;
}

function renderMarkerBlock(operations: ContractOperation[]): string {
  const tabs = SDK_LANGUAGE_TABS.map((languageTab) => renderLanguageTab(operations, languageTab)).join('\n');

  return `${MARKER_START}
## Available operations

The SDKs expose all operations from the [Document API](/document-api/overview) plus lifecycle and session commands. The tables below are grouped by category.

<Tabs>
${tabs}
</Tabs>
${MARKER_END}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const contractRaw = await readFile(CONTRACT_PATH, 'utf8');
  const contract: SdkContract = JSON.parse(contractRaw);
  const operations = Object.values(contract.operations);

  const overviewContent = await readFile(SDK_OVERVIEW_PATH, 'utf8');
  const block = renderMarkerBlock(operations);
  const updated = replaceMarkerBlock(overviewContent, block);

  await writeFile(SDK_OVERVIEW_PATH, updated, 'utf8');
  console.log(`generated SDK overview operations table (${operations.length} operations)`);
}

main().catch((error) => {
  console.error('generate-sdk-overview failed:', error.message ?? error);
  process.exitCode = 1;
});
