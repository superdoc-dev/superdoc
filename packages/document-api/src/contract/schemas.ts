import { COMMAND_CATALOG } from './command-catalog.js';
import { CONTRACT_VERSION, JSON_SCHEMA_DIALECT, OPERATION_IDS, type OperationId } from './types.js';
import { NODE_TYPES, BLOCK_NODE_TYPES, DELETABLE_BLOCK_NODE_TYPES, INLINE_NODE_TYPES } from '../types/base.js';
import { ALIGNMENTS } from '../format/format.js';
import { INLINE_PROPERTY_REGISTRY, buildInlineRunPatchSchema } from '../format/inline-run-patch.js';
import { INLINE_DIRECTIVES } from '../types/style-policy.types.js';

type JsonSchema = Record<string, unknown>;

/** JSON Schema descriptors for a single operation's input, output, and result variants. */
export interface OperationSchemaSet {
  /** Schema describing the operation's accepted input payload. */
  input: JsonSchema;
  /** Schema describing the full output (success | failure union for mutations). */
  output: JsonSchema;
  /** Schema describing only the success branch of a mutation result. */
  success?: JsonSchema;
  /** Schema describing only the failure branch of a mutation result. */
  failure?: JsonSchema;
}

/** Top-level contract envelope containing versioned operation schemas. */
export interface InternalContractSchemas {
  /** JSON Schema dialect URI (e.g. `https://json-schema.org/draft/2020-12/schema`). */
  $schema: string;
  /** Semantic version of the document-api contract these schemas describe. */
  contractVersion: string;
  /** Shared schema definitions referenced by `$ref` in operation schemas. */
  $defs?: Record<string, JsonSchema>;
  /** Per-operation schema sets keyed by {@link OperationId}. */
  operations: Record<OperationId, OperationSchemaSet>;
}

function objectSchema(properties: Record<string, JsonSchema>, required: readonly string[] = []): JsonSchema {
  const schema: JsonSchema = {
    type: 'object',
    properties,
    additionalProperties: false,
  };
  if (required.length > 0) {
    schema.required = [...required];
  }
  return schema;
}

function arraySchema(items: JsonSchema): JsonSchema {
  return {
    type: 'array',
    items,
  };
}

/** Returns a `{ $ref: '#/$defs/<name>' }` pointer for use in operation schemas. */
function ref(name: string): JsonSchema {
  return { $ref: `#/$defs/${name}` };
}

const nodeTypeValues = NODE_TYPES;
const blockNodeTypeValues = BLOCK_NODE_TYPES;
const deletableBlockNodeTypeValues = DELETABLE_BLOCK_NODE_TYPES;
const inlineNodeTypeValues = INLINE_NODE_TYPES;

// ---------------------------------------------------------------------------
// Shared $defs — canonical schema definitions referenced via ref()
// ---------------------------------------------------------------------------

const knownTargetKindValues = [
  'text',
  'node',
  'list',
  'comment',
  'trackedChange',
  'table',
  'tableCell',
  'section',
  'sdt',
  'field',
] as const;

/**
 * Shared schema definitions referenced by `$ref` in operation schemas.
 *
 * Within entries, cross-references use `ref()` so that the entire $defs
 * graph is self-consistent.
 */
const SHARED_DEFS: Record<string, JsonSchema> = {
  // -- Primitives --
  Range: objectSchema(
    {
      start: { type: 'integer' },
      end: { type: 'integer' },
    },
    ['start', 'end'],
  ),
  Position: objectSchema(
    {
      blockId: { type: 'string' },
      offset: { type: 'integer' },
    },
    ['blockId', 'offset'],
  ),
  InlineAnchor: objectSchema(
    {
      start: ref('Position'),
      end: ref('Position'),
    },
    ['start', 'end'],
  ),
  TargetKind: {
    anyOf: [{ enum: [...knownTargetKindValues] }, { type: 'string', pattern: '^ext:.+$' }],
  },

  // -- Address types --
  TextAddress: objectSchema(
    {
      kind: { const: 'text' },
      blockId: { type: 'string' },
      range: ref('Range'),
    },
    ['kind', 'blockId', 'range'],
  ),
  TextSegment: objectSchema(
    {
      blockId: { type: 'string' },
      range: ref('Range'),
    },
    ['blockId', 'range'],
  ),
  TextTarget: objectSchema(
    {
      kind: { const: 'text' },
      segments: { type: 'array', items: ref('TextSegment'), minItems: 1 },
    },
    ['kind', 'segments'],
  ),
  BlockNodeAddress: objectSchema(
    {
      kind: { const: 'block' },
      nodeType: { enum: [...blockNodeTypeValues] },
      nodeId: { type: 'string' },
    },
    ['kind', 'nodeType', 'nodeId'],
  ),
  DeletableBlockNodeAddress: objectSchema(
    {
      kind: { const: 'block' },
      nodeType: { enum: [...deletableBlockNodeTypeValues] },
      nodeId: { type: 'string' },
    },
    ['kind', 'nodeType', 'nodeId'],
  ),
  ParagraphAddress: objectSchema(
    {
      kind: { const: 'block' },
      nodeType: { const: 'paragraph' },
      nodeId: { type: 'string' },
    },
    ['kind', 'nodeType', 'nodeId'],
  ),
  HeadingAddress: objectSchema(
    {
      kind: { const: 'block' },
      nodeType: { const: 'heading' },
      nodeId: { type: 'string' },
    },
    ['kind', 'nodeType', 'nodeId'],
  ),
  ListItemAddress: objectSchema(
    {
      kind: { const: 'block' },
      nodeType: { const: 'listItem' },
      nodeId: { type: 'string' },
    },
    ['kind', 'nodeType', 'nodeId'],
  ),
  SectionAddress: objectSchema(
    {
      kind: { const: 'section' },
      sectionId: { type: 'string' },
    },
    ['kind', 'sectionId'],
  ),
  InlineNodeAddress: objectSchema(
    {
      kind: { const: 'inline' },
      nodeType: { enum: [...inlineNodeTypeValues] },
      anchor: ref('InlineAnchor'),
    },
    ['kind', 'nodeType', 'anchor'],
  ),
  NodeAddress: {
    oneOf: [ref('BlockNodeAddress'), ref('InlineNodeAddress')],
  },
  CommentAddress: objectSchema(
    {
      kind: { const: 'entity' },
      entityType: { const: 'comment' },
      entityId: { type: 'string' },
    },
    ['kind', 'entityType', 'entityId'],
  ),
  TrackedChangeAddress: objectSchema(
    {
      kind: { const: 'entity' },
      entityType: { const: 'trackedChange' },
      entityId: { type: 'string' },
    },
    ['kind', 'entityType', 'entityId'],
  ),
  EntityAddress: {
    oneOf: [ref('CommentAddress'), ref('TrackedChangeAddress')],
  },

  // -- Discovery components --
  ResolvedHandle: objectSchema(
    {
      ref: { type: 'string' },
      refStability: { enum: ['stable', 'ephemeral'] },
      targetKind: ref('TargetKind'),
    },
    ['ref', 'refStability', 'targetKind'],
  ),
  PageInfo: objectSchema(
    {
      limit: { type: 'integer', minimum: 0 },
      offset: { type: 'integer', minimum: 0 },
      returned: { type: 'integer', minimum: 0 },
    },
    ['limit', 'offset', 'returned'],
  ),

  // -- Receipt scaffolds --
  ReceiptSuccess: objectSchema(
    {
      success: { const: true },
      inserted: arraySchema(ref('EntityAddress')),
      updated: arraySchema(ref('EntityAddress')),
      removed: arraySchema(ref('EntityAddress')),
    },
    ['success'],
  ),
  TextMutationRange: objectSchema(
    {
      from: { type: 'integer' },
      to: { type: 'integer' },
    },
    ['from', 'to'],
  ),
  TextMutationResolution: objectSchema(
    {
      requestedTarget: ref('TextAddress'),
      target: ref('TextAddress'),
      range: ref('TextMutationRange'),
      text: { type: 'string' },
    },
    ['target', 'range', 'text'],
  ),
  TextMutationSuccess: objectSchema(
    {
      success: { const: true },
      resolution: ref('TextMutationResolution'),
      inserted: arraySchema(ref('EntityAddress')),
      updated: arraySchema(ref('EntityAddress')),
      removed: arraySchema(ref('EntityAddress')),
    },
    ['success', 'resolution'],
  ),

  // -- Match fragments (query.match) --
  MatchRun: objectSchema(
    {
      range: ref('Range'),
      text: { type: 'string' },
      styleId: { type: 'string' },
      styles: objectSchema(
        {
          direct: objectSchema(
            {
              bold: { enum: [...INLINE_DIRECTIVES] },
              italic: { enum: [...INLINE_DIRECTIVES] },
              underline: { enum: [...INLINE_DIRECTIVES] },
              strike: { enum: [...INLINE_DIRECTIVES] },
            },
            ['bold', 'italic', 'underline', 'strike'],
          ),
          effective: objectSchema(
            {
              bold: { type: 'boolean' },
              italic: { type: 'boolean' },
              underline: { type: 'boolean' },
              strike: { type: 'boolean' },
            },
            ['bold', 'italic', 'underline', 'strike'],
          ),
          color: { type: 'string' },
          highlight: { type: 'string' },
          fontFamily: { type: 'string' },
          fontSizePt: { type: 'number' },
        },
        ['direct', 'effective'],
      ),
      ref: { type: 'string' },
    },
    ['range', 'text', 'styles', 'ref'],
  ),
  MatchBlock: objectSchema(
    {
      blockId: { type: 'string' },
      nodeType: { type: 'string' },
      range: ref('Range'),
      text: { type: 'string' },
      paragraphStyle: objectSchema({
        styleId: { type: 'string' },
        isListItem: { type: 'boolean' },
        listLevel: { type: 'integer', minimum: 0 },
      }),
      ref: { type: 'string' },
      runs: arraySchema(ref('MatchRun')),
    },
    ['blockId', 'nodeType', 'range', 'text', 'ref', 'runs'],
  ),
};

// ---------------------------------------------------------------------------
// Module-level aliases using $ref pointers
// ---------------------------------------------------------------------------

