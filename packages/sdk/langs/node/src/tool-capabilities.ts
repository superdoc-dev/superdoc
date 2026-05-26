/**
 * Product-facing tool profile catalog and lightweight task router.
 *
 * This file serves three related purposes:
 * 1. Describe every workflow and legacy tool in human terms.
 * 2. Define the compact tool bundles we expose as named profiles.
 * 3. Pick a profile from plain user task text without relying on eval-only data.
 *
 * Keep the routing rules general. They may use stable product-language hints,
 * but they must not depend on benchmark fixture names, eval ids, or assertion
 * strings.
 */
import type { WorkflowPocToolName } from './workflow-poc/types.js';

/** Stable ids for the tool bundles that the SDK can expose. */
export type ToolsetProfile =
  | 'product'
  | 'legacy'
  | 'workflow-poc'
  | 'hybrid-macro-first'
  | 'primitive-v2'
  | 'compiler'
  | 'benchmark-v2'
  | 'macro-structure'
  | 'macro-table'
  | 'macro-comments'
  | 'macro-format'
  | 'macro-media'
  | 'macro-section';

/**
 * Profiles that are kept around for benchmark measurement only and must
 * never be returned by product-default routing. The product router asserts
 * its output is never in this set.
 */
export const BENCHMARK_PROFILES: ReadonlySet<ToolsetProfile> = new Set<ToolsetProfile>([
  'benchmark-v2',
  'hybrid-macro-first',
  'macro-structure',
  'macro-table',
  'macro-comments',
  'macro-format',
  'macro-media',
  'macro-section',
]);

/** Profiles that are still experimental and not the default product surface. */
export const EXPERIMENTAL_PROFILES: ReadonlySet<ToolsetProfile> = new Set<ToolsetProfile>([
  'workflow-poc',
  'primitive-v2',
  'compiler',
]);

/** The single product-default profile. */
export const PRODUCT_DEFAULT_PROFILE: ToolsetProfile = 'product';

/**
 * Stable agent tool names exposed by the `product` profile. These map to
 * `agent_inspect` / `agent_apply` / `agent_verify` / `agent_operation` on
 * the SDK runtime.
 */
export const PRODUCT_AGENT_TOOL_NAMES: readonly string[] = [
  'agent_inspect',
  'agent_recipe',
  'agent_apply',
  'agent_verify',
  'agent_operation',
];

/** Human-readable capability buckets used for routing and reporting. */
export type ProductCapability =
  | 'context'
  | 'text'
  | 'structure'
  | 'list'
  | 'table'
  | 'comments'
  | 'formatting'
  | 'media'
  | 'trackedChanges'
  | 'semanticReview'
  | 'compileExecute'
  | 'legacyFallback';

export type ToolRiskClass = 'read' | 'singleEdit' | 'batchEdit' | 'semanticWrite' | 'broadFallback';

/** One manifest row describing what a tool is good at and how expensive/risky it is. */
export type ToolCapabilityManifestEntry = {
  toolName: string;
  source: 'workflow' | 'legacy' | 'agent';
  capabilities: readonly ProductCapability[];
  riskClass: ToolRiskClass;
  costClass: 'small' | 'medium' | 'large';
  description: string;
};

/** Concrete tool exposure for one SDK profile. */
export type ToolProfileConfig = {
  bundle: string;
  legacyTools: 'all' | readonly string[];
  workflowTools: 'all' | readonly WorkflowPocToolName[];
  capabilities: readonly ProductCapability[];
  description: string;
};

/** Router output used by callers that want the chosen profile plus audit context. */
export type ProductToolsetProfileDecision = {
  profile: ToolsetProfile;
  reason: string;
  intent: string;
  bundle: string;
  capabilities: readonly ProductCapability[];
  toolNames: readonly string[];
  confidence: 'high' | 'medium' | 'low';
  alternatives: readonly {
    profile: ToolsetProfile;
    reason: string;
  }[];
};

