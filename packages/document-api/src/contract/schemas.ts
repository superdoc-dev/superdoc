import { COMMAND_CATALOG } from './command-catalog.js';
import { CONTRACT_VERSION, JSON_SCHEMA_DIALECT, OPERATION_IDS, type OperationId } from './types.js';
import { NODE_TYPES, BLOCK_NODE_TYPES, INLINE_NODE_TYPES } from '../types/base.js';
import { MARK_KEYS } from '../types/style-policy.types.js';
import { ALIGNMENTS } from '../format/format.js';

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
          bold: { type: 'boolean' },
          italic: { type: 'boolean' },
          underline: { type: 'boolean' },
          strike: { type: 'boolean' },
          color: { type: 'string' },
          highlight: { type: 'string' },
          fontFamily: { type: 'string' },
          fontSizePt: { type: 'number' },
        },
        ['bold', 'italic', 'underline', 'strike'],
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
const paragraphAddressSchema = ref('ParagraphAddress');
const headingAddressSchema = ref('HeadingAddress');
const listItemAddressSchema = ref('ListItemAddress');
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
 */
function discoveryResultSchema(itemSchema: JsonSchema): JsonSchema {
  return objectSchema(
    {
      evaluatedRevision: { type: 'string' },
      total: { type: 'integer', minimum: 0 },
      items: arraySchema(itemSchema),
      page: pageInfoSchema,
    },
    ['evaluatedRevision', 'total', 'items', 'page'],
  );
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
  },
  ['counts', 'outline', 'capabilities'],
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
    'OPERATION_UNAVAILABLE',
    'TRACKED_MODE_UNAVAILABLE',
    'DRY_RUN_UNAVAILABLE',
    'NAMESPACE_UNAVAILABLE',
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

const formatCapabilitiesSchema = objectSchema(
  {
    supportedMarks: arraySchema({ type: 'string', enum: [...MARK_KEYS] }),
  },
  ['supportedMarks'],
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
  },
  ['global', 'format', 'operations'],
);

const strictEmptyObjectSchema = objectSchema({});

const insertInputSchema = objectSchema(
  {
    target: textAddressSchema,
    text: { type: 'string' },
  },
  ['text'],
);

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
        inline: (() => {
          const markProperties = Object.fromEntries(
            MARK_KEYS.map((key) => [key, { type: 'boolean' } as JsonSchema]),
          ) as Record<string, JsonSchema>;
          return {
            type: 'object',
            properties: markProperties,
            additionalProperties: false,
            minProperties: 1,
          } as JsonSchema;
        })(),
      },
      ['target', 'inline'],
    ),
    output: textMutationResultSchemaFor('format.apply'),
    success: textMutationSuccessSchema,
    failure: textMutationFailureSchemaFor('format.apply'),
  },
  'format.fontSize': {
    input: objectSchema(
      {
        target: textAddressSchema,
        value: { oneOf: [{ type: 'string', minLength: 1 }, { type: 'number' }, { type: 'null' }] },
      },
      ['target', 'value'],
    ),
    output: textMutationResultSchemaFor('format.fontSize'),
    success: textMutationSuccessSchema,
    failure: textMutationFailureSchemaFor('format.fontSize'),
  },
  'format.fontFamily': {
    input: objectSchema(
      {
        target: textAddressSchema,
        value: { oneOf: [{ type: 'string', minLength: 1 }, { type: 'null' }] },
      },
      ['target', 'value'],
    ),
    output: textMutationResultSchemaFor('format.fontFamily'),
    success: textMutationSuccessSchema,
    failure: textMutationFailureSchemaFor('format.fontFamily'),
  },
  'format.color': {
    input: objectSchema(
      {
        target: textAddressSchema,
        value: { oneOf: [{ type: 'string', minLength: 1 }, { type: 'null' }] },
      },
      ['target', 'value'],
    ),
    output: textMutationResultSchemaFor('format.color'),
    success: textMutationSuccessSchema,
    failure: textMutationFailureSchemaFor('format.color'),
  },
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

      return discoveryResultSchema({ oneOf: [textMatchItemSchema, nodeMatchItemSchema] });
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