const rangeSchema = ref('Range');
const positionSchema = ref('Position');
const inlineAnchorSchema = ref('InlineAnchor');
const targetKindSchema = ref('TargetKind');
const textAddressSchema = ref('TextAddress');
const textTargetSchema = ref('TextTarget');
const blockNodeAddressSchema = ref('BlockNodeAddress');
const deletableBlockNodeAddressSchema = ref('DeletableBlockNodeAddress');
const paragraphAddressSchema = ref('ParagraphAddress');
const headingAddressSchema = ref('HeadingAddress');
const listItemAddressSchema = ref('ListItemAddress');
const sectionAddressSchema = ref('SectionAddress');
const inlineNodeAddressSchema = ref('InlineNodeAddress');
const nodeAddressSchema = ref('NodeAddress');
const commentAddressSchema = ref('CommentAddress');
const trackedChangeAddressSchema = ref('TrackedChangeAddress');
const entityAddressSchema = ref('EntityAddress');
const resolvedHandleSchema = ref('ResolvedHandle');
const pageInfoSchema = ref('PageInfo');
const receiptSuccessSchema = ref('ReceiptSuccess');
const textMutationRangeSchema = ref('TextMutationRange');
const textMutationResolutionSchema = ref('TextMutationResolution');
const textMutationSuccessSchema = ref('TextMutationSuccess');
const matchRunSchema = ref('MatchRun');
const matchBlockSchema = ref('MatchBlock');

// Keep these aliases for internal readability
void positionSchema;
void inlineAnchorSchema;
void targetKindSchema;
void inlineNodeAddressSchema;
void textMutationRangeSchema;
void entityAddressSchema;
void matchRunSchema;

// ---------------------------------------------------------------------------
// Discovery envelope schemas (C0)
// ---------------------------------------------------------------------------

/**
 * Builds a DiscoveryResult schema wrapping the given item schema.
 * When `metaSchema` is provided, a required `meta` field is added to the envelope.
 */
function discoveryResultSchema(itemSchema: JsonSchema, metaSchema?: JsonSchema): JsonSchema {
  const properties: Record<string, JsonSchema> = {
    evaluatedRevision: { type: 'string' },
    total: { type: 'integer', minimum: 0 },
    items: arraySchema(itemSchema),
    page: pageInfoSchema,
  };
  const required = ['evaluatedRevision', 'total', 'items', 'page'];

  if (metaSchema) {
    properties.meta = metaSchema;
    required.push('meta');
  }

  return objectSchema(properties, required);
}

/**
 * Wraps domain-specific properties into a DiscoveryItem schema
 * (adds `id` and `handle` fields).
 */
function discoveryItemSchema(
  domainProperties: Record<string, JsonSchema>,
  domainRequired: readonly string[] = [],
): JsonSchema {
  return objectSchema(
    {
      id: { type: 'string' },
      handle: resolvedHandleSchema,
      ...domainProperties,
    },
    ['id', 'handle', ...domainRequired],
  );
}

function possibleFailureCodes(operationId: OperationId): string[] {
  return [...COMMAND_CATALOG[operationId].possibleFailureCodes];
}

function preApplyThrowCodes(operationId: OperationId): string[] {
  return [...COMMAND_CATALOG[operationId].throws.preApply];
}

function receiptFailureSchemaFor(operationId: OperationId): JsonSchema {
  const codes = possibleFailureCodes(operationId);
  if (codes.length === 0) {
    throw new Error(`Operation "${operationId}" does not declare non-applied failure codes.`);
  }

  return objectSchema(
    {
      code: {
        enum: codes,
      },
      message: { type: 'string' },
      details: {},
    },
    ['code', 'message'],
  );
}

function preApplyFailureSchemaFor(operationId: OperationId): JsonSchema {
  const codes = preApplyThrowCodes(operationId);
  if (codes.length === 0) {
    throw new Error(`Operation "${operationId}" does not declare pre-apply throw codes.`);
  }

  return objectSchema(
    {
      code: {
        enum: codes,
      },
      message: { type: 'string' },
      details: {},
    },
    ['code', 'message'],
  );
}
function receiptFailureResultSchemaFor(operationId: OperationId): JsonSchema {
  return objectSchema(
    {
      success: { const: false },
      failure: receiptFailureSchemaFor(operationId),
    },
    ['success', 'failure'],
  );
}

function preApplyFailureResultSchemaFor(operationId: OperationId): JsonSchema {
  return objectSchema(
    {
      success: { const: false },
      failure: preApplyFailureSchemaFor(operationId),
    },
    ['success', 'failure'],
  );
}

function receiptResultSchemaFor(operationId: OperationId): JsonSchema {
  return {
    oneOf: [receiptSuccessSchema, receiptFailureResultSchemaFor(operationId)],
  };
}

function textMutationFailureSchemaFor(operationId: OperationId): JsonSchema {
  return objectSchema(
    {
      success: { const: false },
      failure: receiptFailureSchemaFor(operationId),
      resolution: textMutationResolutionSchema,
    },
    ['success', 'failure', 'resolution'],
  );
}

function textMutationResultSchemaFor(operationId: OperationId): JsonSchema {
  return {
    oneOf: [textMutationSuccessSchema, textMutationFailureSchemaFor(operationId)],
  };
}

const trackChangeRefSchema = trackedChangeAddressSchema;

const createParagraphSuccessSchema = objectSchema(
  {
    success: { const: true },
    paragraph: paragraphAddressSchema,
    insertionPoint: textAddressSchema,
    trackedChangeRefs: arraySchema(trackChangeRefSchema),
  },
  ['success', 'paragraph', 'insertionPoint'],
);

function createParagraphFailureSchemaFor(operationId: OperationId): JsonSchema {
  return objectSchema(
    {
      success: { const: false },
      failure: receiptFailureSchemaFor(operationId),
    },
    ['success', 'failure'],
  );
}

function createParagraphResultSchemaFor(operationId: OperationId): JsonSchema {
  return {
    oneOf: [createParagraphSuccessSchema, createParagraphFailureSchemaFor(operationId)],
  };
}

const createHeadingSuccessSchema = objectSchema(
  {
    success: { const: true },
    heading: headingAddressSchema,
    insertionPoint: textAddressSchema,
    trackedChangeRefs: arraySchema(trackChangeRefSchema),
  },
  ['success', 'heading', 'insertionPoint'],
);

function createHeadingFailureSchemaFor(operationId: OperationId): JsonSchema {
  return objectSchema(
    {
      success: { const: false },
      failure: receiptFailureSchemaFor(operationId),
    },
    ['success', 'failure'],
  );
}

function createHeadingResultSchemaFor(operationId: OperationId): JsonSchema {
  return {
    oneOf: [createHeadingSuccessSchema, createHeadingFailureSchemaFor(operationId)],
  };
}

const headingLevelSchema: JsonSchema = { type: 'integer', minimum: 1, maximum: 6 };

const listsInsertSuccessSchema = objectSchema(
  {
    success: { const: true },
    item: listItemAddressSchema,
    insertionPoint: textAddressSchema,
    trackedChangeRefs: arraySchema(trackChangeRefSchema),
  },
  ['success', 'item', 'insertionPoint'],
);

const listsMutateItemSuccessSchema = objectSchema(
  {
    success: { const: true },
    item: listItemAddressSchema,
  },
  ['success', 'item'],
);

const listsExitSuccessSchema = objectSchema(
  {
    success: { const: true },
    paragraph: paragraphAddressSchema,
  },
  ['success', 'paragraph'],
);

function listsFailureSchemaFor(operationId: OperationId): JsonSchema {
  return objectSchema(
    {
      success: { const: false },
      failure: receiptFailureSchemaFor(operationId),
    },
    ['success', 'failure'],
  );
}

function listsInsertResultSchemaFor(operationId: OperationId): JsonSchema {
  return {
    oneOf: [listsInsertSuccessSchema, listsFailureSchemaFor(operationId)],
  };
}

function listsMutateItemResultSchemaFor(operationId: OperationId): JsonSchema {
  return {
    oneOf: [listsMutateItemSuccessSchema, listsFailureSchemaFor(operationId)],
  };
}

function listsExitResultSchemaFor(operationId: OperationId): JsonSchema {
  return {
    oneOf: [listsExitSuccessSchema, listsFailureSchemaFor(operationId)],
  };
}

const nodeSummarySchema = objectSchema({
  label: { type: 'string' },
  text: { type: 'string' },
});

const nodeInfoSchema: JsonSchema = {
  type: 'object',
  required: ['nodeType', 'kind'],
  properties: {
    nodeType: { enum: [...nodeTypeValues] },
    kind: { enum: ['block', 'inline'] },
    summary: nodeSummarySchema,
    text: { type: 'string' },
    nodes: arraySchema({ type: 'object' }),
    properties: { type: 'object' },
    bodyText: { type: 'string' },
    bodyNodes: arraySchema({ type: 'object' }),
  },
  additionalProperties: false,
};

const matchContextSchema = objectSchema(
  {
    address: nodeAddressSchema,
    snippet: { type: 'string' },
    highlightRange: rangeSchema,
    textRanges: arraySchema(textAddressSchema),
  },
  ['address', 'snippet', 'highlightRange'],
);

const unknownNodeDiagnosticSchema = objectSchema(
  {
    message: { type: 'string' },
    address: nodeAddressSchema,
    hint: { type: 'string' },
  },
  ['message'],
);

const textSelectorSchema = objectSchema(
  {
    type: { const: 'text' },
    pattern: { type: 'string' },
    mode: { enum: ['contains', 'regex'] },
    caseSensitive: { type: 'boolean' },
  },
  ['type', 'pattern'],
);

const nodeSelectorSchema = objectSchema(
  {
    type: { const: 'node' },
    nodeType: { enum: [...nodeTypeValues] },
    kind: { enum: ['block', 'inline'] },
  },
  ['type'],
);

const selectorShorthandSchema = objectSchema(
  {
    nodeType: { enum: [...nodeTypeValues] },
  },
  ['nodeType'],
);

const selectSchema: JsonSchema = {
  anyOf: [textSelectorSchema, nodeSelectorSchema, selectorShorthandSchema],
};

const findInputSchema = objectSchema(
  {
    select: selectSchema,
    within: nodeAddressSchema,
    limit: { type: 'integer' },
    offset: { type: 'integer' },
    require: { enum: ['any', 'first', 'exactlyOne', 'all'] },
    includeNodes: { type: 'boolean' },
    includeUnknown: { type: 'boolean' },
  },
  ['select'],
);

const findItemDomainSchema = discoveryItemSchema(
  {
    address: nodeAddressSchema,
    node: nodeInfoSchema,
    context: matchContextSchema,
  },
  ['address'],
);

const findOutputSchema: JsonSchema = {
  ...discoveryResultSchema(findItemDomainSchema),
  properties: {
    ...(discoveryResultSchema(findItemDomainSchema) as { properties: Record<string, JsonSchema> }).properties,
    diagnostics: arraySchema(unknownNodeDiagnosticSchema),
  },
};

const documentInfoCountsSchema = objectSchema(
  {
    words: { type: 'integer' },
    paragraphs: { type: 'integer' },
    headings: { type: 'integer' },
    tables: { type: 'integer' },
    images: { type: 'integer' },
    comments: { type: 'integer' },
  },
  ['words', 'paragraphs', 'headings', 'tables', 'images', 'comments'],
);

