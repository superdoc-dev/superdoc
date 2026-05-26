import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BoundDocApi } from './generated/client.js';
import type { InvokeOptions } from './runtime/process.js';
import { SuperDocCliError } from './runtime/errors.js';
import { dispatchIntentTool } from './generated/intent-dispatch.generated.js';
import {
  dispatchWorkflowPocTool,
  isWorkflowPocToolName,
  listWorkflowPocTools,
  WORKFLOW_POC_TOOL_NAMES,
  WORKFLOW_POC_MCP_PROMPT,
  WORKFLOW_POC_SYSTEM_PROMPT,
  type WorkflowPocToolName,
} from './workflow-poc/index.js';
import { AGENT_TOOL_DEFINITIONS, isAgentToolName, listAgentTools, type AgentToolName } from './agent/catalog.js';
import { agentApply, agentInspect, agentOperation, agentVerify, type AgentReceipt } from './agent/runtime.js';
import { agentRecipe } from './agent/recipes.js';
import { TOOL_PROFILE_CONFIG, type ToolsetProfile } from './tool-capabilities.js';
export {
  BENCHMARK_PROFILES,
  EXPERIMENTAL_PROFILES,
  PRODUCT_AGENT_TOOL_NAMES,
  PRODUCT_DEFAULT_PROFILE,
  resolveBenchmarkToolsetProfile,
  resolveProductToolsetProfile,
  TOOL_CAPABILITY_MANIFEST,
  TOOL_PROFILE_CONFIG,
} from './tool-capabilities.js';
export type {
  ProductCapability,
  ProductToolsetProfileDecision,
  ToolCapabilityManifestEntry,
  ToolProfileConfig,
  ToolsetProfile,
} from './tool-capabilities.js';

export type ToolProvider = 'openai' | 'anthropic' | 'vercel' | 'generic';
export type ToolDispatchOptions = InvokeOptions & {
  profile?: ToolsetProfile;
  toolsetProfile?: ToolsetProfile;
};

// Resolve tools directory relative to package root (works from both src/ and dist/)
const toolsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'tools');
const providerFileByName: Record<ToolProvider, string> = {
  openai: 'tools.openai.json',
  anthropic: 'tools.anthropic.json',
  vercel: 'tools.vercel.json',
  generic: 'tools.generic.json',
};

const HYBRID_MACRO_FIRST_SYSTEM_HEADER = `You are a document editing assistant running the hybrid-macro-first profile.

Correctness is the first priority. Use workflow macro tools when a request maps cleanly to one of them, because they bundle target resolution, execution, and verification. If a macro does not exactly cover the request, fall back to the legacy SuperDoc tools instead of refusing. Prefer one deterministic read, one atomic mutation batch, and one verification read over repeated speculative edit loops.
For long-document summary or risk-summary tasks, use one compact workflow context overview with semantic/risk snippets, then write the requested summary; do not scan heading-by-heading unless the overview has no relevant snippets.
For ordinal targets, use superdoc_context selectors such as paragraphOrdinal/bodyParagraphOrdinal/tableOrdinal instead of guessing refs. If the user says "first paragraph" or "second paragraph" without narrowing the scope, interpret that as visible document paragraphs from the top of the document, including title/date paragraphs, not the first legal clause or first party paragraph. Do not ask permission or switch targets just because the target is short; make the smallest same-meaning tracked rewrite requested.
When rewriting a short title-like paragraph, preserve its key nouns/identifiers in the replacement text; do not use vague wording like "same meaning as before."
Preserve user-provided sentinel words exactly as written, including lowercase/case, especially quoted words; do not uppercase them just because the target paragraph is uppercase. If a required quoted word is lowercase, place it mid-sentence so it remains lowercase.
For multi-replacement text tasks, prefer one case-insensitive replace_all/text-transform batch unless the user explicitly says exact case.
For top/contract/effective date replacement when the old date is not provided, use replace_all with find:"date" and the requested date; the workflow resolves that descriptor to the first date-like value near the top of the document.
For section reorder tasks such as "move section 3 before section 2", call superdoc_structure_insert with action:"move_section", sourceSection, destinationSection, position, and bottomNote when requested. Do not emulate section moves with generic text inserts/deletes.
For long-form generation/insertion tasks, insert the requested markdown/content once and stop unless the user explicitly asks for detailed styling; do not spend budget formatting every generated paragraph.
For new numbered/bulleted list creation, prefer superdoc_list_transform action append_new_list with kind ordered/bullet and items containing only the list item strings. If a heading belongs immediately above the list, include headingText and headingLevel; do not create paragraphs then convert them with legacy list tools.
For heading-plus-body insertion requests, prefer superdoc_structure_insert action insert_paragraphs with texts in final order instead of separate paragraph calls; include headingLevel when the user asks for Heading 1-6/Heading N.
For tracked paragraph or heading additions, include changeMode:"tracked" on superdoc_structure_insert.
For tab-indented heading edits, replace only the visible heading text with a text-transform replace_all/edit and preserve the paragraph's existing tab node; do not rewrite the entire paragraph/block, because that can delete <w:tab/>.
For table background/shading requests, prefer superdoc_table_transform action set_shading with a tableOrdinal target. For table creation, row insertion, column insertion, or cell population, prefer superdoc_table_transform with cellTexts.
For color requests targeting a specific paragraph, heading, or list item by ordinal, prefer superdoc_style_clone action apply_color_to_target.
For template placeholders such as [insert], prefer superdoc_text_transform fill_placeholders with explicit values/fields.`;