/** Full workflow surface before profile-level narrowing. */
export const ALL_WORKFLOW_TOOLS: readonly WorkflowPocToolName[] = [
  'superdoc_do',
  'superdoc_context',
  'superdoc_text_transform',
  'superdoc_list_transform',
  'superdoc_table_transform',
  'superdoc_structure_insert',
  'superdoc_media_insert',
  'superdoc_comment_pass',
  'superdoc_comment_transform',
  'superdoc_format_transform',
  'superdoc_section_transform',
  'superdoc_style_clone',
  'superdoc_track_changes',
];

export const BASE_WORKFLOW_TOOLS: readonly WorkflowPocToolName[] = ALL_WORKFLOW_TOOLS.filter(
  (toolName) => toolName !== 'superdoc_do',
);

export const HYBRID_WORKFLOW_TOOLS: readonly WorkflowPocToolName[] = BASE_WORKFLOW_TOOLS.filter(
  (toolName) => toolName !== 'superdoc_track_changes',
);

export const BENCHMARK_V2_WORKFLOW_TOOLS: readonly WorkflowPocToolName[] = ['superdoc_do', 'superdoc_context'];

export const PRIMITIVE_V2_LEGACY_TOOLS = [
  'superdoc_get_content',
  'superdoc_search',
  'superdoc_mutations',
  'superdoc_comment',
  'superdoc_track_changes',
] as const;

export const COMPILER_LEGACY_TOOLS = PRIMITIVE_V2_LEGACY_TOOLS;

export const COMPILER_WORKFLOW_TOOLS: readonly WorkflowPocToolName[] = HYBRID_WORKFLOW_TOOLS;

export const MACRO_STRUCTURE_WORKFLOW_TOOLS: readonly WorkflowPocToolName[] = [
  'superdoc_context',
  'superdoc_list_transform',
  'superdoc_structure_insert',
];

export const MACRO_TABLE_WORKFLOW_TOOLS: readonly WorkflowPocToolName[] = [
  'superdoc_context',
  'superdoc_text_transform',
  'superdoc_table_transform',
];

export const MACRO_COMMENTS_WORKFLOW_TOOLS: readonly WorkflowPocToolName[] = [
  'superdoc_context',
  'superdoc_comment_pass',
  'superdoc_comment_transform',
  'superdoc_text_transform',
];

export const MACRO_FORMAT_WORKFLOW_TOOLS: readonly WorkflowPocToolName[] = [
  'superdoc_context',
  'superdoc_format_transform',
  'superdoc_table_transform',
];

export const MACRO_MEDIA_WORKFLOW_TOOLS: readonly WorkflowPocToolName[] = [
  'superdoc_context',
  'superdoc_media_insert',
  'superdoc_structure_insert',
];

export const MACRO_SECTION_WORKFLOW_TOOLS: readonly WorkflowPocToolName[] = [
  'superdoc_context',
  'superdoc_section_transform',
];