const documentInfoOutlineItemSchema = objectSchema(
  {
    level: { type: 'integer' },
    text: { type: 'string' },
    nodeId: { type: 'string' },
  },
  ['level', 'text', 'nodeId'],
);

const documentInfoCapabilitiesSchema = objectSchema(
  {
    canFind: { type: 'boolean' },
    canGetNode: { type: 'boolean' },
    canComment: { type: 'boolean' },
    canReplace: { type: 'boolean' },
  },
  ['canFind', 'canGetNode', 'canComment', 'canReplace'],
);

const documentInfoSchema = objectSchema(
  {
    counts: documentInfoCountsSchema,
    outline: arraySchema(documentInfoOutlineItemSchema),
    capabilities: documentInfoCapabilitiesSchema,
    revision: { type: 'string' },
  },
  ['counts', 'outline', 'capabilities', 'revision'],
);

const listKindSchema: JsonSchema = { enum: ['ordered', 'bullet'] };
const listInsertPositionSchema: JsonSchema = { enum: ['before', 'after'] };

const listItemInfoSchema = objectSchema(
  {
    address: listItemAddressSchema,
    marker: { type: 'string' },
    ordinal: { type: 'integer' },
    path: arraySchema({ type: 'integer' }),
    level: { type: 'integer' },
    kind: listKindSchema,
    text: { type: 'string' },
  },
  ['address'],
);

const listItemDomainItemSchema = discoveryItemSchema(
  {
    address: listItemAddressSchema,
    marker: { type: 'string' },
    ordinal: { type: 'integer' },
    path: arraySchema({ type: 'integer' }),
    level: { type: 'integer' },
    kind: listKindSchema,
    text: { type: 'string' },
  },
  ['address'],
);

const listsListResultSchema = discoveryResultSchema(listItemDomainItemSchema);

const sectionBreakTypeSchema: JsonSchema = { enum: ['continuous', 'nextPage', 'evenPage', 'oddPage'] };
const sectionOrientationSchema: JsonSchema = { enum: ['portrait', 'landscape'] };
const sectionVerticalAlignSchema: JsonSchema = { enum: ['top', 'center', 'bottom', 'both'] };
const sectionDirectionSchema: JsonSchema = { enum: ['ltr', 'rtl'] };
const sectionHeaderFooterKindSchema: JsonSchema = { enum: ['header', 'footer'] };
const sectionHeaderFooterVariantSchema: JsonSchema = { enum: ['default', 'first', 'even'] };
const sectionLineNumberRestartSchema: JsonSchema = { enum: ['continuous', 'newPage', 'newSection'] };
const sectionPageNumberFormatSchema: JsonSchema = {
  enum: ['decimal', 'lowerLetter', 'upperLetter', 'lowerRoman', 'upperRoman', 'numberInDash'],
};

const sectionRangeDomainSchema = objectSchema(
  {
    startParagraphIndex: { type: 'integer', minimum: 0 },
    endParagraphIndex: { type: 'integer', minimum: 0 },
  },
  ['startParagraphIndex', 'endParagraphIndex'],
);

const sectionPageMarginsSchema = objectSchema({
  top: { type: 'number', minimum: 0 },
  right: { type: 'number', minimum: 0 },
  bottom: { type: 'number', minimum: 0 },
  left: { type: 'number', minimum: 0 },
  gutter: { type: 'number', minimum: 0 },
});

const sectionHeaderFooterMarginsSchema = objectSchema({
  header: { type: 'number', minimum: 0 },
  footer: { type: 'number', minimum: 0 },
});

const sectionPageSetupSchema = objectSchema({
  width: { type: 'number', minimum: 0 },
  height: { type: 'number', minimum: 0 },
  orientation: sectionOrientationSchema,
  paperSize: { type: 'string' },
});

const sectionColumnsSchema = objectSchema({
  count: { type: 'integer', minimum: 1 },
  gap: { type: 'number', minimum: 0 },
  equalWidth: { type: 'boolean' },
});

const sectionLineNumberingSchema = objectSchema(
  {
    enabled: { type: 'boolean' },
    countBy: { type: 'integer', minimum: 1 },
    start: { type: 'integer', minimum: 1 },
    distance: { type: 'number', minimum: 0 },
    restart: sectionLineNumberRestartSchema,
  },
  ['enabled'],
);

const sectionPageNumberingSchema = objectSchema({
  start: { type: 'integer', minimum: 1 },
  format: sectionPageNumberFormatSchema,
});

const sectionHeaderFooterRefsSchema = objectSchema({
  default: { type: 'string' },
  first: { type: 'string' },
  even: { type: 'string' },
});

const sectionBorderSpecSchema = objectSchema({
  style: { type: 'string' },
  size: { type: 'number', minimum: 0 },
  space: { type: 'number', minimum: 0 },
  color: { type: 'string' },
  shadow: { type: 'boolean' },
  frame: { type: 'boolean' },
});

sectionBorderSpecSchema.oneOf = [
  { required: ['style'] },
  { required: ['size'] },
  { required: ['space'] },
  { required: ['color'] },
  { required: ['shadow'] },
  { required: ['frame'] },
];

const sectionPageBordersSchema = objectSchema({
  display: { enum: ['allPages', 'firstPage', 'notFirstPage'] },
  offsetFrom: { enum: ['page', 'text'] },
  zOrder: { enum: ['front', 'back'] },
  top: sectionBorderSpecSchema,
  right: sectionBorderSpecSchema,
  bottom: sectionBorderSpecSchema,
  left: sectionBorderSpecSchema,
});

sectionPageBordersSchema.oneOf = [
  { required: ['display'] },
  { required: ['offsetFrom'] },
  { required: ['zOrder'] },
  { required: ['top'] },
  { required: ['right'] },
  { required: ['bottom'] },
  { required: ['left'] },
];

const sectionInfoSchema = objectSchema(
  {
    address: sectionAddressSchema,
    index: { type: 'integer', minimum: 0 },
    range: sectionRangeDomainSchema,
    breakType: sectionBreakTypeSchema,
    pageSetup: sectionPageSetupSchema,
    margins: sectionPageMarginsSchema,
    headerFooterMargins: sectionHeaderFooterMarginsSchema,
    columns: sectionColumnsSchema,
    lineNumbering: sectionLineNumberingSchema,
    pageNumbering: sectionPageNumberingSchema,
    titlePage: { type: 'boolean' },
    oddEvenHeadersFooters: { type: 'boolean' },
    verticalAlign: sectionVerticalAlignSchema,
    sectionDirection: sectionDirectionSchema,
    headerRefs: sectionHeaderFooterRefsSchema,
    footerRefs: sectionHeaderFooterRefsSchema,
    pageBorders: sectionPageBordersSchema,
  },
  ['address', 'index', 'range'],
);

const sectionResolvedHandleSchema = objectSchema(
  {
    ref: { type: 'string' },
    refStability: { const: 'ephemeral' },
    targetKind: { const: 'section' },
  },
  ['ref', 'refStability', 'targetKind'],
);

const sectionDomainItemSchema = objectSchema(
  {
    id: { type: 'string' },
    handle: sectionResolvedHandleSchema,
    address: sectionAddressSchema,
    index: { type: 'integer', minimum: 0 },
    range: sectionRangeDomainSchema,
    breakType: sectionBreakTypeSchema,
    pageSetup: sectionPageSetupSchema,
    margins: sectionPageMarginsSchema,
    headerFooterMargins: sectionHeaderFooterMarginsSchema,
    columns: sectionColumnsSchema,
    lineNumbering: sectionLineNumberingSchema,
    pageNumbering: sectionPageNumberingSchema,
    titlePage: { type: 'boolean' },
    oddEvenHeadersFooters: { type: 'boolean' },
    verticalAlign: sectionVerticalAlignSchema,
    sectionDirection: sectionDirectionSchema,
    headerRefs: sectionHeaderFooterRefsSchema,
    footerRefs: sectionHeaderFooterRefsSchema,
    pageBorders: sectionPageBordersSchema,
  },
  ['id', 'handle', 'address', 'index', 'range'],
);

const sectionsListResultSchema = discoveryResultSchema(sectionDomainItemSchema);

const sectionMutationSuccessSchema = objectSchema(
  {
    success: { const: true },
    section: sectionAddressSchema,
  },
  ['success', 'section'],
);

function sectionMutationFailureSchemaFor(operationId: OperationId): JsonSchema {
  return objectSchema(
    {
      success: { const: false },
      failure: receiptFailureSchemaFor(operationId),
    },
    ['success', 'failure'],
  );
}

function sectionMutationResultSchemaFor(operationId: OperationId): JsonSchema {
  return {
    oneOf: [sectionMutationSuccessSchema, sectionMutationFailureSchemaFor(operationId)],
  };
}

const documentMutationSuccessSchema = objectSchema(
  {
    success: { const: true },
  },
  ['success'],
);

function documentMutationResultSchemaFor(operationId: OperationId): JsonSchema {
  return {
    oneOf: [documentMutationSuccessSchema, sectionMutationFailureSchemaFor(operationId)],
  };
}

const createSectionBreakSuccessSchema = objectSchema(
  {
    success: { const: true },
    section: sectionAddressSchema,
    breakParagraph: blockNodeAddressSchema,
  },
  ['success', 'section'],
);

function createSectionBreakFailureSchemaFor(operationId: OperationId): JsonSchema {
  return objectSchema(
    {
      success: { const: false },
      failure: receiptFailureSchemaFor(operationId),
    },
    ['success', 'failure'],
  );
}

function createSectionBreakResultSchemaFor(operationId: OperationId): JsonSchema {
  return {
    oneOf: [createSectionBreakSuccessSchema, createSectionBreakFailureSchemaFor(operationId)],
  };
}

const commentInfoSchema = objectSchema(
  {
    address: commentAddressSchema,
    commentId: { type: 'string' },
    importedId: { type: 'string' },
    parentCommentId: { type: 'string' },
    text: { type: 'string' },
    isInternal: { type: 'boolean' },
    status: { enum: ['open', 'resolved'] },
    target: textTargetSchema,
    anchoredText: { type: 'string' },
    createdTime: { type: 'number' },
    creatorName: { type: 'string' },
    creatorEmail: { type: 'string' },
  },
  ['address', 'commentId', 'status'],
);

const commentDomainItemSchema = discoveryItemSchema(
  {
    address: commentAddressSchema,
    importedId: { type: 'string' },
    parentCommentId: { type: 'string' },
    text: { type: 'string' },
    isInternal: { type: 'boolean' },
    status: { enum: ['open', 'resolved'] },
    target: textTargetSchema,
    anchoredText: { type: 'string' },
    createdTime: { type: 'number' },
    creatorName: { type: 'string' },
    creatorEmail: { type: 'string' },
  },
  ['address', 'status'],
);