const PRODUCT_SYSTEM_PROMPT = `You are a document editing assistant running the clean product profile.

Available tools (use them in this priority order):
1. agent_recipe — high-level deterministic document edits with flat product-facing arguments. Prefer this for almost every edit.
2. agent_inspect — read-only deterministic document snapshot. Keep it narrow: use countsOnly:true for pure counts, includeDomains:["comments"] or ["trackedChanges"] for review inventory, includeDomains:["blocks","tables"] for table targeting, and blockNodeTypes when only paragraph/heading/listItem blocks matter.
3. agent_apply — explicit inspect/select/apply/verify IR plan when a recipe does not cover the case.
4. agent_verify — explicit verification against the current document state (with optional save/reopen).
5. agent_operation — controlled escape hatch dispatching one exact generated doc.* operation by id. Last resort.

Recipe mappings (use agent_recipe with these recipe names and flat args):
- Append one paragraph at the end: recipe "insert_paragraph", text. Add changeMode:"tracked" when the user asks for tracked changes. Skip placement to default to document end. Use placement:{at:"after",selector:{kind:"ordinal",ordinalKind:"paragraphOrdinal",value:N}} to position after the Nth paragraph.
- Append several paragraphs or a heading-plus-body block: recipe "insert_paragraphs", texts (in final order). Set headingLevel when the first item should be a heading (1-6). For tracked changes, set changeMode:"tracked".
- Insert a single heading: recipe "insert_heading", text, level (1-6).
- Append a numbered or bulleted list at the end: recipe "append_list", items (string array), kind:"ordered"|"bullet". Add headingText and headingLevel only when the user asks for a heading immediately above the list.
- Add items to an existing list or to the apparent list at the end of the document: recipe "insert_list_items", items, optional listOrdinal (1-based). If the user says to add to an existing list and list inventory is unknown or no real list is visible yet, omit listOrdinal and let the recipe auto-target the safest existing continuation. Do not synthesize loose paragraphs for list additions.
- Replace or fix text everywhere: recipe "replace_text", edits:[{find,replace}], caseSensitive default false. To keep several replacements inside one inspected paragraph or heading, add selector and scope the replacements to that single block. Use changeMode:"tracked" if asked.
- Delete every occurrence of text or characters: recipe "delete_text", finds:[string].
- Change the date near the top of the document when the user only gives the new date: recipe "replace_top_date", date:"19 May 2026". Prefer this over a separate inspect+replace sequence for top-of-document date edits.
- Rewrite one specific paragraph or heading: recipe "rewrite_block", selector, text. When the request is anchored to an existing paragraph ("rewrite the first paragraph", "the first paragraph mentioning Lender"), inspect first, gather the current text from the document, and then provide the final rewritten paragraph text. Never ask the user to paste text that is already present in the document.
- Add a small table: recipe "create_table", rows, columns, optional cellTexts (2D array), placement defaults to document end.
- Comment every body paragraph: recipe "comment_paragraphs", commentText. When the user excludes block quotes, set excludeBlockQuotes:true.
- Comment one specific paragraph: recipe "add_comment", commentText, selector.
- Accept all tracked changes: recipe "accept_tracked_changes". If the user names a reviewer, set author:"Full Name". For rejection: recipe "reject_tracked_changes" with optional author. The recipe lists changes via doc.trackChanges.list and decides via doc.trackChanges.decide.
- Normalize body font size (every body paragraph/list item to N pt): recipe "normalize_body_font_size", fontSize:N. Use changeMode:"tracked" only if explicitly asked; default direct preserves existing tracked changes.
- Color a substring everywhere it appears in body text: recipe "color_text", color (named or hex), targetText. Add caseSensitive:true if exact case is required. To color one specific paragraph/heading/listItem: recipe "color_text", color, selector (ordinal). To color a substring inside one specific block: recipe "color_text", color, targetText, selector.
- Apply letter-spacing to a specific heading/paragraph/list item: recipe "apply_letter_spacing", selector, letterSpacing (points).
- Fill template placeholders such as [insert]: recipe "fill_placeholders", values:[...] and/or fields:[{label?,value}]. Use the provided values directly; do not leave placeholders behind.
- Move a numbered heading-defined section: recipe "move_section", sourceSection, destinationSection, position:"before"|"after", optional bottomNote. Use this for requests like "move section 3 before section 2"; do not emulate with generic copy/delete plans.
- Insert a table of contents: recipe "insert_toc", title (optional heading above the TOC), placement (defaults to document_start).
- Insert an image with a caption: recipe "insert_image_with_caption", src, optional alt and caption, optional width and height, optional sectionBreakBefore:true, placement (defaults to document_end). If the image is attached and no explicit source string is given, use src:"attached".
- Set a background/shading color on a table: recipe "set_table_shading", color, optional tableOrdinal (defaults to the first table).
- Insert a row into an existing table: recipe "insert_table_row", tableOrdinal (1-based), rowIndex (0-based; omit to append at bottom), position:"above"|"below" (or before/after synonyms), optional cellTexts:[string per column]. If the user wants a preview only or says not to save the change yet, set dryRun:true and do not claim the document was updated.
- Insert a column into an existing table: recipe "insert_table_column", tableOrdinal, columnIndex (0-based; omit to append on the right), position:"left"|"right" (default right), optional headerText for the new column header row.
- Delete a row or column: recipe "delete_table_row" (rowIndex required) or "delete_table_column" (columnIndex required), tableOrdinal optional.
- Split a table after a row: recipe "split_table", tableOrdinal, rowIndex (>=1), optional separatorText to insert a paragraph between the two halves.

Selector shapes:
- {kind:"nodeId", nodeId}
- {kind:"ordinal", ordinalKind:"bodyParagraphOrdinal"|"paragraphOrdinal"|"headingOrdinal"|"tableOrdinal"|"listOrdinal"|"sectionOrdinal"|"blockOrdinal", value:N}
- {kind:"tableCell", tableOrdinal:N, rowIndex:R, columnIndex:C}
- {kind:"textSearch", terms:["term one","term two"], match:"all"|"any", occurrence:N, caseSensitive?:false, nodeTypes?:["paragraph"|"heading"|"listItem"]}
- {kind:"placement", at:"document_end"|"document_start"}
- {kind:"relative", position:"after"|"before", target: selector}

Default workflow:
1. If the request maps to a recipe, call agent_recipe directly with flat args — it returns verified pre/post evidence. Do not call agent_inspect first unless you need a specific nodeId or counts.
2. If a recipe is not a fit, call the smallest useful agent_inspect first, then either build an agent_apply plan or call agent_operation with the exact generated doc.* operation id.
3. After a successful recipe or agent_apply receipt, stop. The receipt's verification field is the proof. Keep the final answer to one short sentence unless the user explicitly asks for more detail.

Rules:
- Never rely on benchmark routing, eval metadata, fixture names, or hidden task shortcuts.
- Do not include doc or sessionId in any tool args.
- Prefer the smallest deterministic call that can be verified. Recipes are preferred over IR plans, IR plans over single doc.* operations.
- paragraphOrdinal counts visible non-empty paragraphs. bodyParagraphOrdinal counts substantive body paragraphs after leading heading/title metadata when that structure is identifiable.
- For visible-order instructions like "the first paragraph" or "the second paragraph", prefer paragraphOrdinal. Use bodyParagraphOrdinal only when the request clearly means the first substantive body paragraph after title/front matter.
- For literal ordinal rewrite/simplify requests, do not switch to a different paragraph just because the matched paragraph is short, title-like, or date-like. Rewrite the exact visible paragraph the selector resolves to.
- If a rewrite attempt on a literal ordinal target is a no-op, keep the same target and provide a changed rewrite for that same paragraph instead of moving to another paragraph.
- For anchored paragraph rewrites or multi-term edits, inspect once and target the first block that satisfies the user’s anchor phrase. If several replacements are requested inside one paragraph, use replace_text with a selector and only choose a block whose current text contains every requested find string. Prefer a textSearch selector over manually copying nodeIds when the target is defined by its text.
- When rewriting a short title-like paragraph into plainer English, preserve the key nouns and identifiers from the original text in readable display form (prefer sentence case or Title Case, not all caps or all lowercase).
- For top-date replacements, prefer replace_top_date. If you do inspect for confirmation, do not guess with paragraphOrdinal.
- For section-numbered table clauses or defined terms inside a table, inspect the table cells and use a tableCell selector with replace_text rather than asking the user for the text again.
- For tab-indented or indented-heading edits, inspect first and replace only the visible heading text with replace_text. Do not use rewrite_block for those tasks, because rewriting the whole paragraph can delete the tab node.
- For top-date replacements where the old date is unknown, inspect the top blocks first and replace the actual existing date. Do not waste steps on noop self-replacements.
- For pure count questions, use agent_inspect with countsOnly:true and stop. Do not fetch full blocks.
- When you only need one domain, pass includeDomains so the snapshot stays small.
- For preview-only table edits, pass dryRun:true on the table recipe. The document must remain unchanged, and the final answer should describe the preview rather than saying the edit was applied.
- If a selector is ambiguous, stop and ask for clarification rather than guessing.
- If the clean runtime cannot express the request safely, explain the missing capability instead of faking success.`;

