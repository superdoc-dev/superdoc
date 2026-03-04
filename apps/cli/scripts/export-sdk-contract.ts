/**
 * export-sdk-contract.ts — Produces `apps/cli/generated/sdk-contract.json`.
 *
 * This is the single input artifact the SDK codegen consumes. It merges:
 *   - CLI operation metadata (transport plane: params, constraints, command tokens)
 *   - document-api schemas (schema plane: inputSchema, outputSchema, successSchema)
 *   - CLI-only operation definitions (from canonical definitions module)
 *   - Host protocol metadata
 *
 * Run:   bun run apps/cli/scripts/export-sdk-contract.ts
 * Check: bun run apps/cli/scripts/export-sdk-contract.ts --check
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';

import { COMMAND_CATALOG, INLINE_PROPERTY_REGISTRY } from '@superdoc/document-api';

import { CLI_OPERATION_METADATA } from '../src/cli/operation-params';
import {
  CLI_OPERATION_IDS,
  cliCategory,
  cliDescription,
  cliCommandTokens,
  cliRequiresDocumentContext,
  toDocApiId,
  type DocBackedCliOpId,
} from '../src/cli/operation-set';
import type { CliOnlyOperation } from '../src/cli/types';
import { CLI_ONLY_OPERATION_DEFINITIONS } from '../src/cli/cli-only-operation-definitions';
import { HOST_PROTOCOL_VERSION, HOST_PROTOCOL_FEATURES, HOST_PROTOCOL_NOTIFICATIONS } from '../src/host/protocol';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const ROOT = resolve(import.meta.dir, '../../..');
const CLI_DIR = resolve(ROOT, 'apps/cli');
const CONTRACT_JSON_PATH = resolve(ROOT, 'packages/document-api/generated/schemas/document-api-contract.json');
const OUTPUT_PATH = resolve(CLI_DIR, 'generated/sdk-contract.json');
const CLI_PKG_PATH = resolve(CLI_DIR, 'package.json');

// ---------------------------------------------------------------------------
// Intent names — human-friendly tool names for doc-backed operations only.
// CLI-only intent names live in CLI_ONLY_OPERATION_DEFINITIONS.
// Typed exhaustively: missing entry = compile error.
// ---------------------------------------------------------------------------

const INTENT_NAMES = {
  'doc.find': 'find_content',
  'doc.getNode': 'get_node',
  'doc.getNodeById': 'get_node_by_id',
  'doc.getText': 'get_document_text',
  'doc.getMarkdown': 'get_document_markdown',
  'doc.getHtml': 'get_document_html',
  'doc.info': 'get_document_info',
  'doc.capabilities.get': 'get_capabilities',
  'doc.insert': 'insert_content',
  'doc.replace': 'replace_content',
  'doc.delete': 'delete_content',
  'doc.blocks.delete': 'delete_block',
  'doc.format.apply': 'format_apply',
  ...Object.fromEntries(
    INLINE_PROPERTY_REGISTRY.map((entry) => [
      `doc.format.${entry.key}`,
      `format_${entry.key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`)}`,
    ]),
  ),
  'doc.styles.paragraph.setStyle': 'set_paragraph_style',
  'doc.styles.paragraph.clearStyle': 'clear_paragraph_style',
  'doc.format.paragraph.resetDirectFormatting': 'reset_paragraph_direct_formatting',
  'doc.format.paragraph.setAlignment': 'set_paragraph_alignment',
  'doc.format.paragraph.clearAlignment': 'clear_paragraph_alignment',
  'doc.format.paragraph.setIndentation': 'set_paragraph_indentation',
  'doc.format.paragraph.clearIndentation': 'clear_paragraph_indentation',
  'doc.format.paragraph.setSpacing': 'set_paragraph_spacing',
  'doc.format.paragraph.clearSpacing': 'clear_paragraph_spacing',
  'doc.format.paragraph.setKeepOptions': 'set_paragraph_keep_options',
  'doc.format.paragraph.setOutlineLevel': 'set_paragraph_outline_level',
  'doc.format.paragraph.setFlowOptions': 'set_paragraph_flow_options',
  'doc.format.paragraph.setTabStop': 'set_paragraph_tab_stop',
  'doc.format.paragraph.clearTabStop': 'clear_paragraph_tab_stop',
  'doc.format.paragraph.clearAllTabStops': 'clear_all_paragraph_tab_stops',
  'doc.format.paragraph.setBorder': 'set_paragraph_border',
  'doc.format.paragraph.clearBorder': 'clear_paragraph_border',
  'doc.format.paragraph.setShading': 'set_paragraph_shading',
  'doc.format.paragraph.clearShading': 'clear_paragraph_shading',
  'doc.styles.apply': 'styles_apply',
  'doc.create.paragraph': 'create_paragraph',
  'doc.create.heading': 'create_heading',
  'doc.create.sectionBreak': 'create_section_break',
  'doc.sections.list': 'list_sections',
  'doc.sections.get': 'get_section',
  'doc.sections.setBreakType': 'set_section_break_type',
  'doc.sections.setPageMargins': 'set_section_page_margins',
  'doc.sections.setHeaderFooterMargins': 'set_section_header_footer_margins',
  'doc.sections.setPageSetup': 'set_section_page_setup',
  'doc.sections.setColumns': 'set_section_columns',
  'doc.sections.setLineNumbering': 'set_section_line_numbering',
  'doc.sections.setPageNumbering': 'set_section_page_numbering',
  'doc.sections.setTitlePage': 'set_section_title_page',
  'doc.sections.setOddEvenHeadersFooters': 'set_section_odd_even_headers_footers',
  'doc.sections.setVerticalAlign': 'set_section_vertical_align',
  'doc.sections.setSectionDirection': 'set_section_direction',
  'doc.sections.setHeaderFooterRef': 'set_section_header_footer_reference',
  'doc.sections.clearHeaderFooterRef': 'clear_section_header_footer_reference',
  'doc.sections.setLinkToPrevious': 'set_section_link_to_previous',
  'doc.sections.setPageBorders': 'set_section_page_borders',
  'doc.sections.clearPageBorders': 'clear_section_page_borders',
  'doc.create.tableOfContents': 'create_table_of_contents',
  'doc.lists.list': 'list_lists',
  'doc.lists.get': 'get_list',
  'doc.lists.insert': 'insert_list',
  'doc.lists.indent': 'indent_list',
  'doc.lists.outdent': 'outdent_list',
  'doc.lists.create': 'create_list',
  'doc.lists.attach': 'attach_to_list',
  'doc.lists.detach': 'detach_from_list',
  'doc.lists.join': 'join_lists',
  'doc.lists.canJoin': 'can_join_lists',
  'doc.lists.separate': 'separate_list',
  'doc.lists.setLevel': 'set_list_level',
  'doc.lists.setValue': 'set_list_value',
  'doc.lists.continuePrevious': 'continue_previous_list',
  'doc.lists.canContinuePrevious': 'can_continue_previous_list',
  'doc.lists.setLevelRestart': 'set_list_level_restart',
  'doc.lists.convertToText': 'convert_list_to_text',
  'doc.comments.create': 'create_comment',
  'doc.comments.patch': 'patch_comment',
  'doc.comments.delete': 'delete_comment',
  'doc.comments.get': 'get_comment',
  'doc.comments.list': 'list_comments',
  'doc.trackChanges.list': 'list_tracked_changes',
  'doc.trackChanges.get': 'get_tracked_change',
  'doc.trackChanges.decide': 'decide_tracked_change',
  'doc.toc.list': 'list_table_of_contents',
  'doc.toc.get': 'get_table_of_contents',
  'doc.toc.configure': 'configure_table_of_contents',
  'doc.toc.update': 'update_table_of_contents',
  'doc.toc.remove': 'remove_table_of_contents',
  'doc.toc.markEntry': 'mark_table_of_contents_entry',
  'doc.toc.unmarkEntry': 'unmark_table_of_contents_entry',
  'doc.toc.listEntries': 'list_table_of_contents_entries',
  'doc.toc.getEntry': 'get_table_of_contents_entry',
  'doc.toc.editEntry': 'edit_table_of_contents_entry',
  'doc.query.match': 'query_match',
  'doc.mutations.preview': 'preview_mutations',
  'doc.mutations.apply': 'apply_mutations',
  'doc.create.table': 'create_table',
  'doc.tables.convertFromText': 'convert_text_to_table',
  'doc.tables.delete': 'delete_table',
  'doc.tables.clearContents': 'clear_table_contents',
  'doc.tables.move': 'move_table',
  'doc.tables.split': 'split_table',
  'doc.tables.convertToText': 'convert_table_to_text',
  'doc.tables.setLayout': 'set_table_layout',
  'doc.tables.insertRow': 'insert_table_row',
  'doc.tables.deleteRow': 'delete_table_row',
  'doc.tables.setRowHeight': 'set_table_row_height',
  'doc.tables.distributeRows': 'distribute_table_rows',
  'doc.tables.setRowOptions': 'set_table_row_options',
  'doc.tables.insertColumn': 'insert_table_column',
  'doc.tables.deleteColumn': 'delete_table_column',
  'doc.tables.setColumnWidth': 'set_table_column_width',
  'doc.tables.distributeColumns': 'distribute_table_columns',
  'doc.tables.insertCell': 'insert_table_cell',
  'doc.tables.deleteCell': 'delete_table_cell',
  'doc.tables.mergeCells': 'merge_table_cells',
  'doc.tables.unmergeCells': 'unmerge_table_cells',
  'doc.tables.splitCell': 'split_table_cell',
  'doc.tables.setCellProperties': 'set_table_cell_properties',
  'doc.tables.sort': 'sort_table',
  'doc.tables.setAltText': 'set_table_alt_text',
  'doc.tables.setStyle': 'set_table_style',
  'doc.tables.clearStyle': 'clear_table_style',
  'doc.tables.setStyleOption': 'set_table_style_option',
  'doc.tables.setBorder': 'set_table_border',
  'doc.tables.clearBorder': 'clear_table_border',
  'doc.tables.applyBorderPreset': 'apply_table_border_preset',
  'doc.tables.setShading': 'set_table_shading',
  'doc.tables.clearShading': 'clear_table_shading',
  'doc.tables.setTablePadding': 'set_table_padding',
  'doc.tables.setCellPadding': 'set_table_cell_padding',
  'doc.tables.setCellSpacing': 'set_table_cell_spacing',
  'doc.tables.clearCellSpacing': 'clear_table_cell_spacing',
  'doc.tables.get': 'get_table',
  'doc.tables.getCells': 'get_table_cells',
  'doc.tables.getProperties': 'get_table_properties',
  'doc.tables.getStyles': 'get_table_styles',
  'doc.tables.setDefaultStyle': 'set_table_default_style',
  'doc.tables.clearDefaultStyle': 'clear_table_default_style',
  'doc.history.get': 'get_history',
  'doc.history.undo': 'undo',
  'doc.history.redo': 'redo',
} as const satisfies Record<DocBackedCliOpId, string>;

// ---------------------------------------------------------------------------
// Load inputs
// ---------------------------------------------------------------------------

function loadDocApiContract(): {
  contractVersion: string;
  $defs?: Record<string, unknown>;
  operations: Record<string, Record<string, unknown>>;
} {
  const raw = readFileSync(CONTRACT_JSON_PATH, 'utf-8');
  return JSON.parse(raw);
}

function loadCliPackage(): { name: string; version: string } {
  const raw = readFileSync(CLI_PKG_PATH, 'utf-8');
  return JSON.parse(raw);
}

// ---------------------------------------------------------------------------
// Build contract
// ---------------------------------------------------------------------------

function buildSdkContract() {
  const docApiContract = loadDocApiContract();
  const cliPkg = loadCliPackage();

  const sourceHash = createHash('sha256').update(JSON.stringify(docApiContract)).digest('hex').slice(0, 16);

  const operations: Record<string, unknown> = {};

  for (const cliOpId of CLI_OPERATION_IDS) {
    const metadata = CLI_OPERATION_METADATA[cliOpId];
    const docApiId = toDocApiId(cliOpId);
    const stripped = cliOpId.slice(4) as CliOnlyOperation;

    // Resolve intentName: doc-backed from INTENT_NAMES, CLI-only from definitions
    const cliOnlyDef = docApiId ? null : CLI_ONLY_OPERATION_DEFINITIONS[stripped];
    const intentName = docApiId ? INTENT_NAMES[cliOpId as DocBackedCliOpId] : cliOnlyDef!.intentName;
    if (!intentName) {
      throw new Error(`Missing intentName for ${cliOpId}`);
    }

    // Base fields shared by all operations
    const entry: Record<string, unknown> = {
      operationId: cliOpId,
      command: metadata.command,
      commandTokens: [...cliCommandTokens(cliOpId)],
      category: cliCategory(cliOpId),
      description: cliDescription(cliOpId),
      requiresDocumentContext: cliRequiresDocumentContext(cliOpId),
      docRequirement: metadata.docRequirement,
      intentName,

      // Transport plane
      params: metadata.params.map((p) => {
        const spec: Record<string, unknown> = {
          name: p.name,
          kind: p.kind,
          type: p.type,
        };
        if (p.flag && p.flag !== p.name) spec.flag = p.flag;
        if (p.required) spec.required = true;
        if (p.schema) spec.schema = p.schema;
        if (p.agentVisible === false) spec.agentVisible = false;
        return spec;
      }),
      constraints: metadata.constraints ?? null,
    };

    if (docApiId) {
      // Doc-backed operation — metadata from COMMAND_CATALOG
      const catalog = COMMAND_CATALOG[docApiId];
      entry.mutates = catalog.mutates;
      entry.idempotency = catalog.idempotency;
      entry.supportsTrackedMode = catalog.supportsTrackedMode;
      entry.supportsDryRun = catalog.supportsDryRun;

      // Schema plane from document-api-contract.json
      const docOp = docApiContract.operations[docApiId];
      if (!docOp) {
        throw new Error(`Missing document-api contract entry for ${docApiId}`);
      }
      entry.inputSchema = docOp.inputSchema;
      entry.outputSchema = docOp.outputSchema;
      if (docOp.successSchema) entry.successSchema = docOp.successSchema;
      if (docOp.failureSchema) entry.failureSchema = docOp.failureSchema;
    } else {
      // CLI-only operation — metadata from canonical definitions
      const def = cliOnlyDef!;
      entry.mutates = def.sdkMetadata.mutates;
      entry.idempotency = def.sdkMetadata.idempotency;
      entry.supportsTrackedMode = def.sdkMetadata.supportsTrackedMode;
      entry.supportsDryRun = def.sdkMetadata.supportsDryRun;
      entry.outputSchema = def.outputSchema;
    }

    // Invariant: every operation must have outputSchema
    if (!entry.outputSchema) {
      throw new Error(`Operation ${cliOpId} is missing outputSchema — contract export bug.`);
    }

    operations[cliOpId] = entry;
  }

  return {
    contractVersion: docApiContract.contractVersion,
    sourceHash,
    ...(docApiContract.$defs ? { $defs: docApiContract.$defs } : {}),
    cli: {
      package: cliPkg.name,
      // Envelope meta.version is contract-version-based today, so minVersion must match that domain.
      minVersion: docApiContract.contractVersion,
    },
    protocol: {
      version: HOST_PROTOCOL_VERSION,
      transport: 'stdio',
      features: [...HOST_PROTOCOL_FEATURES],
      notifications: [...HOST_PROTOCOL_NOTIFICATIONS],
    },
    operations,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const isCheck = process.argv.includes('--check');
  const contract = buildSdkContract();
  const json = JSON.stringify(contract, null, 2) + '\n';

  if (isCheck) {
    let existing: string;
    try {
      existing = readFileSync(OUTPUT_PATH, 'utf-8');
    } catch (error) {
      const fsError = error as NodeJS.ErrnoException;
      if (fsError?.code === 'ENOENT') {
        console.error(`--check: ${OUTPUT_PATH} does not exist. Run without --check to generate.`);
        process.exit(1);
      }
      throw error;
    }

    if (existing === json) {
      console.log('sdk-contract.json is up to date.');
      process.exit(0);
    }

    // Write to temp for diff
    const tmpPath = resolve(tmpdir(), 'sdk-contract-check.json');
    writeFileSync(tmpPath, json);
    console.error(`--check: sdk-contract.json is stale.`);
    console.error(`  Committed: ${OUTPUT_PATH}`);
    console.error(`  Generated: ${tmpPath}`);
    console.error(`  Run without --check to regenerate.`);
    process.exit(1);
  }

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, json);

  const opCount = Object.keys(contract.operations).length;
  console.log(`Wrote ${OUTPUT_PATH} (${opCount} operations)`);
}

main();