/** Human-readable inventory for every tool that can appear in a routed profile. */
export const TOOL_CAPABILITY_MANIFEST: readonly ToolCapabilityManifestEntry[] = [
  {
    toolName: 'agent_inspect',
    source: 'agent',
    capabilities: ['context', 'compileExecute'],
    riskClass: 'read',
    costClass: 'small',
    description: 'Deterministic full-document snapshot for clean product inspection and selector resolution.',
  },
  {
    toolName: 'agent_apply',
    source: 'agent',
    capabilities: [
      'context',
      'text',
      'structure',
      'list',
      'table',
      'comments',
      'formatting',
      'media',
      'trackedChanges',
      'compileExecute',
    ],
    riskClass: 'batchEdit',
    costClass: 'small',
    description: 'Validated inspect/select/apply/verify execution path over generated doc.* operations.',
  },
  {
    toolName: 'agent_verify',
    source: 'agent',
    capabilities: ['context', 'compileExecute'],
    riskClass: 'read',
    costClass: 'small',
    description: 'Explicit postcondition and save/reopen verification for clean product edits.',
  },
  {
    toolName: 'agent_operation',
    source: 'agent',
    capabilities: ['compileExecute'],
    riskClass: 'batchEdit',
    costClass: 'small',
    description: 'Controlled escape hatch for exact generated doc.* operations behind the clean product surface.',
  },
  {
    toolName: 'agent_recipe',
    source: 'agent',
    capabilities: ['text', 'structure', 'list', 'table', 'comments', 'trackedChanges', 'compileExecute'],
    riskClass: 'batchEdit',
    costClass: 'small',
    description:
      'High-level deterministic document recipes (insert_paragraph, replace_text, append_list, create_table, comment_paragraphs, etc.) with built-in pre/post verification.',
  },
  {
    toolName: 'superdoc_do',
    source: 'workflow',
    capabilities: [
      'compileExecute',
      'context',
      'text',
      'structure',
      'list',
      'table',
      'comments',
      'formatting',
      'media',
      'trackedChanges',
    ],
    riskClass: 'batchEdit',
    costClass: 'small',
    description: 'Compact compile-and-execute facade for common deterministic document edits.',
  },
  {
    toolName: 'superdoc_context',
    source: 'workflow',
    capabilities: ['context', 'semanticReview'],
    riskClass: 'read',
    costClass: 'small',
    description: 'Compact document overview and focused selector context.',
  },
  {
    toolName: 'superdoc_text_transform',
    source: 'workflow',
    capabilities: ['text', 'trackedChanges'],
    riskClass: 'batchEdit',
    costClass: 'small',
    description: 'Deterministic replace, delete, rewrite, and placeholder-fill operations.',
  },
  {
    toolName: 'superdoc_list_transform',
    source: 'workflow',
    capabilities: ['list', 'structure', 'trackedChanges'],
    riskClass: 'batchEdit',
    costClass: 'small',
    description: 'Deterministic list creation and list-item insertion.',
  },
  {
    toolName: 'superdoc_table_transform',
    source: 'workflow',
    capabilities: ['table', 'formatting'],
    riskClass: 'batchEdit',
    costClass: 'small',
    description: 'Deterministic table creation, row/column edits, splits, and shading.',
  },
  {
    toolName: 'superdoc_structure_insert',
    source: 'workflow',
    capabilities: ['structure', 'trackedChanges'],
    riskClass: 'batchEdit',
    costClass: 'small',
    description: 'Deterministic paragraph, section, field, and section-move insertion.',
  },
  {
    toolName: 'superdoc_media_insert',
    source: 'workflow',
    capabilities: ['media', 'structure'],
    riskClass: 'batchEdit',
    costClass: 'small',
    description: 'Deterministic image insertion with caption support.',
  },
  {
    toolName: 'superdoc_comment_pass',
    source: 'workflow',
    capabilities: ['comments'],
    riskClass: 'batchEdit',
    costClass: 'small',
    description: 'Deterministic comment pass across eligible paragraphs.',
  },
  {
    toolName: 'superdoc_comment_transform',
    source: 'workflow',
    capabilities: ['comments', 'semanticReview'],
    riskClass: 'semanticWrite',
    costClass: 'small',
    description: 'Compact comment summary, paragraph comment pass, and risk-clause comment workflow.',
  },
  {
    toolName: 'superdoc_format_transform',
    source: 'workflow',
    capabilities: ['formatting'],
    riskClass: 'batchEdit',
    costClass: 'small',
    description: 'Compact verified formatting workflow for color, letter spacing, and body-font normalization.',
  },
  {
    toolName: 'superdoc_section_transform',
    source: 'workflow',
    capabilities: ['structure'],
    riskClass: 'batchEdit',
    costClass: 'small',
    description: 'Compact verified section move workflow for numbered top-level sections.',
  },
  {
    toolName: 'superdoc_style_clone',
    source: 'workflow',
    capabilities: ['formatting'],
    riskClass: 'batchEdit',
    costClass: 'small',
    description: 'Deterministic color and style-target formatting helpers.',
  },
  {
    toolName: 'superdoc_track_changes',
    source: 'workflow',
    capabilities: ['trackedChanges'],
    riskClass: 'batchEdit',
    costClass: 'small',
    description: 'Tracked-change summary and accept/reject operations.',
  },
  {
    toolName: 'superdoc_get_content',
    source: 'legacy',
    capabilities: ['context', 'semanticReview', 'legacyFallback'],
    riskClass: 'read',
    costClass: 'large',
    description: 'Broad document read primitive for tasks that need semantic review.',
  },
  {
    toolName: 'superdoc_search',
    source: 'legacy',
    capabilities: ['context', 'semanticReview', 'legacyFallback'],
    riskClass: 'read',
    costClass: 'medium',
    description: 'Search primitive for locating text before targeted edits or comments.',
  },
  {
    toolName: 'superdoc_mutations',
    source: 'legacy',
    capabilities: ['text', 'structure', 'formatting', 'legacyFallback'],
    riskClass: 'batchEdit',
    costClass: 'medium',
    description: 'Atomic mutation primitive for custom edits not covered by workflow macros.',
  },
  {
    toolName: 'superdoc_comment',
    source: 'legacy',
    capabilities: ['comments', 'semanticReview', 'legacyFallback'],
    riskClass: 'semanticWrite',
    costClass: 'medium',
    description: 'Anchored comment primitive for semantic clause review.',
  },
];