const PRIMITIVE_V2_SYSTEM_HEADER = `You are a document editing assistant running the primitive-v2 profile.

This profile intentionally exposes a small primitive surface. Read the document structure, compile the requested change into explicit selectors, then execute writes through superdoc_mutations whenever possible. Avoid single-purpose editing loops; if the primitive surface cannot express the task, say exactly which missing operation blocked the edit.`;

const COMPILER_SYSTEM_HEADER = `You are a document editing assistant running the compiler profile.

Treat every task as a compile-and-execute problem: inspect enough structure to build a deterministic plan, execute the largest safe batch available, then verify the final document state. Prefer superdoc_mutations for general edits and workflow macros for high-level list, table, structure, media, comment, style, section move, or repeated-text transforms. Use paragraphOrdinal/bodyParagraphOrdinal/tableOrdinal selectors for ordinal instructions, move_section for section reorder instructions, table set_shading for background color, table cellTexts when table content is required, apply_color_to_target for ordinal color requests, and fill_placeholders for template placeholders.`;

const BENCHMARK_V2_SYSTEM_PROMPT = `You are a compact DOCX editing agent running the benchmark-v2 profile.

Use superdoc_do for edits whenever possible. It compiles the request, runs deterministic SuperDoc workflow operations, and verifies the result. After superdoc_do returns success, stop; do not perform extra reads just to reassure yourself.

Use these action mappings:
- Append one paragraph: action "insert_paragraph", text, changeMode when tracked changes are requested.
- Insert after/before a heading or paragraph: action "insert_paragraph", text, placement:{position:"after",target:{by:"headingOrdinal",value:N}} or placement:{position:"after",target:{by:"paragraphOrdinal",value:N}}.
- Append several paragraphs or a heading plus body: action "insert_paragraphs", texts in final order, headingLevel when the first item is a real heading.
- Write a structured memo or long-form document with named sections: action "insert_heading_sections", sections:[{heading,paragraphs:[p1,p2]}], headingLevel:1. Generate the requested substantive paragraphs in the tool arguments and do not call other tools first.
- Tracked heading at document end: action "insert_paragraphs", texts with the heading text, headingLevel:1, changeMode:"tracked".
- Replace or delete repeated text: action "replace_all" or "delete_all", edits:[{find,replace}], caseSensitive:false unless exact case is required.
- Change the top/contract/effective date when the existing date is unknown: action "replace_all", edits:[{find:"date",replace:"Requested date"}], preserveStyle:true.
- Change a tab-indented/descriptor-named heading when exact source text is unknown: action "replace_all", edits:[{find:"indented heading",replace:"New heading text"}], preserveStyle:true.
- Fill template placeholders: action "fill_placeholders", fields:[{label,value}], changeMode:"tracked" if requested.
- Rewrite an ordinal paragraph: action "rewrite_block", target:{by:"paragraphOrdinal",value:N}, text, changeMode:"tracked" when requested.
- Count paragraphs then append a note: action "count_paragraphs_and_append", textTemplate with {count}.
- Add a generated summary at the top: call superdoc_context first for risk/summary snippets, then action "insert_summary_at_top" with headingText and summary.
- Summarize document comments: action "comment_summary_at_top", headingText exactly as requested. Do not call legacy comment list first.
- Add list items to an existing list: action "insert_list_items", target:{by:"listOrdinal",value:1}, texts/items, kind, changeMode when tracked.
- Add a new list at document end: action "append_list", texts/items, kind, headingText if needed, changeMode when tracked.
- Color words throughout the document: action "color_texts", colors:[{text,color}], using plain color names or hex.
- Color an ordinal paragraph/heading/list item: action "color_texts", target:{by:"paragraphOrdinal",value:N}, color.
- Apply letter spacing to a heading/paragraph/list item: action "apply_letter_spacing", target:{by:"headingOrdinal",value:N}, letterSpacing in points.
- Normalize body text font size: action "normalize_body_font_size", fontSize in points. This preserves existing tracked changes by using direct body-block formatting.
- Move sections: action "move_section", sourceSection, destinationSection, position, bottomNote when requested.
- Table edits: action "table", tableAction, target:{by:"tableOrdinal",value:N}, plus row/column/cell/color arguments. For create_table cellTexts, prefer a 2D string array such as [["Header",""],["",""],["",""]].
- Insert a TOC: action "insert_toc", title when requested.
- Insert an attached image with a caption: action "insert_image_with_caption", caption; if the request asks for a section break first, set sectionBreakBefore:true.
- Comment every eligible paragraph: action "comment_pass", commentText; set excludeBlockQuotes:true when block quotes are excluded.
- Accept or reject tracked changes: action "track_changes", trackAction:"accept_all" or "reject_all", scope:"all". If the request names one reviewer/author, use scope:"author", author:"Full Name".

Only call superdoc_context when you need unknown document facts, such as paragraph counts, section/table/list ordinals, or summary evidence. Prefer one context call followed by one superdoc_do call. If a task is outside superdoc_do's schema, use the smallest available context read and then explain the missing operation.`;

const MACRO_STRUCTURE_SYSTEM_PROMPT = `You are a compact DOCX editing agent running the macro-structure profile.

Available tools: superdoc_context, superdoc_structure_insert, superdoc_list_transform.
Use the smallest exact macro call and stop after a successful receipt. Call superdoc_context only when a selector or ordinal is unknown.

Mappings:
- New numbered or bulleted list: call superdoc_list_transform with action "append_new_list", kind, items, and optional headingText/headingLevel.
- Add list items to an existing list: call superdoc_list_transform with action "insert_many"; omit target if list inventory is unknown.
- Insert headings, sections, paragraph batches, section breaks, section moves, or a table of contents: call superdoc_structure_insert.
- Preserve a template heading style by inserting the requested heading/body with superdoc_structure_insert; do not fall back to broad legacy tools.`;