const commentsListResultSchema = discoveryResultSchema(commentDomainItemSchema);

const trackChangeInfoSchema = objectSchema(
  {
    address: trackedChangeAddressSchema,
    id: { type: 'string' },
    type: { enum: ['insert', 'delete', 'format'] },
    author: { type: 'string' },
    authorEmail: { type: 'string' },
    authorImage: { type: 'string' },
    date: { type: 'string' },
    excerpt: { type: 'string' },
  },
  ['address', 'id', 'type'],
);

const trackChangeDomainItemSchema = discoveryItemSchema(
  {
    address: trackedChangeAddressSchema,
    type: { enum: ['insert', 'delete', 'format'] },
    author: { type: 'string' },
    authorEmail: { type: 'string' },
    authorImage: { type: 'string' },
    date: { type: 'string' },
    excerpt: { type: 'string' },
  },
  ['address', 'type'],
);

const trackChangesListResultSchema = discoveryResultSchema(trackChangeDomainItemSchema);

const capabilityReasonCodeSchema: JsonSchema = {
  enum: [
    'COMMAND_UNAVAILABLE',
    'HELPER_UNAVAILABLE',
    'OPERATION_UNAVAILABLE',
    'TRACKED_MODE_UNAVAILABLE',
    'DRY_RUN_UNAVAILABLE',
    'NAMESPACE_UNAVAILABLE',
    'STYLES_PART_MISSING',
    'COLLABORATION_ACTIVE',
  ],
};

const capabilityReasonsSchema = arraySchema(capabilityReasonCodeSchema);

const capabilityFlagSchema = objectSchema(
  {
    enabled: { type: 'boolean' },
    reasons: capabilityReasonsSchema,
  },
  ['enabled'],
);

const operationRuntimeCapabilitySchema = objectSchema(
  {
    available: { type: 'boolean' },
    tracked: { type: 'boolean' },
    dryRun: { type: 'boolean' },
    reasons: capabilityReasonsSchema,
  },
  ['available', 'tracked', 'dryRun'],
);

const operationCapabilitiesSchema = objectSchema(
  Object.fromEntries(OPERATION_IDS.map((operationId) => [operationId, operationRuntimeCapabilitySchema])) as Record<
    string,
    JsonSchema
  >,
  OPERATION_IDS,
);

const inlinePropertyCapabilitySchema = objectSchema(
  {
    available: { type: 'boolean' },
    tracked: { type: 'boolean' },
    type: { enum: ['boolean', 'string', 'number', 'object', 'array'] },
    storage: { enum: ['mark', 'runAttribute'] },
  },
  ['available', 'tracked', 'type', 'storage'],
);

const inlinePropertyCapabilitiesByKeySchema = objectSchema(
  Object.fromEntries(INLINE_PROPERTY_REGISTRY.map((entry) => [entry.key, inlinePropertyCapabilitySchema])) as Record<
    string,
    JsonSchema
  >,
  INLINE_PROPERTY_REGISTRY.map((entry) => entry.key),
);

const formatCapabilitiesSchema = objectSchema(
  {
    supportedInlineProperties: inlinePropertyCapabilitiesByKeySchema,
  },
  ['supportedInlineProperties'],
);

const planEngineCapabilitiesSchema = objectSchema(
  {
    supportedStepOps: arraySchema({ type: 'string' }),
    supportedNonUniformStrategies: arraySchema({ type: 'string' }),
    supportedSetMarks: arraySchema({ type: 'string' }),
    regex: objectSchema(
      {
        maxPatternLength: { type: 'integer' },
      },
      ['maxPatternLength'],
    ),
  },
  ['supportedStepOps', 'supportedNonUniformStrategies', 'supportedSetMarks', 'regex'],
);

const capabilitiesOutputSchema = objectSchema(
  {
    global: objectSchema(
      {
        trackChanges: capabilityFlagSchema,
        comments: capabilityFlagSchema,
        lists: capabilityFlagSchema,
        dryRun: capabilityFlagSchema,
      },
      ['trackChanges', 'comments', 'lists', 'dryRun'],
    ),
    format: formatCapabilitiesSchema,
    operations: operationCapabilitiesSchema,
    planEngine: planEngineCapabilitiesSchema,
  },
  ['global', 'format', 'operations', 'planEngine'],
);

const strictEmptyObjectSchema = objectSchema({});

const insertInputSchema = objectSchema(
  {
    target: textAddressSchema,
    value: { type: 'string' },
    type: { type: 'string', enum: ['text', 'markdown', 'html'] },
  },
  ['value'],
);

// ---------------------------------------------------------------------------
// Table operation shared schemas
// ---------------------------------------------------------------------------

const tableLocatorSchema: JsonSchema = {
  ...objectSchema({
    target: blockNodeAddressSchema,
    nodeId: { type: 'string' },
  }),
  oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
};

const _tableScopedRowLocatorSchema: JsonSchema = {
  ...objectSchema({
    tableTarget: blockNodeAddressSchema,
    tableNodeId: { type: 'string' },
    rowIndex: { type: 'integer', minimum: 0 },
  }),
  oneOf: [{ required: ['tableTarget'] }, { required: ['tableNodeId'] }],
};

const _tableScopedColumnLocatorSchema: JsonSchema = {
  ...objectSchema(
    {
      tableTarget: blockNodeAddressSchema,
      tableNodeId: { type: 'string' },
      columnIndex: { type: 'integer', minimum: 0 },
    },
    ['columnIndex'],
  ),
  oneOf: [{ required: ['tableTarget'] }, { required: ['tableNodeId'] }],
};

const mergeRangeLocatorSchema: JsonSchema = {
  ...objectSchema(
    {
      tableTarget: blockNodeAddressSchema,
      tableNodeId: { type: 'string' },
      start: objectSchema({ rowIndex: { type: 'integer', minimum: 0 }, columnIndex: { type: 'integer', minimum: 0 } }, [
        'rowIndex',
        'columnIndex',
      ]),
      end: objectSchema({ rowIndex: { type: 'integer', minimum: 0 }, columnIndex: { type: 'integer', minimum: 0 } }, [
        'rowIndex',
        'columnIndex',
      ]),
    },
    ['start', 'end'],
  ),
  oneOf: [{ required: ['tableTarget'] }, { required: ['tableNodeId'] }],
};

/**
 * oneOf constraint for operations that accept either a direct row locator
 * (target or nodeId) OR a table-scoped locator (tableTarget/tableNodeId + rowIndex).
 */
const mixedRowLocatorOneOf = [
  { required: ['target'] },
  { required: ['nodeId'] },
  { required: ['tableTarget', 'rowIndex'] },
  { required: ['tableNodeId', 'rowIndex'] },
];

const tableCreateLocationSchema: JsonSchema = {
  oneOf: [
    objectSchema({ kind: { const: 'documentStart' } }, ['kind']),
    objectSchema({ kind: { const: 'documentEnd' } }, ['kind']),
    objectSchema({ kind: { const: 'before' }, target: blockNodeAddressSchema }, ['kind', 'target']),
    objectSchema({ kind: { const: 'after' }, target: blockNodeAddressSchema }, ['kind', 'target']),
    objectSchema({ kind: { const: 'before' }, nodeId: { type: 'string' } }, ['kind', 'nodeId']),
    objectSchema({ kind: { const: 'after' }, nodeId: { type: 'string' } }, ['kind', 'nodeId']),
  ],
};

const tableMutationSuccessSchema: JsonSchema = objectSchema(
  {
    success: { const: true },
    table: blockNodeAddressSchema,
    trackedChangeRefs: arraySchema(entityAddressSchema),
  },
  ['success'],
);

/** Stricter variant for create.table — the table address is required on success. */
const createTableSuccessSchema: JsonSchema = objectSchema(
  {
    success: { const: true },
    table: blockNodeAddressSchema,
    trackedChangeRefs: arraySchema(entityAddressSchema),
  },
  ['success', 'table'],
);

const tableMutationFailureCodes = ['NO_OP', 'INVALID_TARGET', 'TARGET_NOT_FOUND', 'CAPABILITY_UNAVAILABLE'] as const;

const tableMutationFailureSchema: JsonSchema = objectSchema(
  {
    success: { const: false },
    failure: objectSchema(
      {
        code: { enum: [...tableMutationFailureCodes] },
        message: { type: 'string' },
        details: {},
      },
      ['code', 'message'],
    ),
  },
  ['success', 'failure'],
);

const tableMutationResultSchema: JsonSchema = {
  oneOf: [tableMutationSuccessSchema, tableMutationFailureSchema],
};

const createTableResultSchema: JsonSchema = {
  oneOf: [createTableSuccessSchema, tableMutationFailureSchema],
};

type FormatInlineAliasOperationId = `format.${(typeof INLINE_PROPERTY_REGISTRY)[number]['key']}`;

function supportsImplicitTrueValue(operationId: FormatInlineAliasOperationId): boolean {
  const key = operationId.slice('format.'.length);
  const entry = INLINE_PROPERTY_REGISTRY.find((candidate) => candidate.key === key);
  if (!entry) return false;
  return entry.type === 'boolean' || key === 'underline';
}

const formatInlineAliasOperationSchemas: Record<FormatInlineAliasOperationId, OperationSchemaSet> = Object.fromEntries(
  INLINE_PROPERTY_REGISTRY.map((entry) => {
    const operationId = `format.${entry.key}` as FormatInlineAliasOperationId;
    const requiredFields = supportsImplicitTrueValue(operationId) ? ['target'] : ['target', 'value'];
    const schema: OperationSchemaSet = {
      input: objectSchema(
        {
          target: textAddressSchema,
          value: entry.schema,
        },
        requiredFields,
      ),
      output: textMutationResultSchemaFor(operationId),
      success: textMutationSuccessSchema,
      failure: textMutationFailureSchemaFor(operationId),
    };
    return [operationId, schema];
  }),
) as Record<FormatInlineAliasOperationId, OperationSchemaSet>;