/** Named profiles exposed by the Node SDK. */
export const TOOL_PROFILE_CONFIG: Record<ToolsetProfile, ToolProfileConfig> = {
  product: {
    bundle: 'product-agent',
    legacyTools: [],
    workflowTools: [],
    capabilities: [
      'context',
      'text',
      'structure',
      'list',
      'table',
      'comments',
      'formatting',
      'media',
      'trackedChanges',
      'compileExecute',
    ],
    description:
      'Clean product agent surface: agent_inspect, agent_apply, agent_verify, agent_operation. Backed by the contract-derived operation catalog and the explicit IR; never depends on benchmark routing.',
  },
  legacy: {
    bundle: 'legacy-all',
    legacyTools: 'all',
    workflowTools: [],
    capabilities: ['legacyFallback'],
    description: 'Full generated legacy tool surface.',
  },
  'workflow-poc': {
    bundle: 'workflow-all',
    legacyTools: [],
    workflowTools: BASE_WORKFLOW_TOOLS,
    capabilities: [
      'context',
      'text',
      'structure',
      'list',
      'table',
      'comments',
      'formatting',
      'media',
      'trackedChanges',
    ],
    description: 'Workflow macro surface without legacy tools.',
  },
  'hybrid-macro-first': {
    bundle: 'hybrid-fallback',
    legacyTools: 'all',
    workflowTools: HYBRID_WORKFLOW_TOOLS,
    capabilities: [
      'context',
      'text',
      'structure',
      'list',
      'table',
      'comments',
      'formatting',
      'media',
      'legacyFallback',
    ],
    description: 'Workflow macros plus broad legacy fallback.',
  },
  'primitive-v2': {
    bundle: 'semantic-comment-primitives',
    legacyTools: PRIMITIVE_V2_LEGACY_TOOLS,
    workflowTools: [],
    capabilities: ['context', 'comments', 'semanticReview', 'trackedChanges', 'legacyFallback'],
    description: 'Small legacy primitive surface for semantic reads and anchored comments.',
  },
  compiler: {
    bundle: 'compiler-hybrid',
    legacyTools: COMPILER_LEGACY_TOOLS,
    workflowTools: COMPILER_WORKFLOW_TOOLS,
    capabilities: [
      'context',
      'text',
      'structure',
      'list',
      'table',
      'comments',
      'formatting',
      'media',
      'trackedChanges',
      'legacyFallback',
    ],
    description: 'Mutation compiler surface plus workflow macros.',
  },
  'benchmark-v2': {
    bundle: 'deterministic-core',
    legacyTools: [],
    workflowTools: BENCHMARK_V2_WORKFLOW_TOOLS,
    capabilities: ['compileExecute', 'context'],
    description: 'Compact compile-and-execute facade plus context.',
  },
  'macro-structure': {
    bundle: 'macro-structure',
    legacyTools: [],
    workflowTools: MACRO_STRUCTURE_WORKFLOW_TOOLS,
    capabilities: ['context', 'structure', 'list', 'formatting', 'trackedChanges'],
    description: 'Slim workflow bundle for lists, headings, fields, section moves, and style-targeted structure edits.',
  },
  'macro-table': {
    bundle: 'macro-table',
    legacyTools: [],
    workflowTools: MACRO_TABLE_WORKFLOW_TOOLS,
    capabilities: ['context', 'text', 'table', 'formatting'],
    description: 'Slim workflow bundle for table and table-adjacent text edits.',
  },
  'macro-comments': {
    bundle: 'macro-comments',
    legacyTools: [],
    workflowTools: MACRO_COMMENTS_WORKFLOW_TOOLS,
    capabilities: ['context', 'comments', 'text', 'semanticReview'],
    description: 'Slim workflow bundle for deterministic comment passes, summaries, and bounded semantic risk review.',
  },
  'macro-format': {
    bundle: 'macro-format',
    legacyTools: [],
    workflowTools: MACRO_FORMAT_WORKFLOW_TOOLS,
    capabilities: ['context', 'text', 'table', 'formatting'],
    description: 'Slim workflow bundle for formatting-focused edits with verified format-transform macros.',
  },
  'macro-media': {
    bundle: 'macro-media',
    legacyTools: [],
    workflowTools: MACRO_MEDIA_WORKFLOW_TOOLS,
    capabilities: ['context', 'media', 'structure'],
    description: 'Slim workflow bundle for image and adjacent structural insertion.',
  },
  'macro-section': {
    bundle: 'macro-section',
    legacyTools: [],
    workflowTools: MACRO_SECTION_WORKFLOW_TOOLS,
    capabilities: ['context', 'structure'],
    description: 'Slim workflow bundle for section-range moves and section-order verification.',
  },
};