const MACRO_TABLE_SYSTEM_PROMPT = `You are a compact DOCX editing agent running the macro-table profile.

Available tools: superdoc_context, superdoc_text_transform, superdoc_table_transform.
Use the table macro for structural table edits and text-transform for exact table-adjacent text replacement. Call superdoc_context only when table ordinal, row ordinal, or target context is unknown.

Mappings:
- Insert, preview, split, shade, or create tables: call superdoc_table_transform with the requested action.
- For bottom-row requests where the exact row count is unknown, use the requested target table and let the table macro clamp/resolve the row.
- Replace defined terms or exact text in table-adjacent sections: call superdoc_text_transform once with caseSensitive false unless exact case is required.
- Do not use headingOrdinal to resolve legal section numbers like "section 1.2" or "section 2.4"; those are often table cells, not headings. If the source term is quoted or unique, skip context and replace that exact text directly.`;

const MACRO_COMMENTS_SYSTEM_PROMPT = `You are a compact DOCX editing agent running the macro-comments profile.

Available tools: superdoc_context, superdoc_comment_pass, superdoc_comment_transform, superdoc_text_transform.
Use superdoc_comment_transform for comment summaries and semantic risk-clause comment review. For high-liability or risk-clause review, call superdoc_comment_transform with action "comment_risk_clauses", text/commentText, criteria, side when known, minComments if the user gives a minimum, and stop after success. For deterministic paragraph-wide comments, call superdoc_comment_pass or superdoc_comment_transform with action "comment_paragraphs".`;

const MACRO_FORMAT_SYSTEM_PROMPT = `You are a compact DOCX editing agent running the macro-format profile.

Available tools: superdoc_context, superdoc_format_transform, superdoc_table_transform.
Use superdoc_format_transform for color_texts, apply_letter_spacing, and normalize_body_font_size. Use table_transform only for table shading. Call superdoc_context only when target ordinal or table ordinal is unknown. Stop after the verified formatting receipt succeeds.`;

const MACRO_SECTION_SYSTEM_PROMPT = `You are a compact DOCX editing agent running the macro-section profile.

Available tools: superdoc_context, superdoc_section_transform.
For requests like "move section 3 before section 2" or "move section 3 after section 1", call superdoc_section_transform with sourceSection, destinationSection, position, and bottomNote if the user asks for a bottom note. Do not emulate section moves with text insertion or deletion. Stop after the verified section receipt succeeds.`;

const MACRO_MEDIA_SYSTEM_PROMPT = `You are a compact DOCX editing agent running the macro-media profile.

Available tools: superdoc_context, superdoc_media_insert, superdoc_structure_insert.
For image insertion, call superdoc_media_insert with action "insert_image_with_caption" and the requested caption. If the task asks for a section break before the image, include that in the media action when supported or call superdoc_structure_insert first for a single section break. Stop after the media receipt succeeds.`;

const PROFILE_SYSTEM_HEADERS: Partial<Record<ToolsetProfile, string>> = {
  'hybrid-macro-first': HYBRID_MACRO_FIRST_SYSTEM_HEADER,
  'primitive-v2': PRIMITIVE_V2_SYSTEM_HEADER,
  compiler: COMPILER_SYSTEM_HEADER,
};

const PROFILE_SYSTEM_PROMPTS: Partial<Record<ToolsetProfile, string>> = {
  product: PRODUCT_SYSTEM_PROMPT,
  'benchmark-v2': BENCHMARK_V2_SYSTEM_PROMPT,
  'macro-structure': MACRO_STRUCTURE_SYSTEM_PROMPT,
  'macro-table': MACRO_TABLE_SYSTEM_PROMPT,
  'macro-comments': MACRO_COMMENTS_SYSTEM_PROMPT,
  'macro-format': MACRO_FORMAT_SYSTEM_PROMPT,
  'macro-media': MACRO_MEDIA_SYSTEM_PROMPT,
  'macro-section': MACRO_SECTION_SYSTEM_PROMPT,
};

const HYBRID_MACRO_FIRST_MCP_HEADER = `Use hybrid-macro-first mode: macro tools first when exact, legacy fallback when needed, correctness over fewer calls.`;
const PRODUCT_MCP_PROMPT = `Use the clean product mode: expose agent_inspect, agent_recipe, agent_apply, agent_verify, and agent_operation. Prefer agent_recipe for most edits. Available recipes: insert_paragraph, insert_paragraphs, insert_heading, replace_text, delete_text, replace_top_date, append_list, insert_list_items, create_table, comment_paragraphs, add_comment, rewrite_block, accept_tracked_changes, reject_tracked_changes, normalize_body_font_size, color_text, apply_letter_spacing, fill_placeholders, move_section, insert_toc, insert_image_with_caption, set_table_shading, insert_table_row, insert_table_column, delete_table_row, delete_table_column, split_table. Use paragraphOrdinal for visible-order paragraph instructions, use bodyParagraphOrdinal only when front matter should be skipped, use textSearch selectors for blocks defined by their text, use tableCell selectors for inspected table-cell text, inspect before anchored rewrites, prefer replace_top_date for top-of-document date edits, keep literal ordinal rewrites on the exact matched paragraph even when it is short/title/date-like, use dryRun:true for preview-only table edits, and never ask the user to provide text that already exists in the document. Keep inspect calls narrow: countsOnly:true for counts, includeDomains for domain-specific reads, blockNodeTypes for block-only targeting. Use agent_apply for IR plans that recipes do not cover. Use agent_operation only as the exact generated-operation escape hatch. Never depend on benchmark-only routing or eval metadata.`;
const PRIMITIVE_V2_MCP_HEADER = `Use primitive-v2 mode: read structure, compile selectors, apply atomic mutations, and report missing primitive coverage precisely.`;
const COMPILER_MCP_HEADER = `Use compiler mode: inspect, plan, execute the largest safe deterministic batch, and verify final state.`;
const BENCHMARK_V2_MCP_PROMPT = `Use benchmark-v2 mode: prefer one superdoc_do edit call, use superdoc_context only when unknown document facts are required, and stop after a successful verified edit.`;
const MACRO_STRUCTURE_MCP_PROMPT = `Use macro-structure mode: expose only context, structure, and list macros. Prefer one exact macro call and stop after success.`;
const MACRO_TABLE_MCP_PROMPT = `Use macro-table mode: expose only context, text-transform, and table-transform macros. Use the table macro for table operations and text-transform for table-adjacent replacements.`;
const MACRO_COMMENTS_MCP_PROMPT = `Use macro-comments mode: expose only context, comment-pass, comment-transform, and text-transform macros. Use comment_transform for summaries and risk-clause review.`;
const MACRO_FORMAT_MCP_PROMPT = `Use macro-format mode: expose only context, format-transform, and table-transform macros. Use the smallest verified formatting macro.`;
const MACRO_MEDIA_MCP_PROMPT = `Use macro-media mode: expose only context, media insertion, and structure insertion. Use the media macro for images with captions.`;
const MACRO_SECTION_MCP_PROMPT = `Use macro-section mode: expose only context and section-transform. Use one verified section move call.`;