const operationSchemas: Record<OperationId, OperationSchemaSet> = {
  find: {
    input: findInputSchema,
    output: findOutputSchema,
  },
  getNode: {
    input: nodeAddressSchema,
    output: nodeInfoSchema,
  },
  getNodeById: {
    input: objectSchema(
      {
        nodeId: { type: 'string' },
        nodeType: { enum: [...blockNodeTypeValues] },
      },
      ['nodeId'],
    ),
    output: nodeInfoSchema,
  },
  getText: {
    input: strictEmptyObjectSchema,
    output: { type: 'string' },
  },
  info: {
    input: strictEmptyObjectSchema,
    output: documentInfoSchema,
  },
  insert: {
    input: insertInputSchema,
    output: textMutationResultSchemaFor('insert'),
    success: textMutationSuccessSchema,
    failure: textMutationFailureSchemaFor('insert'),
  },
  replace: {
    input: objectSchema(
      {
        target: textAddressSchema,
        text: { type: 'string' },
      },
      ['target', 'text'],
    ),
    output: textMutationResultSchemaFor('replace'),
    success: textMutationSuccessSchema,
    failure: textMutationFailureSchemaFor('replace'),
  },
  delete: {
    input: objectSchema(
      {
        target: textAddressSchema,
      },
      ['target'],
    ),
    output: textMutationResultSchemaFor('delete'),
    success: textMutationSuccessSchema,
    failure: textMutationFailureSchemaFor('delete'),
  },
  'format.apply': {
    input: objectSchema(
      {
        target: textAddressSchema,
        inline: buildInlineRunPatchSchema(),
      },
      ['target', 'inline'],
    ),
    output: textMutationResultSchemaFor('format.apply'),
    success: textMutationSuccessSchema,
    failure: textMutationFailureSchemaFor('format.apply'),
  },
  ...formatInlineAliasOperationSchemas,
  'format.align': {
    input: objectSchema(
      {
        target: textAddressSchema,
        alignment: { oneOf: [{ enum: [...ALIGNMENTS] }, { type: 'null' }] },
      },
      ['target', 'alignment'],
    ),
    output: textMutationResultSchemaFor('format.align'),
    success: textMutationSuccessSchema,
    failure: textMutationFailureSchemaFor('format.align'),
  },
  'blocks.delete': {
    input: objectSchema(
      {
        target: deletableBlockNodeAddressSchema,
      },
      ['target'],
    ),
    output: objectSchema(
      {
        success: { const: true },
        deleted: deletableBlockNodeAddressSchema,
      },
      ['success', 'deleted'],
    ),
    success: objectSchema(
      {
        success: { const: true },
        deleted: deletableBlockNodeAddressSchema,
      },
      ['success', 'deleted'],
    ),
    failure: preApplyFailureResultSchemaFor('blocks.delete'),
  },
  'styles.apply': (() => {
    // --- Sub-schemas for object properties (all require minProperties: 1) ---
    const fontFamilySchema = {
      ...objectSchema(
        {
          hint: { type: 'string' },
          ascii: { type: 'string' },
          hAnsi: { type: 'string' },
          eastAsia: { type: 'string' },
          cs: { type: 'string' },
          val: { type: 'string' },
          asciiTheme: { type: 'string' },
          hAnsiTheme: { type: 'string' },
          eastAsiaTheme: { type: 'string' },
          cstheme: { type: 'string' },
        },
        [],
      ),
      minProperties: 1,
    };
    const colorSchema = {
      ...objectSchema(
        {
          val: { type: 'string' },
          themeColor: { type: 'string' },
          themeTint: { type: 'string' },
          themeShade: { type: 'string' },
        },
        [],
      ),
      minProperties: 1,
    };
    const spacingSchema = {
      ...objectSchema(
        {
          after: { type: 'integer' },
          afterAutospacing: { type: 'boolean' },
          afterLines: { type: 'integer' },
          before: { type: 'integer' },
          beforeAutospacing: { type: 'boolean' },
          beforeLines: { type: 'integer' },
          line: { type: 'integer' },
          lineRule: { enum: ['auto', 'exact', 'atLeast'] },
        },
        [],
      ),
      minProperties: 1,
    };
    const indentSchema = {
      ...objectSchema(
        {
          end: { type: 'integer' },
          endChars: { type: 'integer' },
          firstLine: { type: 'integer' },
          firstLineChars: { type: 'integer' },
          hanging: { type: 'integer' },
          hangingChars: { type: 'integer' },
          left: { type: 'integer' },
          leftChars: { type: 'integer' },
          right: { type: 'integer' },
          rightChars: { type: 'integer' },
          start: { type: 'integer' },
          startChars: { type: 'integer' },
        },
        [],
      ),
      minProperties: 1,
    };

    // --- Run-channel input (channel: "run" → run patch) ---
    const runInputSchema = objectSchema(
      {
        target: objectSchema({ scope: { const: 'docDefaults' }, channel: { const: 'run' } }, ['scope', 'channel']),
        patch: {
          ...objectSchema(
            {
              bold: { type: 'boolean' },
              italic: { type: 'boolean' },
              fontSize: { type: 'integer' },
              fontSizeCs: { type: 'integer' },
              letterSpacing: { type: 'integer' },
              fontFamily: fontFamilySchema,
              color: colorSchema,
            },
            [],
          ),
          minProperties: 1,
        },
      },
      ['target', 'patch'],
    );

    // --- Paragraph-channel input (channel: "paragraph" → paragraph patch) ---
    const paragraphInputSchema = objectSchema(
      {
        target: objectSchema({ scope: { const: 'docDefaults' }, channel: { const: 'paragraph' } }, [
          'scope',
          'channel',
        ]),
        patch: {
          ...objectSchema(
            {
              justification: { enum: ['left', 'center', 'right', 'justify', 'distribute'] },
              spacing: spacingSchema,
              indent: indentSchema,
            },
            [],
          ),
          minProperties: 1,
        },
      },
      ['target', 'patch'],
    );

    // --- Resolution: discriminated by channel with concrete xmlPath values ---
    const stylesTargetResolutionSchema = objectSchema(
      {
        scope: { const: 'docDefaults' },
        channel: { enum: ['run', 'paragraph'] },
        xmlPart: { const: 'word/styles.xml' },
        xmlPath: { enum: ['w:styles/w:docDefaults/w:rPrDefault/w:rPr', 'w:styles/w:docDefaults/w:pPrDefault/w:pPr'] },
      },
      ['scope', 'channel', 'xmlPart', 'xmlPath'],
    );

    // --- Before/after state map for receipts ---
    const booleanStateSchema = { enum: ['on', 'off', 'inherit'] };
    const numberOrInheritSchema = { oneOf: [{ type: 'number' }, { const: 'inherit' }] };
    const stringOrInheritSchema = { oneOf: [{ type: 'string' }, { const: 'inherit' }] };
    const objectOrInheritSchema = { oneOf: [{ type: 'object' }, { const: 'inherit' }] };
    const stylesStateSchema = {
      type: 'object' as const,
      properties: {
        bold: booleanStateSchema,
        italic: booleanStateSchema,
        fontSize: numberOrInheritSchema,
        fontSizeCs: numberOrInheritSchema,
        letterSpacing: numberOrInheritSchema,
        fontFamily: objectOrInheritSchema,
        color: objectOrInheritSchema,
        justification: stringOrInheritSchema,
        spacing: objectOrInheritSchema,
        indent: objectOrInheritSchema,
      },
      additionalProperties: false,
    };

    const stylesSuccessSchema = objectSchema(
      {
        success: { const: true },
        changed: { type: 'boolean' },
        resolution: stylesTargetResolutionSchema,
        dryRun: { type: 'boolean' },
        before: stylesStateSchema,
        after: stylesStateSchema,
      },
      ['success', 'changed', 'resolution', 'dryRun', 'before', 'after'],
    );
    const stylesFailureSchema = objectSchema(
      {
        success: { const: false },
        resolution: stylesTargetResolutionSchema,
        failure: objectSchema(
          {
            code: { type: 'string' },
            message: { type: 'string' },
            details: {},
          },
          ['code', 'message'],
        ),
      },
      ['success', 'resolution', 'failure'],
    );
    return {
      // Discriminated input: oneOf with channel as the discriminator
      input: { oneOf: [runInputSchema, paragraphInputSchema] },
      output: { oneOf: [stylesSuccessSchema, stylesFailureSchema] },
      success: stylesSuccessSchema,
      failure: stylesFailureSchema,
    };
  })(),
  'create.paragraph': {
    input: objectSchema({
      at: {
        oneOf: [
          objectSchema({ kind: { const: 'documentStart' } }, ['kind']),
          objectSchema({ kind: { const: 'documentEnd' } }, ['kind']),
          objectSchema(
            {
              kind: { const: 'before' },
              target: blockNodeAddressSchema,
            },
            ['kind', 'target'],
          ),
          objectSchema(
            {
              kind: { const: 'after' },
              target: blockNodeAddressSchema,
            },
            ['kind', 'target'],
          ),
        ],
      },
      text: { type: 'string' },
    }),
    output: createParagraphResultSchemaFor('create.paragraph'),
    success: createParagraphSuccessSchema,
    failure: createParagraphFailureSchemaFor('create.paragraph'),
  },
  'create.heading': {
    input: objectSchema(
      {
        level: headingLevelSchema,
        at: {
          oneOf: [
            objectSchema({ kind: { const: 'documentStart' } }, ['kind']),
            objectSchema({ kind: { const: 'documentEnd' } }, ['kind']),
            objectSchema(
              {
                kind: { const: 'before' },
                target: blockNodeAddressSchema,
              },
              ['kind', 'target'],
            ),
            objectSchema(
              {
                kind: { const: 'after' },
                target: blockNodeAddressSchema,
              },
              ['kind', 'target'],
            ),
          ],
        },
        text: { type: 'string' },
      },
      ['level'],
    ),
    output: createHeadingResultSchemaFor('create.heading'),
    success: createHeadingSuccessSchema,
    failure: createHeadingFailureSchemaFor('create.heading'),
  },
  'create.sectionBreak': {
    input: objectSchema({
      at: {
        oneOf: [
          objectSchema({ kind: { const: 'documentStart' } }, ['kind']),
          objectSchema({ kind: { const: 'documentEnd' } }, ['kind']),
          objectSchema(
            {
              kind: { const: 'before' },
              target: blockNodeAddressSchema,
            },
            ['kind', 'target'],
          ),
          objectSchema(
            {
              kind: { const: 'after' },
              target: blockNodeAddressSchema,
            },
            ['kind', 'target'],
          ),
        ],
      },
      breakType: sectionBreakTypeSchema,
      pageMargins: sectionPageMarginsSchema,
      headerFooterMargins: sectionHeaderFooterMarginsSchema,
    }),
    output: createSectionBreakResultSchemaFor('create.sectionBreak'),
    success: createSectionBreakSuccessSchema,
    failure: createSectionBreakFailureSchemaFor('create.sectionBreak'),
  },
  'sections.list': {
    input: objectSchema({
      limit: { type: 'integer', minimum: 1 },
      offset: { type: 'integer', minimum: 0 },
    }),
    output: sectionsListResultSchema,
  },
  'sections.get': {
    input: objectSchema({ address: sectionAddressSchema }, ['address']),
    output: sectionInfoSchema,
  },
  'sections.setBreakType': {
    input: objectSchema(
      {
        target: sectionAddressSchema,
        breakType: sectionBreakTypeSchema,
      },
      ['target', 'breakType'],
    ),
    output: sectionMutationResultSchemaFor('sections.setBreakType'),
    success: sectionMutationSuccessSchema,
    failure: sectionMutationFailureSchemaFor('sections.setBreakType'),
  },
  'sections.setPageMargins': {
    input: {
      ...objectSchema(
        {
          target: sectionAddressSchema,
          top: { type: 'number', minimum: 0 },
          right: { type: 'number', minimum: 0 },
          bottom: { type: 'number', minimum: 0 },
          left: { type: 'number', minimum: 0 },
          gutter: { type: 'number', minimum: 0 },
        },
        ['target'],
      ),
      oneOf: [
        { required: ['target', 'top'] },
        { required: ['target', 'right'] },
        { required: ['target', 'bottom'] },
        { required: ['target', 'left'] },
        { required: ['target', 'gutter'] },
      ],
    },
    output: sectionMutationResultSchemaFor('sections.setPageMargins'),
    success: sectionMutationSuccessSchema,
    failure: sectionMutationFailureSchemaFor('sections.setPageMargins'),
  },
  'sections.setHeaderFooterMargins': {
    input: {
      ...objectSchema(
        {
          target: sectionAddressSchema,
          header: { type: 'number', minimum: 0 },
          footer: { type: 'number', minimum: 0 },
        },
        ['target'],
      ),
      oneOf: [{ required: ['target', 'header'] }, { required: ['target', 'footer'] }],
    },
    output: sectionMutationResultSchemaFor('sections.setHeaderFooterMargins'),
    success: sectionMutationSuccessSchema,
    failure: sectionMutationFailureSchemaFor('sections.setHeaderFooterMargins'),
  },
  'sections.setPageSetup': {
    input: {
      ...objectSchema(
        {
          target: sectionAddressSchema,
          width: { type: 'number', minimum: 0 },
          height: { type: 'number', minimum: 0 },
          orientation: sectionOrientationSchema,
          paperSize: { type: 'string', minLength: 1 },
        },
        ['target'],
      ),
      oneOf: [
        { required: ['target', 'width'] },
        { required: ['target', 'height'] },
        { required: ['target', 'orientation'] },
        { required: ['target', 'paperSize'] },
      ],
    },
    output: sectionMutationResultSchemaFor('sections.setPageSetup'),
    success: sectionMutationSuccessSchema,
    failure: sectionMutationFailureSchemaFor('sections.setPageSetup'),
  },
  'sections.setColumns': {
    input: {
      ...objectSchema(
        {
          target: sectionAddressSchema,
          count: { type: 'integer', minimum: 1 },
          gap: { type: 'number', minimum: 0 },
          equalWidth: { type: 'boolean' },
        },
        ['target'],
      ),
      oneOf: [
        { required: ['target', 'count'] },
        { required: ['target', 'gap'] },
        { required: ['target', 'equalWidth'] },
      ],
    },
    output: sectionMutationResultSchemaFor('sections.setColumns'),
    success: sectionMutationSuccessSchema,
    failure: sectionMutationFailureSchemaFor('sections.setColumns'),
  },
  'sections.setLineNumbering': {
    input: objectSchema(
      {
        target: sectionAddressSchema,
        enabled: { type: 'boolean' },
        countBy: { type: 'integer', minimum: 1 },
        start: { type: 'integer', minimum: 1 },
        distance: { type: 'number', minimum: 0 },
        restart: sectionLineNumberRestartSchema,
      },
      ['target', 'enabled'],
    ),
    output: sectionMutationResultSchemaFor('sections.setLineNumbering'),
    success: sectionMutationSuccessSchema,
    failure: sectionMutationFailureSchemaFor('sections.setLineNumbering'),
  },
  'sections.setPageNumbering': {
    input: {
      ...objectSchema(
        {
          target: sectionAddressSchema,
          start: { type: 'integer', minimum: 1 },
          format: sectionPageNumberFormatSchema,
        },
        ['target'],
      ),
      oneOf: [{ required: ['target', 'start'] }, { required: ['target', 'format'] }],
    },
    output: sectionMutationResultSchemaFor('sections.setPageNumbering'),
    success: sectionMutationSuccessSchema,
    failure: sectionMutationFailureSchemaFor('sections.setPageNumbering'),
  },
  'sections.setTitlePage': {
    input: objectSchema(
      {
        target: sectionAddressSchema,
        enabled: { type: 'boolean' },
      },
      ['target', 'enabled'],
    ),
    output: sectionMutationResultSchemaFor('sections.setTitlePage'),
    success: sectionMutationSuccessSchema,
    failure: sectionMutationFailureSchemaFor('sections.setTitlePage'),
  },
  'sections.setOddEvenHeadersFooters': {
    input: objectSchema({ enabled: { type: 'boolean' } }, ['enabled']),
    output: documentMutationResultSchemaFor('sections.setOddEvenHeadersFooters'),
    success: documentMutationSuccessSchema,
    failure: sectionMutationFailureSchemaFor('sections.setOddEvenHeadersFooters'),
  },
  'sections.setVerticalAlign': {
    input: objectSchema(
      {
        target: sectionAddressSchema,
        value: sectionVerticalAlignSchema,
      },
      ['target', 'value'],
    ),
    output: sectionMutationResultSchemaFor('sections.setVerticalAlign'),
    success: sectionMutationSuccessSchema,
    failure: sectionMutationFailureSchemaFor('sections.setVerticalAlign'),
  },
  'sections.setSectionDirection': {
    input: objectSchema(
      {
        target: sectionAddressSchema,
        direction: sectionDirectionSchema,
      },
      ['target', 'direction'],
    ),
    output: sectionMutationResultSchemaFor('sections.setSectionDirection'),
    success: sectionMutationSuccessSchema,
    failure: sectionMutationFailureSchemaFor('sections.setSectionDirection'),
  },
  'sections.setHeaderFooterRef': {
    input: objectSchema(
      {
        target: sectionAddressSchema,
        kind: sectionHeaderFooterKindSchema,
        variant: sectionHeaderFooterVariantSchema,
        refId: { type: 'string', minLength: 1 },
      },
      ['target', 'kind', 'variant', 'refId'],
    ),
    output: sectionMutationResultSchemaFor('sections.setHeaderFooterRef'),
    success: sectionMutationSuccessSchema,
    failure: sectionMutationFailureSchemaFor('sections.setHeaderFooterRef'),
  },
  'sections.clearHeaderFooterRef': {
    input: objectSchema(
      {
        target: sectionAddressSchema,
        kind: sectionHeaderFooterKindSchema,
        variant: sectionHeaderFooterVariantSchema,
      },
      ['target', 'kind', 'variant'],
    ),
    output: sectionMutationResultSchemaFor('sections.clearHeaderFooterRef'),
    success: sectionMutationSuccessSchema,
    failure: sectionMutationFailureSchemaFor('sections.clearHeaderFooterRef'),
  },
  'sections.setLinkToPrevious': {
    input: objectSchema(
      {
        target: sectionAddressSchema,
        kind: sectionHeaderFooterKindSchema,
        variant: sectionHeaderFooterVariantSchema,
        linked: { type: 'boolean' },
      },
      ['target', 'kind', 'variant', 'linked'],
    ),
    output: sectionMutationResultSchemaFor('sections.setLinkToPrevious'),
    success: sectionMutationSuccessSchema,
    failure: sectionMutationFailureSchemaFor('sections.setLinkToPrevious'),
  },
  'sections.setPageBorders': {
    input: objectSchema(
      {
        target: sectionAddressSchema,
        borders: sectionPageBordersSchema,
      },
      ['target', 'borders'],
    ),
    output: sectionMutationResultSchemaFor('sections.setPageBorders'),
    success: sectionMutationSuccessSchema,
    failure: sectionMutationFailureSchemaFor('sections.setPageBorders'),
  },
  'sections.clearPageBorders': {
    input: objectSchema({ target: sectionAddressSchema }, ['target']),
    output: sectionMutationResultSchemaFor('sections.clearPageBorders'),
    success: sectionMutationSuccessSchema,
    failure: sectionMutationFailureSchemaFor('sections.clearPageBorders'),
  },
  'lists.list': {
    input: objectSchema({
      within: blockNodeAddressSchema,
      limit: { type: 'integer' },
      offset: { type: 'integer' },
      kind: listKindSchema,
      level: { type: 'integer' },
      ordinal: { type: 'integer' },
    }),
    output: listsListResultSchema,
  },
  'lists.get': {
    input: objectSchema({ address: listItemAddressSchema }, ['address']),
    output: listItemInfoSchema,
  },
  'lists.insert': {
    input: objectSchema(
      {
        target: listItemAddressSchema,
        position: listInsertPositionSchema,
        text: { type: 'string' },
      },
      ['target', 'position'],
    ),
    output: listsInsertResultSchemaFor('lists.insert'),
    success: listsInsertSuccessSchema,
    failure: listsFailureSchemaFor('lists.insert'),
  },
  'lists.setType': {
    input: objectSchema(
      {
        target: listItemAddressSchema,
        kind: listKindSchema,
      },
      ['target', 'kind'],
    ),
    output: listsMutateItemResultSchemaFor('lists.setType'),
    success: listsMutateItemSuccessSchema,
    failure: listsFailureSchemaFor('lists.setType'),
  },
  'lists.indent': {
    input: objectSchema(
      {
        target: listItemAddressSchema,
      },
      ['target'],
    ),
    output: listsMutateItemResultSchemaFor('lists.indent'),
    success: listsMutateItemSuccessSchema,
    failure: listsFailureSchemaFor('lists.indent'),
  },
  'lists.outdent': {
    input: objectSchema(
      {
        target: listItemAddressSchema,
      },
      ['target'],
    ),
    output: listsMutateItemResultSchemaFor('lists.outdent'),
    success: listsMutateItemSuccessSchema,
    failure: listsFailureSchemaFor('lists.outdent'),
  },
  'lists.restart': {
    input: objectSchema(
      {
        target: listItemAddressSchema,
      },
      ['target'],
    ),
    output: listsMutateItemResultSchemaFor('lists.restart'),
    success: listsMutateItemSuccessSchema,
    failure: listsFailureSchemaFor('lists.restart'),
  },
  'lists.exit': {
    input: objectSchema(
      {
        target: listItemAddressSchema,
      },
      ['target'],
    ),
    output: listsExitResultSchemaFor('lists.exit'),
    success: listsExitSuccessSchema,
    failure: listsFailureSchemaFor('lists.exit'),
  },
  'comments.create': {
    input: objectSchema(
      {
        text: { type: 'string' },
        target: textAddressSchema,
        parentCommentId: { type: 'string' },
      },
      ['text'],
    ),
    output: receiptResultSchemaFor('comments.create'),
    success: receiptSuccessSchema,
    failure: receiptFailureResultSchemaFor('comments.create'),
  },
  'comments.patch': {
    input: objectSchema(
      {
        commentId: { type: 'string' },
        text: { type: 'string' },
        target: textAddressSchema,
        status: { enum: ['resolved'] },
        isInternal: { type: 'boolean' },
      },
      ['commentId'],
    ),
    output: receiptResultSchemaFor('comments.patch'),
    success: receiptSuccessSchema,
    failure: receiptFailureResultSchemaFor('comments.patch'),
  },
  'comments.delete': {
    input: objectSchema({ commentId: { type: 'string' } }, ['commentId']),
    output: receiptResultSchemaFor('comments.delete'),
    success: receiptSuccessSchema,
    failure: receiptFailureResultSchemaFor('comments.delete'),
  },
  'comments.get': {
    input: objectSchema({ commentId: { type: 'string' } }, ['commentId']),
    output: commentInfoSchema,
  },
  'comments.list': {
    input: objectSchema({
      includeResolved: { type: 'boolean' },
      limit: { type: 'integer' },
      offset: { type: 'integer' },
    }),
    output: commentsListResultSchema,
  },
  'trackChanges.list': {
    input: objectSchema({
      limit: { type: 'integer' },
      offset: { type: 'integer' },
      type: { enum: ['insert', 'delete', 'format'] },
    }),
    output: trackChangesListResultSchema,
  },
  'trackChanges.get': {
    input: objectSchema({ id: { type: 'string' } }, ['id']),
    output: trackChangeInfoSchema,
  },
  'trackChanges.decide': {
    input: {
      type: 'object',
      properties: {
        decision: { enum: ['accept', 'reject'] },
        target: {
          oneOf: [
            objectSchema({ id: { type: 'string' } }, ['id']),
            objectSchema({ scope: { enum: ['all'] } }, ['scope']),
          ],
        },
      },
      required: ['decision', 'target'],
      additionalProperties: false,
    },
    output: receiptResultSchemaFor('trackChanges.decide'),
    success: receiptSuccessSchema,
    failure: receiptFailureResultSchemaFor('trackChanges.decide'),
  },
  'query.match': {
    input: objectSchema(
      {
        select: { oneOf: [textSelectorSchema, nodeSelectorSchema] },
        within: nodeAddressSchema,
        require: { enum: ['any', 'first', 'exactlyOne', 'all'] },
        mode: { enum: ['strict', 'candidates'] },
        includeNodes: { type: 'boolean' },
        limit: { type: 'integer', minimum: 1 },
        offset: { type: 'integer', minimum: 0 },
      },
      ['select'],
    ),
    output: (() => {
      // D18: discriminated union schema for TextMatchDomain vs NodeMatchDomain.
      // Text matches require snippet + highlightRange + non-empty blocks.
      // Node matches forbid snippet + highlightRange and have empty blocks.

      // Text match item: id + handle + address + snippet + highlightRange + non-empty blocks
      const textMatchItemSchema = discoveryItemSchema(
        {
          matchKind: { const: 'text' },
          address: nodeAddressSchema,
          snippet: { type: 'string' },
          highlightRange: rangeSchema,
          blocks: { type: 'array', items: matchBlockSchema, minItems: 1 },
        },
        ['matchKind', 'address', 'snippet', 'highlightRange', 'blocks'],
      );

      // Node match item: id + handle + address + empty blocks
      const nodeMatchItemSchema = discoveryItemSchema(
        {
          matchKind: { const: 'node' },
          address: nodeAddressSchema,
          blocks: { type: 'array', items: matchBlockSchema, maxItems: 0 },
        },
        ['matchKind', 'address', 'blocks'],
      );

      // query.match meta schema — effectiveResolved is required.
      const queryMatchMetaSchema = objectSchema({ effectiveResolved: { type: 'boolean' } }, ['effectiveResolved']);

      return discoveryResultSchema({ oneOf: [textMatchItemSchema, nodeMatchItemSchema] }, queryMatchMetaSchema);
    })(),
  },
  'mutations.preview': {
    input: objectSchema(
      {
        expectedRevision: { type: 'string' },
        atomic: { const: true },
        changeMode: { enum: ['direct', 'tracked'] },
        steps: arraySchema({ type: 'object' }),
      },
      ['expectedRevision', 'atomic', 'changeMode', 'steps'],
    ),
    output: objectSchema(
      {
        evaluatedRevision: { type: 'string' },
        steps: arraySchema({ type: 'object' }),
        valid: { type: 'boolean' },
        failures: arraySchema({ type: 'object' }),
      },
      ['evaluatedRevision', 'steps', 'valid'],
    ),
  },
  'mutations.apply': {
    input: objectSchema(
      {
        expectedRevision: { type: 'string' },
        atomic: { const: true },
        changeMode: { enum: ['direct', 'tracked'] },
        steps: arraySchema({ type: 'object' }),
      },
      ['expectedRevision', 'atomic', 'changeMode', 'steps'],
    ),
    output: objectSchema(
      {
        success: { const: true },
        revision: objectSchema({ before: { type: 'string' }, after: { type: 'string' } }, ['before', 'after']),
        steps: arraySchema({ type: 'object' }),
        trackedChanges: arraySchema({ type: 'object' }),
        timing: objectSchema({ totalMs: { type: 'number' } }, ['totalMs']),
      },
      ['success', 'revision', 'steps', 'timing'],
    ),
    success: objectSchema(
      {
        success: { const: true },
        revision: objectSchema({ before: { type: 'string' }, after: { type: 'string' } }, ['before', 'after']),
        steps: arraySchema({ type: 'object' }),
        timing: objectSchema({ totalMs: { type: 'number' } }, ['totalMs']),
      },
      ['success', 'revision', 'steps', 'timing'],
    ),
    // `mutations.apply` throws pre-apply plan-engine errors rather than returning
    // receipt-style non-applied failures, but SDK contract consumers still require
    // an explicit failure schema descriptor for mutation operations.
    failure: preApplyFailureResultSchemaFor('mutations.apply'),
  },
  'capabilities.get': {
    input: strictEmptyObjectSchema,
    output: capabilitiesOutputSchema,
  },

  // --- create.table ---
  'create.table': {
    input: objectSchema(
      {
        rows: { type: 'integer', minimum: 1 },
        columns: { type: 'integer', minimum: 1 },
        at: tableCreateLocationSchema,
      },
      ['rows', 'columns'],
    ),
    output: createTableResultSchema,
    success: createTableSuccessSchema,
    failure: tableMutationFailureSchema,
  },

  // --- tables: lifecycle ---
  'tables.convertFromText': {
    input: {
      ...objectSchema({
        target: blockNodeAddressSchema,
        nodeId: { type: 'string' },
        delimiter: {
          oneOf: [
            { enum: ['tab', 'comma', 'paragraph'] },
            objectSchema({ custom: { type: 'string', minLength: 1, maxLength: 1 } }, ['custom']),
          ],
        },
        columns: { type: 'integer', minimum: 1 },
        inferColumns: { type: 'boolean' },
      }),
      oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
    },
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },
  'tables.delete': {
    input: tableLocatorSchema,
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },
  'tables.clearContents': {
    input: tableLocatorSchema,
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },
  'tables.move': {
    input: {
      ...objectSchema(
        {
          target: blockNodeAddressSchema,
          nodeId: { type: 'string' },
          destination: tableCreateLocationSchema,
        },
        ['destination'],
      ),
      oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
    },
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },
  'tables.split': {
    input: {
      ...objectSchema(
        {
          target: blockNodeAddressSchema,
          nodeId: { type: 'string' },
          atRowIndex: { type: 'integer', minimum: 1 },
        },
        ['atRowIndex'],
      ),
      oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
    },
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },
  'tables.convertToText': {
    input: {
      ...objectSchema({
        target: blockNodeAddressSchema,
        nodeId: { type: 'string' },
        delimiter: { enum: ['tab', 'comma', 'paragraph'] },
      }),
      oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
    },
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },

  // --- tables: layout ---
  'tables.setLayout': {
    input: {
      ...objectSchema({
        target: blockNodeAddressSchema,
        nodeId: { type: 'string' },
        preferredWidth: { type: 'number' },
        alignment: { enum: ['left', 'center', 'right'] },
        leftIndentPt: { type: 'number' },
        autoFitMode: { enum: ['fixedWidth', 'fitContents', 'fitWindow'] },
        tableDirection: { enum: ['ltr', 'rtl'] },
      }),
      oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
    },
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },

  // --- tables: row structure ---
  'tables.insertRow': {
    input: {
      ...objectSchema(
        {
          target: blockNodeAddressSchema,
          nodeId: { type: 'string' },
          tableTarget: blockNodeAddressSchema,
          tableNodeId: { type: 'string' },
          rowIndex: { type: 'integer', minimum: 0 },
          position: { enum: ['above', 'below'] },
          count: { type: 'integer', minimum: 1 },
        },
        ['position'],
      ),
      oneOf: mixedRowLocatorOneOf,
    },
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },
  'tables.deleteRow': {
    input: {
      ...objectSchema({
        target: blockNodeAddressSchema,
        nodeId: { type: 'string' },
        tableTarget: blockNodeAddressSchema,
        tableNodeId: { type: 'string' },
        rowIndex: { type: 'integer', minimum: 0 },
      }),
      oneOf: mixedRowLocatorOneOf,
    },
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },
  'tables.setRowHeight': {
    input: {
      ...objectSchema(
        {
          target: blockNodeAddressSchema,
          nodeId: { type: 'string' },
          tableTarget: blockNodeAddressSchema,
          tableNodeId: { type: 'string' },
          rowIndex: { type: 'integer', minimum: 0 },
          heightPt: { type: 'number', exclusiveMinimum: 0 },
          rule: { enum: ['atLeast', 'exact', 'auto'] },
        },
        ['heightPt', 'rule'],
      ),
      oneOf: mixedRowLocatorOneOf,
    },
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },
  'tables.distributeRows': {
    input: tableLocatorSchema,
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },
  'tables.setRowOptions': {
    input: {
      ...objectSchema({
        target: blockNodeAddressSchema,
        nodeId: { type: 'string' },
        tableTarget: blockNodeAddressSchema,
        tableNodeId: { type: 'string' },
        rowIndex: { type: 'integer', minimum: 0 },
        allowBreakAcrossPages: { type: 'boolean' },
        repeatHeader: { type: 'boolean' },
      }),
      oneOf: mixedRowLocatorOneOf,
    },
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },

  // --- tables: column structure ---
  'tables.insertColumn': {
    input: {
      ...objectSchema(
        {
          tableTarget: blockNodeAddressSchema,
          tableNodeId: { type: 'string' },
          columnIndex: { type: 'integer', minimum: 0 },
          position: { enum: ['left', 'right'] },
          count: { type: 'integer', minimum: 1 },
        },
        ['columnIndex', 'position'],
      ),
      oneOf: [{ required: ['tableTarget'] }, { required: ['tableNodeId'] }],
    },
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },
  'tables.deleteColumn': {
    input: {
      ...objectSchema(
        {
          tableTarget: blockNodeAddressSchema,
          tableNodeId: { type: 'string' },
          columnIndex: { type: 'integer', minimum: 0 },
        },
        ['columnIndex'],
      ),
      oneOf: [{ required: ['tableTarget'] }, { required: ['tableNodeId'] }],
    },
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },
  'tables.setColumnWidth': {
    input: {
      ...objectSchema(
        {
          tableTarget: blockNodeAddressSchema,
          tableNodeId: { type: 'string' },
          columnIndex: { type: 'integer', minimum: 0 },
          widthPt: { type: 'number', exclusiveMinimum: 0 },
        },
        ['columnIndex', 'widthPt'],
      ),
      oneOf: [{ required: ['tableTarget'] }, { required: ['tableNodeId'] }],
    },
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },
  'tables.distributeColumns': {
    input: {
      ...objectSchema({
        target: blockNodeAddressSchema,
        nodeId: { type: 'string' },
        columnRange: objectSchema({ start: { type: 'integer', minimum: 0 }, end: { type: 'integer', minimum: 0 } }, [
          'start',
          'end',
        ]),
      }),
      oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
    },
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },

  // --- tables: cell structure ---
  'tables.insertCell': {
    input: {
      ...objectSchema(
        {
          target: blockNodeAddressSchema,
          nodeId: { type: 'string' },
          mode: { enum: ['shiftRight', 'shiftDown'] },
        },
        ['mode'],
      ),
      oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
    },
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },
  'tables.deleteCell': {
    input: {
      ...objectSchema(
        {
          target: blockNodeAddressSchema,
          nodeId: { type: 'string' },
          mode: { enum: ['shiftLeft', 'shiftUp'] },
        },
        ['mode'],
      ),
      oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
    },
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },
  'tables.mergeCells': {
    input: mergeRangeLocatorSchema,
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },
  'tables.unmergeCells': {
    input: tableLocatorSchema,
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },
  'tables.splitCell': {
    input: {
      ...objectSchema(
        {
          target: blockNodeAddressSchema,
          nodeId: { type: 'string' },
          rows: { type: 'integer', minimum: 1 },
          columns: { type: 'integer', minimum: 1 },
        },
        ['rows', 'columns'],
      ),
      oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
    },
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },
  'tables.setCellProperties': {
    input: {
      ...objectSchema({
        target: blockNodeAddressSchema,
        nodeId: { type: 'string' },
        preferredWidthPt: { type: 'number' },
        verticalAlign: { enum: ['top', 'center', 'bottom'] },
        wrapText: { type: 'boolean' },
        fitText: { type: 'boolean' },
      }),
      oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
    },
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },

  // --- tables: data + accessibility ---
  'tables.sort': {
    input: {
      ...objectSchema(
        {
          target: blockNodeAddressSchema,
          nodeId: { type: 'string' },
          keys: arraySchema(
            objectSchema(
              {
                columnIndex: { type: 'integer', minimum: 0 },
                direction: { enum: ['ascending', 'descending'] },
                type: { enum: ['text', 'number', 'date'] },
              },
              ['columnIndex', 'direction', 'type'],
            ),
          ),
        },
        ['keys'],
      ),
      oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
    },
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },
  'tables.setAltText': {
    input: {
      ...objectSchema({
        target: blockNodeAddressSchema,
        nodeId: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
      }),
      oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
    },
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },

  // --- tables: style ---
  'tables.setStyle': {
    input: {
      ...objectSchema(
        {
          target: blockNodeAddressSchema,
          nodeId: { type: 'string' },
          styleId: { type: 'string' },
        },
        ['styleId'],
      ),
      oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
    },
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },
  'tables.clearStyle': {
    input: tableLocatorSchema,
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },
  'tables.setStyleOption': {
    input: {
      ...objectSchema(
        {
          target: blockNodeAddressSchema,
          nodeId: { type: 'string' },
          flag: { enum: ['headerRow', 'totalRow', 'firstColumn', 'lastColumn', 'bandedRows', 'bandedColumns'] },
          enabled: { type: 'boolean' },
        },
        ['flag', 'enabled'],
      ),
      oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
    },
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },
  'tables.setBorder': {
    input: {
      ...objectSchema(
        {
          target: blockNodeAddressSchema,
          nodeId: { type: 'string' },
          edge: { enum: ['top', 'bottom', 'left', 'right', 'insideH', 'insideV', 'diagonalDown', 'diagonalUp'] },
          lineStyle: { type: 'string' },
          lineWeightPt: { type: 'number', exclusiveMinimum: 0 },
          color: { type: 'string', pattern: '^([0-9A-Fa-f]{6}|auto)$' },
        },
        ['edge', 'lineStyle', 'lineWeightPt', 'color'],
      ),
      oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
    },
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },
  'tables.clearBorder': {
    input: {
      ...objectSchema(
        {
          target: blockNodeAddressSchema,
          nodeId: { type: 'string' },
          edge: { enum: ['top', 'bottom', 'left', 'right', 'insideH', 'insideV', 'diagonalDown', 'diagonalUp'] },
        },
        ['edge'],
      ),
      oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
    },
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },
  'tables.applyBorderPreset': {
    input: {
      ...objectSchema(
        {
          target: blockNodeAddressSchema,
          nodeId: { type: 'string' },
          preset: { enum: ['box', 'all', 'none', 'grid', 'custom'] },
        },
        ['preset'],
      ),
      oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
    },
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },
  'tables.setShading': {
    input: {
      ...objectSchema(
        {
          target: blockNodeAddressSchema,
          nodeId: { type: 'string' },
          color: { type: 'string', pattern: '^([0-9A-Fa-f]{6}|auto)$' },
        },
        ['color'],
      ),
      oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
    },
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },
  'tables.clearShading': {
    input: tableLocatorSchema,
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },
  'tables.setTablePadding': {
    input: {
      ...objectSchema(
        {
          target: blockNodeAddressSchema,
          nodeId: { type: 'string' },
          topPt: { type: 'number', minimum: 0 },
          rightPt: { type: 'number', minimum: 0 },
          bottomPt: { type: 'number', minimum: 0 },
          leftPt: { type: 'number', minimum: 0 },
        },
        ['topPt', 'rightPt', 'bottomPt', 'leftPt'],
      ),
      oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
    },
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },
  'tables.setCellPadding': {
    input: {
      ...objectSchema(
        {
          target: blockNodeAddressSchema,
          nodeId: { type: 'string' },
          topPt: { type: 'number', minimum: 0 },
          rightPt: { type: 'number', minimum: 0 },
          bottomPt: { type: 'number', minimum: 0 },
          leftPt: { type: 'number', minimum: 0 },
        },
        ['topPt', 'rightPt', 'bottomPt', 'leftPt'],
      ),
      oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
    },
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },
  'tables.setCellSpacing': {
    input: {
      ...objectSchema(
        {
          target: blockNodeAddressSchema,
          nodeId: { type: 'string' },
          spacingPt: { type: 'number', minimum: 0 },
        },
        ['spacingPt'],
      ),
      oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
    },
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },
  'tables.clearCellSpacing': {
    input: tableLocatorSchema,
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },

  // --- tables.* reads (B4 ref handoff) ---

  'tables.get': {
    input: tableLocatorSchema,
    output: objectSchema(
      {
        nodeId: { type: 'string' },
        address: blockNodeAddressSchema,
        rows: { type: 'integer', minimum: 0 },
        columns: { type: 'integer', minimum: 0 },
      },
      ['nodeId', 'address', 'rows', 'columns'],
    ),
  },
  'tables.getCells': {
    input: {
      ...objectSchema({
        target: blockNodeAddressSchema,
        nodeId: { type: 'string' },
        rowIndex: { type: 'integer', minimum: 0 },
        columnIndex: { type: 'integer', minimum: 0 },
      }),
      oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
    },
    output: objectSchema(
      {
        tableNodeId: { type: 'string' },
        cells: {
          type: 'array',
          items: objectSchema(
            {
              nodeId: { type: 'string' },
              rowIndex: { type: 'integer', minimum: 0 },
              columnIndex: { type: 'integer', minimum: 0 },
              colspan: { type: 'integer', minimum: 1 },
              rowspan: { type: 'integer', minimum: 1 },
            },
            ['nodeId', 'rowIndex', 'columnIndex', 'colspan', 'rowspan'],
          ),
        },
      },
      ['tableNodeId', 'cells'],
    ),
  },
  'tables.getProperties': {
    input: tableLocatorSchema,
    output: objectSchema(
      {
        nodeId: { type: 'string' },
        styleId: { type: 'string' },
        alignment: { enum: ['left', 'center', 'right'] },
        direction: { enum: ['ltr', 'rtl'] },
        preferredWidth: { type: 'number' },
        autoFitMode: { enum: ['fixedWidth', 'fitContents', 'fitWindow'] },
        styleOptions: objectSchema({
          headerRow: { type: 'boolean' },
          totalRow: { type: 'boolean' },
          firstColumn: { type: 'boolean' },
          lastColumn: { type: 'boolean' },
          bandedRows: { type: 'boolean' },
          bandedColumns: { type: 'boolean' },
        }),
      },
      ['nodeId'],
    ),
  },
};

/**
 * Builds the complete set of JSON Schema definitions for every document-api operation.
 *
 * Validates that every {@link OperationId} has a corresponding schema entry and
 * that no unknown operations are present.
 *
 * @returns A versioned {@link InternalContractSchemas} envelope.
 * @throws {Error} If any operation is missing a schema or an unknown operation is found.
 */
export function buildInternalContractSchemas(): InternalContractSchemas {
  const operations = { ...operationSchemas };

  for (const operationId of OPERATION_IDS) {
    if (!operations[operationId]) {
      throw new Error(`Schema generation missing operation "${operationId}".`);
    }
  }

  for (const operationId of Object.keys(operations) as OperationId[]) {
    if (!COMMAND_CATALOG[operationId]) {
      throw new Error(`Schema generation encountered unknown operation "${operationId}".`);
    }
  }

  return {
    $schema: JSON_SCHEMA_DIALECT,
    contractVersion: CONTRACT_VERSION,
    $defs: SHARED_DEFS,
    operations,
  };
}