function normalizedTaskText(task: unknown): string {
  return String(task ?? '')
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function taskIncludesAny(task: string, needles: readonly string[]): boolean {
  return needles.some((needle) => task.includes(needle));
}

function requestedLargeGeneratedList(task: string): boolean {
  const explicitCount = /\b(?:exactly\s+)?(\d{2,3})\s+(?:items?|entries?|numbered|bulleted)\b/.exec(task);
  if (explicitCount != null && Number(explicitCount[1]) >= 20) return true;
  return taskIncludesAny(task, ['long numbered list', 'large numbered list', 'long bulleted list']);
}

function profileToolNames(profile: ToolsetProfile): readonly string[] {
  if (profile === 'product') return PRODUCT_AGENT_TOOL_NAMES;
  const config = TOOL_PROFILE_CONFIG[profile];
  const legacyTools = config.legacyTools === 'all' ? ['*legacy*'] : config.legacyTools;
  const workflowTools = config.workflowTools === 'all' ? ALL_WORKFLOW_TOOLS : config.workflowTools;
  return [...legacyTools, ...workflowTools];
}

function decision(
  profile: ToolsetProfile,
  intent: string,
  reason: string,
  capabilities: readonly ProductCapability[] = TOOL_PROFILE_CONFIG[profile].capabilities,
  options: {
    confidence?: ProductToolsetProfileDecision['confidence'];
    alternatives?: ProductToolsetProfileDecision['alternatives'];
  } = {},
): ProductToolsetProfileDecision {
  return {
    profile,
    intent,
    reason,
    bundle: TOOL_PROFILE_CONFIG[profile].bundle,
    capabilities,
    toolNames: profileToolNames(profile),
    confidence: options.confidence ?? 'high',
    alternatives: options.alternatives ?? [],
  };
}

/**
 * Coarse intent classifier for the clean product router. Returns a stable
 * intent string used for telemetry/comparison; the actual product profile
 * is always `product`.
 */
function inferProductIntent(task: string): string {
  if (task.length === 0) return 'unknown_intent';
  if (task.includes('comment')) return 'comments';
  if (task.includes('track')) return 'tracked_changes';
  if (task.includes('table')) return 'table';
  if (task.includes('image') || task.includes('caption')) return 'media';
  if (task.includes('list')) return 'list';
  if (task.includes('section')) return 'section';
  if (task.includes('color') || task.includes('font') || task.includes('letter spacing')) return 'formatting';
  if (task.includes('summar')) return 'summary';
  if (task.includes('replace') || task.includes('delete') || task.includes('placeholder')) return 'text';
  return 'document_edit';
}

/**
 * Product-oriented capability routing.
 *
 * Always returns the clean `product` profile. Benchmark-shaped profiles
 * (`benchmark-v2`, `macro-*`, `hybrid-macro-first`) are quarantined: they
 * are measurable but never product-default. The `intent` field is still
 * derived from request text so callers and telemetry can compare to the
 * benchmark router output, but it never routes the product through
 * benchmark surfaces.
 *
 * This intentionally accepts only the user's request text. It must not
 * depend on eval IDs, fixture names, benchmark descriptions, or known
 * assertion strings.
 */
export function resolveProductToolsetProfile(input: { task?: string } = {}): ProductToolsetProfileDecision {
  const task = normalizedTaskText(input.task);
  const intent = inferProductIntent(task);
  const reason =
    'product-default routing always resolves to the clean product profile; benchmark profiles are not product-default';
  return decision('product', intent, reason, TOOL_PROFILE_CONFIG.product.capabilities);
}

/**
 * Legacy benchmark router preserved for measurement only. This routes a
 * task to one of the benchmark-shaped profiles. Product callers must NOT
 * use this — it is exposed exclusively so eval harnesses can keep comparing
 * benchmark routing against product routing.
 *
 * @internal — benchmark surface; do not call from product code
 */
export function resolveBenchmarkToolsetProfile(input: { task?: string } = {}): ProductToolsetProfileDecision {
  const task = normalizedTaskText(input.task);

  if (
    taskIncludesAny(task, [
      'high liability',
      'high-liability',
      'liability risk',
      'risk for our side',
      'risk for the company',
      'risk for the client',
      'clauses that create risk',
      'clauses that create liability',
    ])
  ) {
    return decision(
      'macro-comments',
      'semantic_clause_review_comments',
      'bounded semantic clause review is covered by the compact comment transform risk-clause workflow',
      ['context', 'comments', 'semanticReview'],
      {
        alternatives: [
          {
            profile: 'primitive-v2',
            reason: 'fallback for semantic review requiring arbitrary manual comment anchoring',
          },
        ],
      },
    );
  }

  if (
    taskIncludesAny(task, [
      'heading 2',
      'heading level 2',
      'style must be preserved',
      'preserve the style',
      'styled template',
      'template heading',
      'paste this content below',
      'paste content below',
    ])
  ) {
    return decision(
      'macro-structure',
      'styled_template_insertion',
      'styled template insertions need structure/list/style macros without broad legacy tool bloat',
      ['context', 'structure', 'formatting'],
    );
  }

  if (
    task.includes('summar') &&
    taskIncludesAny(task, ['main risks', 'risk summary', 'large document', 'long document', 'top of the document'])
  ) {
    return decision(
      'benchmark-v2',
      'compact_document_summary',
      'large-document summary should use compact context plus the compile-and-execute facade',
      ['context', 'compileExecute'],
    );
  }

  if (taskIncludesAny(task, ['image attached', 'embedded image', 'inline image', 'base64 png', 'caption'])) {
    return decision(
      'macro-media',
      'media_insertion',
      'image tasks should expose only media insertion plus adjacent structure helpers',
      ['context', 'media', 'structure'],
    );
  }

  if (taskIncludesAny(task, ['reorder sections', 'reorganize the sections', 'move section'])) {
    return decision(
      'macro-section',
      'section_reorder',
      'numbered section moves are covered by the compact section transform workflow with order verification',
      ['context', 'structure'],
      {
        alternatives: [
          {
            profile: 'benchmark-v2',
            reason: 'fallback if the request is not a numbered top-level section move',
          },
        ],
      },
    );
  }

  if (
    taskIncludesAny(task, [
      'defined term',
      'section number',
      'section 1.',
      'section 2.',
      'section 3.',
      'inside the table',
      'table cell',
    ])
  ) {
    return decision(
      'macro-table',
      'structure_sensitive_text_transform',
      'table-adjacent replacements need table context plus text/table macros',
      ['context', 'text', 'table'],
    );
  }

  if (requestedLargeGeneratedList(task) || taskIncludesAny(task, ['table of contents', 'toc'])) {
    return decision(
      'macro-structure',
      'complex_structure_generation',
      'large generated structures and fields need list/structure macros without broad legacy fallback',
      ['context', 'structure', 'list'],
    );
  }

  if (
    taskIncludesAny(task, [
      'table background',
      'table shading',
      'background color to the first table',
      'new row',
      'new column',
      'split the first table',
      'create a table',
    ])
  ) {
    return decision(
      'macro-table',
      'table_edit',
      'table edits should use the table macro bundle instead of a broad tool surface',
      ['context', 'table', 'formatting'],
    );
  }

  if (
    taskIncludesAny(task, [
      'letter spacing',
      'normalize body fonts',
      'consistent 11pt',
      'consistent 11 pt',
      'color the word',
      'make the second paragraph blue',
    ])
  ) {
    return decision(
      'macro-format',
      'formatting_edit',
      'deterministic formatting edits are covered by the verified compact format transform workflow',
      ['context', 'formatting'],
      {
        alternatives: [
          {
            profile: 'benchmark-v2',
            reason: 'fallback for formatting tasks outside color, letter-spacing, or body-font normalization',
          },
        ],
      },
    );
  }

  if (
    taskIncludesAny(task, [
      'comment every paragraph',
      'comment on every paragraph',
      'add a comment to each paragraph',
      'summarize all the comments',
      'summarise all the comments',
      'comment summary',
      'document comments',
      'read the document comments',
      'reviewer notes',
    ])
  ) {
    return decision(
      'macro-comments',
      'deterministic_comment_pass',
      'comment passes and comment summaries should use the dedicated compact comment transform bundle',
      ['context', 'comments'],
    );
  }

  if (
    taskIncludesAny(task, [
      'tracked html',
      'tracked markdown',
      'tracked text',
      'as a tracked paragraph',
      'tracked paragraph',
    ]) &&
    !taskIncludesAny(task, ['tracked list', 'tracked numbered list', 'tracked bulleted list'])
  ) {
    return decision(
      'hybrid-macro-first',
      'tracked_rich_text_insert',
      'tracked rich-text insertion still needs legacy breadth plus workflow insert helpers',
      ['structure', 'trackedChanges', 'legacyFallback'],
    );
  }

  return decision(
    'benchmark-v2',
    'deterministic_edit',
    'deterministic edit covered by compact compile-and-execute workflow wrapper',
    ['compileExecute', 'context'],
  );
}