const PROFILE_MCP_HEADERS: Partial<Record<ToolsetProfile, string>> = {
  'hybrid-macro-first': HYBRID_MACRO_FIRST_MCP_HEADER,
  'primitive-v2': PRIMITIVE_V2_MCP_HEADER,
  compiler: COMPILER_MCP_HEADER,
};

const PROFILE_MCP_PROMPTS: Partial<Record<ToolsetProfile, string>> = {
  product: PRODUCT_MCP_PROMPT,
  'benchmark-v2': BENCHMARK_V2_MCP_PROMPT,
  'macro-structure': MACRO_STRUCTURE_MCP_PROMPT,
  'macro-table': MACRO_TABLE_MCP_PROMPT,
  'macro-comments': MACRO_COMMENTS_MCP_PROMPT,
  'macro-format': MACRO_FORMAT_MCP_PROMPT,
  'macro-media': MACRO_MEDIA_MCP_PROMPT,
  'macro-section': MACRO_SECTION_MCP_PROMPT,
};

export type ToolCatalog = {
  contractVersion: string;
  generatedAt: string | null;
  toolCount: number;
  tools: ToolCatalogEntry[];
};

type OperationEntry = {
  operationId: string;
  intentAction: string;
  required?: string[];
  requiredOneOf?: string[][];
};

type ToolCatalogEntry = {
  toolName: string;
  description: string;
  inputSchema: Record<string, unknown>;
  mutates: boolean;
  operations: OperationEntry[];
};

const STRIP_EMPTY_OPTIONAL_ARGS = new Set(['parentId', 'parentCommentId', 'id', 'status']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

function isObviouslyCorruptedToolArgKey(key: string): boolean {
  const trimmed = key.trim();
  return trimmed.length === 0 || !/[\p{L}\p{N}]/u.test(trimmed);
}

function stripCorruptedToolArgKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stripCorruptedToolArgKeys(item));
  }

  if (!isRecord(value)) return value;

  const clean: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(value)) {
    if (isObviouslyCorruptedToolArgKey(key)) continue;
    clean[key] = stripCorruptedToolArgKeys(entryValue);
  }
  return clean;
}

function compactCountMap(counts: Record<string, unknown>): Record<string, number> {
  const compact: Record<string, number> = {};
  for (const [key, value] of Object.entries(counts)) {
    if (typeof value === 'number' && value !== 0) {
      compact[key] = value;
    }
  }
  if (Object.keys(compact).length === 0 && typeof counts.blocks === 'number') {
    compact.blocks = counts.blocks;
  }
  return compact;
}

function pickScalarFields(
  value: unknown,
  keys?: readonly string[],
  limit = 6,
): Record<string, string | number | boolean | null> {
  if (!isRecord(value)) return {};
  const entries = keys
    ? keys.filter((key) => key in value).map((key) => [key, value[key]] as const)
    : Object.entries(value);
  const compact: Record<string, string | number | boolean | null> = {};
  for (const [key, entryValue] of entries) {
    if (
      typeof entryValue === 'string' ||
      typeof entryValue === 'number' ||
      typeof entryValue === 'boolean' ||
      entryValue == null
    ) {
      compact[key] = entryValue ?? null;
    }
    if (Object.keys(compact).length >= limit) break;
  }
  return compact;
}

function compactOperationResult(result: unknown): unknown {
  if (result == null || typeof result === 'string' || typeof result === 'number' || typeof result === 'boolean') {
    return result;
  }
  if (Array.isArray(result)) {
    return { itemCount: result.length };
  }
  if (!isRecord(result)) {
    return { kind: typeof result };
  }

  const compact: Record<string, unknown> = {
    ...pickScalarFields(result, ['success', 'status', 'count', 'total', 'applied', 'created', 'deleted']),
  };

  if (isRecord(result.revision)) {
    const revision = pickScalarFields(result.revision, ['before', 'after', 'current']);
    if (Object.keys(revision).length > 0) {
      compact.revision = revision;
    }
  }

  if (Array.isArray(result.steps)) {
    compact.stepCount = result.steps.length;
    compact.steps = result.steps.slice(0, 4).map((step) => {
      if (!isRecord(step)) return {};
      return pickScalarFields(step, ['stepId', 'op', 'effect', 'matchCount'], 4);
    });
  }

  if (Array.isArray(result.items)) compact.itemCount = result.items.length;
  if (Array.isArray(result.changes)) compact.changeCount = result.changes.length;
  if (Array.isArray(result.matches)) compact.matchCount = result.matches.length;

  if (Object.keys(compact).length === 0) {
    return { kind: 'object' };
  }
  return compact;
}

function compactAgentReceipt(receipt: AgentReceipt): Record<string, unknown> {
  return {
    status: receipt.status,
    intent: receipt.intent,
    preSnapshot: {
      revision: receipt.preSnapshot.revision,
      counts: compactCountMap(receipt.preSnapshot.counts as Record<string, unknown>),
    },
    ...(receipt.postSnapshot
      ? {
          postSnapshot: {
            revision: receipt.postSnapshot.revision,
            counts: compactCountMap(receipt.postSnapshot.counts as Record<string, unknown>),
          },
        }
      : {}),
    selectedTargets: receipt.selectedTargets.map((target) => ({
      selector: target.selector,
      matchedCount: target.matched.length,
    })),
    executedOperations: receipt.executedOperations.map((operation) => ({
      operationId: operation.operationId,
      ...(operation.rationale ? { rationale: operation.rationale } : {}),
      ...(operation.result !== undefined ? { result: compactOperationResult(operation.result) } : {}),
    })),
    verificationPassed: receipt.verification.every((entry) => entry.passed),
    verification: receipt.verification.map((entry) => ({
      check: pickScalarFields(entry.check, undefined, 6),
      passed: entry.passed,
      ...(entry.detail ? { detail: entry.detail } : {}),
    })),
    ...(receipt.saveReopen ? { saveReopen: receipt.saveReopen } : {}),
    ...(receipt.errors ? { errors: receipt.errors } : {}),
  };
}

async function readJson<T>(fileName: string): Promise<T> {
  const filePath = path.join(toolsDir, fileName);
  let raw = '';
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (error) {
    throw new SuperDocCliError('Unable to load packaged tool artifact.', {
      code: 'TOOLS_ASSET_NOT_FOUND',
      details: {
        filePath,
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new SuperDocCliError('Packaged tool artifact is invalid JSON.', {
      code: 'TOOLS_ASSET_INVALID',
      details: {
        filePath,
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

async function loadProviderBundle(provider: ToolProvider): Promise<{
  contractVersion: string;
  tools: unknown[];
}> {
  return readJson(providerFileByName[provider]);
}

async function loadCatalog(): Promise<ToolCatalog> {
  return readJson<ToolCatalog>('catalog.json');
}

export async function getToolCatalog(): Promise<ToolCatalog> {
  return getCachedCatalog();
}

async function loadLegacyTools(provider: ToolProvider): Promise<unknown[]> {
  const bundle = await loadProviderBundle(provider);
  const tools = bundle.tools;
  if (!Array.isArray(tools)) {
    throw new SuperDocCliError('Tool provider bundle is missing tools array.', {
      code: 'TOOLS_ASSET_INVALID',
      details: { provider },
    });
  }
  return tools;
}

function getProviderToolName(tool: unknown): string | undefined {
  if (!isRecord(tool)) return undefined;
  if (typeof tool.name === 'string') return tool.name;

  if (tool.type === 'function' && isRecord(tool.function) && typeof tool.function.name === 'string') {
    return tool.function.name;
  }

  return undefined;
}

function filterProviderTools(tools: unknown[], names: 'all' | readonly string[]): unknown[] {
  if (names === 'all') return tools;
  const byName = new Map<string, unknown>();
  for (const tool of tools) {
    const name = getProviderToolName(tool);
    if (name != null && !byName.has(name)) {
      byName.set(name, tool);
    }
  }
  return names.flatMap((name) => {
    const tool = byName.get(name);
    return tool == null ? [] : [tool];
  });
}

function getWorkflowToolSet(profile: ToolsetProfile): Set<WorkflowPocToolName> {
  const configured = TOOL_PROFILE_CONFIG[profile].workflowTools;
  return new Set(configured === 'all' ? WORKFLOW_POC_TOOL_NAMES : configured);
}

async function listProfileTools(provider: ToolProvider, profile: ToolsetProfile): Promise<unknown[]> {
  const config = TOOL_PROFILE_CONFIG[profile];
  const agentTools = profile === 'product' ? listAgentTools(provider) : [];
  const legacyTools =
    config.legacyTools === 'all' || config.legacyTools.length > 0
      ? filterProviderTools(await loadLegacyTools(provider), config.legacyTools)
      : [];
  const workflowTools =
    config.workflowTools === 'all' || config.workflowTools.length > 0
      ? filterProviderTools(listWorkflowPocTools(provider), config.workflowTools)
      : [];

  return [...agentTools, ...legacyTools, ...workflowTools];
}

export async function listTools(provider: ToolProvider, profile?: ToolsetProfile): Promise<unknown[]> {
  return listProfileTools(provider, resolveToolsetProfile(profile));
}

export type ToolChooserInput = {
  provider: ToolProvider;
  profile?: ToolsetProfile;
  /**
   * When `true`, applies provider-specific prompt-caching markers to the
   * returned tools so subsequent identical requests reuse the cached prefix.
   *
   * Per-provider behavior:
   * - **anthropic**: marks the last tool entry with
   *   `cache_control: { type: "ephemeral" }`. The full tools block becomes
   *   cacheable; cache TTL is ~5 minutes by default.
   * - **openai**: no-op. OpenAI caches prompts ≥ 1024 tokens automatically;
   *   the helper returns tools unchanged but still reports
   *   `cacheStrategy: 'automatic'` so callers can rely on the indicator.
   * - **vercel** / **generic**: pass-through. Caching depends on the
   *   underlying model; reported as `'unsupported'`.
   */
  cache?: boolean;
};

export type CacheStrategy = 'explicit' | 'automatic' | 'unsupported' | 'disabled';

function resolveToolsetProfile(profile?: ToolsetProfile): ToolsetProfile {
  return profile ?? 'legacy';
}

/**
 * Select all intent tools for a specific provider.
 *
 * Returns all intent tools in the requested provider format. Pass
 * `cache: true` to apply provider-specific caching markers (see
 * {@link ToolChooserInput.cache}).
 *
 * @example
 * ```ts
 * // Anthropic — last tool gets cache_control automatically.
 * const { tools, meta } = await chooseTools({ provider: 'anthropic', cache: true });
 *
 * // OpenAI — caching is automatic when prompts exceed 1024 tokens.
 * const { tools } = await chooseTools({ provider: 'openai', cache: true });
 * ```
 */
export async function chooseTools(input: ToolChooserInput): Promise<{
  tools: unknown[];
  meta: {
    provider: ToolProvider;
    profile: ToolsetProfile;
    toolCount: number;
    cacheStrategy: CacheStrategy;
  };
}> {
  const profile = resolveToolsetProfile(input.profile);
  const rawTools = await listProfileTools(input.provider, profile);
  const cacheRequested = input.cache === true;

  const { tools, cacheStrategy } = applyCacheMarkers(rawTools, input.provider, cacheRequested);

  return {
    tools,
    meta: {
      provider: input.provider,
      profile,
      toolCount: tools.length,
      cacheStrategy,
    },
  };
}

/**
 * Apply provider-specific caching markers to the tools array. Mutates a clone,
 * never the input. Anthropic gets an explicit `cache_control` on the last
 * tool; other providers pass through.
 */
function applyCacheMarkers(
  tools: unknown[],
  provider: ToolProvider,
  cacheRequested: boolean,
): { tools: unknown[]; cacheStrategy: CacheStrategy } {
  if (!cacheRequested) {
    return { tools, cacheStrategy: 'disabled' };
  }

  if (provider === 'anthropic') {
    if (tools.length === 0) return { tools, cacheStrategy: 'explicit' };
    // Anthropic: marking the LAST tool with cache_control caches the entire
    // tools block (and everything before it in the request — system prompt
    // first if it also has cache_control). Shallow-spread the last entry so we
    // don't mutate the cached bundle in place.
    const next = tools.slice(0, -1);
    const last = {
      ...(tools[tools.length - 1] as Record<string, unknown>),
      cache_control: { type: 'ephemeral' },
    };
    next.push(last);
    return { tools: next, cacheStrategy: 'explicit' };
  }

  if (provider === 'openai') {
    // OpenAI caches prompts ≥ 1024 tokens automatically. No marker needed,
    // but we still report cacheStrategy:'automatic' so callers can branch on
    // it (e.g. for measurement).
    return { tools, cacheStrategy: 'automatic' };
  }

  // vercel / generic — depends on underlying model.
  return { tools, cacheStrategy: 'unsupported' };
}

function resolveDocApiMethod(
  documentHandle: BoundDocApi,
  operationId: string,
): (args: unknown, options?: InvokeOptions) => Promise<unknown> {
  const tokens = operationId.split('.').slice(1);
  let cursor: unknown = documentHandle;

  for (const token of tokens) {
    if (!isRecord(cursor) || !(token in cursor)) {
      throw new SuperDocCliError(`No SDK doc method found for operation ${operationId}.`, {
        code: 'TOOL_DISPATCH_NOT_FOUND',
        details: { operationId, token },
      });
    }
    cursor = cursor[token];
  }

  if (typeof cursor !== 'function') {
    throw new SuperDocCliError(`Resolved member for ${operationId} is not callable.`, {
      code: 'TOOL_DISPATCH_NOT_FOUND',
      details: { operationId },
    });
  }

  return cursor as (args: unknown, options?: InvokeOptions) => Promise<unknown>;
}

// Cached catalog instance — loaded once per process.
let _catalogCache: ToolCatalog | null = null;

async function getCachedCatalog(): Promise<ToolCatalog> {
  if (_catalogCache == null) {
    _catalogCache = await loadCatalog();
  }
  return _catalogCache;
}

/**
 * Validate tool arguments against the catalog schema.
 *
 * Checks three things in order:
 * 1. No unknown keys (additionalProperties: false in merged schema)
 * 2. All universally-required keys present (merged schema `required`)
 * 3. All action-specific required keys present (per-operation `required`)
 */
function validateToolArgs(toolName: string, args: Record<string, unknown>, tool: ToolCatalogEntry): void {
  const schema = tool.inputSchema;
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const required: string[] = Array.isArray(schema.required) ? (schema.required as string[]) : [];

  // 1. Reject unknown keys
  const knownKeys = new Set(Object.keys(properties));
  const unknownKeys = Object.keys(args).filter((k) => !knownKeys.has(k));
  if (unknownKeys.length > 0) {
    throw new SuperDocCliError(`Unknown argument(s) for ${toolName}: ${unknownKeys.join(', ')}`, {
      code: 'INVALID_ARGUMENT',
      details: { toolName, unknownKeys, knownKeys: [...knownKeys] },
    });
  }

  // 2. Reject missing universally-required keys
  const missingKeys = required.filter((k) => args[k] == null);
  if (missingKeys.length > 0) {
    throw new SuperDocCliError(`Missing required argument(s) for ${toolName}: ${missingKeys.join(', ')}`, {
      code: 'INVALID_ARGUMENT',
      details: { toolName, missingKeys },
    });
  }

  // 3. Reject missing per-operation required keys.
  //    For multi-action tools, resolve the operation by action; for single-op
  //    tools, use the sole operation entry.
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

function validateAgentToolArgs(toolName: AgentToolName, args: Record<string, unknown>): void {
  const definition = AGENT_TOOL_DEFINITIONS.find((entry) => entry.name === toolName);
  if (definition == null) return;
  const schema = definition.inputSchema;
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const required = Array.isArray(schema.required) ? schema.required : [];
  const knownKeys = new Set(Object.keys(properties));
  const unknownKeys = Object.keys(args).filter((key) => !knownKeys.has(key));
  if (unknownKeys.length > 0) {
    throw new SuperDocCliError(`Unknown argument(s) for ${toolName}: ${unknownKeys.join(', ')}`, {
      code: 'INVALID_ARGUMENT',
      details: { toolName, unknownKeys, knownKeys: [...knownKeys] },
    });
  }
  const missingKeys = required.filter((key) => args[key] == null);
  if (missingKeys.length > 0) {
    throw new SuperDocCliError(`Missing required argument(s) for ${toolName}: ${missingKeys.join(', ')}`, {
      code: 'INVALID_ARGUMENT',
      details: { toolName, missingKeys },
    });
  }
}

/**
 * Check per-operation required constraints.
 *
 * Handles two shapes emitted by the codegen:
 *   - `required: string[]`        — all listed keys must be present
 *   - `requiredOneOf: string[][]`  — at least one branch must be fully satisfied
 *     (mirrors JSON Schema `oneOf` with per-branch `required` arrays)
 */
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
      throw new SuperDocCliError(
        `Missing required argument(s) for ${toolName}${actionLabel}: must provide one of: ${options}`,
        {
          code: 'INVALID_ARGUMENT',
          details: { toolName, action, requiredOneOf: op.requiredOneOf },
        },
      );
    }
  } else if (op.required && op.required.length > 0) {
    const missingActionKeys = op.required.filter((k) => args[k] == null);
    if (missingActionKeys.length > 0) {
      throw new SuperDocCliError(
        `Missing required argument(s) for ${toolName}${actionLabel}: ${missingActionKeys.join(', ')}`,
        {
          code: 'INVALID_ARGUMENT',
          details: { toolName, action, missingKeys: missingActionKeys },
        },
      );
    }
  }
}

async function dispatchAgentTool(
  documentHandle: BoundDocApi,
  toolName: AgentToolName,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (toolName) {
    case 'agent_inspect':
      return agentInspect(documentHandle, args);
    case 'agent_apply':
      return compactAgentReceipt(await agentApply(documentHandle, args as Parameters<typeof agentApply>[1]));
    case 'agent_verify':
      return compactAgentReceipt(await agentVerify(documentHandle, args as Parameters<typeof agentVerify>[1]));
    case 'agent_operation':
      return agentOperation(documentHandle, args as Parameters<typeof agentOperation>[1]);
    case 'agent_recipe':
      return compactAgentReceipt(await agentRecipe(documentHandle, args));
  }
  throw new SuperDocCliError(`Unknown agent tool: ${toolName}`, {
    code: 'TOOL_DISPATCH_NOT_FOUND',
    details: { toolName },
  });
}

function splitToolDispatchOptions(options?: ToolDispatchOptions): {
  profile: ToolsetProfile;
  invokeOptions?: InvokeOptions;
} {
  if (options == null) {
    return { profile: 'legacy', invokeOptions: undefined };
  }

  const { profile: rawProfile, toolsetProfile, ...invokeOptions } = options;
  return {
    profile: resolveToolsetProfile(rawProfile ?? toolsetProfile),
    invokeOptions,
  };
}

async function readToolPrompt(fileName: string, label: string): Promise<string> {
  const promptPath = path.join(toolsDir, fileName);
  try {
    return await readFile(promptPath, 'utf8');
  } catch {
    throw new SuperDocCliError(`${label} not found.`, {
      code: 'TOOLS_ASSET_NOT_FOUND',
      details: { filePath: promptPath },
    });
  }
}

/**
 * Dispatch a tool call against a bound document handle.
 *
 * The document handle injects session targeting automatically.
 * Tool arguments should not contain `doc` or `sessionId`.
 */
export async function dispatchSuperDocTool(
  documentHandle: BoundDocApi,
  toolName: string,
  args: Record<string, unknown> = {},
  options?: ToolDispatchOptions,
): Promise<unknown> {
  if (!isRecord(args)) {
    throw new SuperDocCliError(`Tool arguments for ${toolName} must be an object.`, {
      code: 'INVALID_ARGUMENT',
      details: { toolName },
    });
  }

  const sanitizedArgs = stripCorruptedToolArgKeys(args);
  if (!isRecord(sanitizedArgs)) {
    throw new SuperDocCliError(`Tool arguments for ${toolName} must be an object.`, {
      code: 'INVALID_ARGUMENT',
      details: { toolName },
    });
  }

  const { profile, invokeOptions } = splitToolDispatchOptions(options);
  if (isAgentToolName(toolName)) {
    if (profile !== 'product') {
      throw new SuperDocCliError(`Tool ${toolName} is only available in the product profile.`, {
        code: 'TOOL_DISPATCH_NOT_FOUND',
        details: { toolName, profile },
      });
    }
    validateAgentToolArgs(toolName, sanitizedArgs);
    return dispatchAgentTool(documentHandle, toolName, sanitizedArgs);
  }

  const workflowTools = getWorkflowToolSet(profile);
  if (isWorkflowPocToolName(toolName) && workflowTools.has(toolName)) {
    return dispatchWorkflowPocTool(documentHandle, toolName, sanitizedArgs, invokeOptions);
  }

  // Validate against the tool schema before dispatch.
  const catalog = await getCachedCatalog();
  const tool = catalog.tools.find((t) => t.toolName === toolName);
  if (tool == null) {
    throw new SuperDocCliError(`Unknown tool: ${toolName}`, {
      code: 'TOOL_DISPATCH_NOT_FOUND',
      details: { toolName },
    });
  }
  validateToolArgs(toolName, sanitizedArgs, tool);

  // Strip empty strings for known optional ID/enum params that LLMs fill with ""
  // instead of omitting. Only target params where "" is never a valid value.
  const cleanArgs: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(sanitizedArgs)) {
    if (value === '' && STRIP_EMPTY_OPTIONAL_ARGS.has(key)) continue;
    cleanArgs[key] = value;
  }

  return dispatchIntentTool(toolName, cleanArgs, (operationId, input) => {
    const method = resolveDocApiMethod(documentHandle, operationId);
    return method(input, invokeOptions);
  });
}

/**
 * Read the bundled SDK system prompt for intent tools.
 *
 * This prompt includes a persona preamble ("You are a document editing assistant…")
 * suitable for embedded LLM usage (OpenAI, Anthropic, Vercel APIs).
 * For MCP server instructions, use {@link getMcpPrompt} instead.
 */
export async function getSystemPrompt(input: { profile?: ToolsetProfile } = {}): Promise<string> {
  const profile = resolveToolsetProfile(input.profile);
  if (profile === 'workflow-poc') {
    return WORKFLOW_POC_SYSTEM_PROMPT;
  }
  const profilePrompt = PROFILE_SYSTEM_PROMPTS[profile];
  if (profilePrompt != null) {
    return profilePrompt;
  }

  const legacyPrompt = await readToolPrompt('system-prompt.md', 'System prompt');
  const header = PROFILE_SYSTEM_HEADERS[profile];
  return header == null ? legacyPrompt : `${header}\n\n${legacyPrompt}`;
}

/**
 * Read the bundled MCP system prompt for intent tools.
 *
 * This prompt omits the persona preamble and includes session lifecycle
 * instructions (open/save/close) suitable for MCP server `instructions`.
 */
export async function getMcpPrompt(input: { profile?: ToolsetProfile } = {}): Promise<string> {
  const profile = resolveToolsetProfile(input.profile);
  if (profile === 'workflow-poc') {
    return WORKFLOW_POC_MCP_PROMPT;
  }
  const profilePrompt = PROFILE_MCP_PROMPTS[profile];
  if (profilePrompt != null) {
    return profilePrompt;
  }

  const legacyPrompt = await readToolPrompt('system-prompt-mcp.md', 'MCP system prompt');
  const header = PROFILE_MCP_HEADERS[profile];
  return header == null ? legacyPrompt : `${header}\n\n${legacyPrompt}`;
}

// ---------------------------------------------------------------------------
// Provider-aware system prompt (with optional caching markers)
// ---------------------------------------------------------------------------

/**
 * Anthropic content block representation of the system prompt with optional
 * `cache_control` for prompt caching.
 */
export type AnthropicSystemPrompt = Array<{
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}>;

export type SystemPromptForProviderResult =
  | { provider: 'anthropic'; content: AnthropicSystemPrompt; cacheStrategy: CacheStrategy }
  | { provider: 'openai' | 'vercel' | 'generic'; content: string; cacheStrategy: CacheStrategy };

/**
 * Get the system prompt formatted for a specific LLM provider, with optional
 * prompt caching applied.
 *
 * - **anthropic** with `cache: true`: returns a content array with
 *   `cache_control: { type: "ephemeral" }` so the system prompt block is
 *   cached. Pass directly as the `system` parameter on `messages.create()`.
 * - **openai**: returns the prompt as a string. OpenAI caches prompts
 *   ≥ 1024 tokens automatically — `cache: true` is informational only and
 *   sets `cacheStrategy: 'automatic'`.
 * - **vercel** / **generic**: returns the prompt as a string. Caching is
 *   delegated to the underlying model.
 *
 * @example
 * ```ts
 * // Anthropic
 * const sys = await getSystemPromptForProvider({ provider: 'anthropic', cache: true });
 * await client.messages.create({ system: sys.content, tools, messages, model });
 *
 * // OpenAI
 * const sys = await getSystemPromptForProvider({ provider: 'openai', cache: true });
 * messages.unshift({ role: 'system', content: sys.content });
 * ```
 */
export async function getSystemPromptForProvider(input: {
  provider: ToolProvider;
  profile?: ToolsetProfile;
  cache?: boolean;
}): Promise<SystemPromptForProviderResult> {
  const text = await getSystemPrompt({ profile: input.profile });
  const cacheRequested = input.cache === true;

  if (input.provider === 'anthropic') {
    const block: AnthropicSystemPrompt[number] = { type: 'text', text };
    if (cacheRequested) block.cache_control = { type: 'ephemeral' };
    return {
      provider: 'anthropic',
      content: [block],
      cacheStrategy: cacheRequested ? 'explicit' : 'disabled',
    };
  }

  const cacheStrategy: CacheStrategy = !cacheRequested
    ? 'disabled'
    : input.provider === 'openai'
      ? 'automatic'
      : 'unsupported';

  return { provider: input.provider, content: text, cacheStrategy };
}
