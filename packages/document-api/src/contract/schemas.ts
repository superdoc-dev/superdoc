import { COMMAND_CATALOG } from './command-catalog.js';
import { CONTRACT_VERSION, JSON_SCHEMA_DIALECT, OPERATION_IDS, type OperationId } from './types.js';
import { NODE_TYPES, BLOCK_NODE_TYPES, INLINE_NODE_TYPES } from '../types/base.js';

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

const nodeTypeValues = NODE_TYPES;
const blockNodeTypeValues = BLOCK_NODE_TYPES;
const inlineNodeTypeValues = INLINE_NODE_TYPES;

const rangeSchema = objectSchema(
  {
    start: { type: 'integer' },
    end: { type: 'integer' },
  },
  ['start', 'end'],
);

const positionSchema = objectSchema(
  {
    blockId: { type: 'string' },
    offset: { type: 'integer' },
  },
  ['blockId', 'offset'],
);

const inlineAnchorSchema = objectSchema(
  {
    start: positionSchema,
    end: positionSchema,
  },
  ['start', 'end'],
);

const textAddressSchema = objectSchema(
  {
    kind: { const: 'text' },
    blockId: { type: 'string' },
    range: rangeSchema,
  },
  ['kind', 'blockId', 'range'],
);

const blockNodeAddressSchema = objectSchema(
  {
    kind: { const: 'block' },
    nodeType: { enum: [...blockNodeTypeValues] },
    nodeId: { type: 'string' },
  },
  ['kind', 'nodeType', 'nodeId'],
);

const paragraphAddressSchema = objectSchema(
  {
    kind: { const: 'block' },
    nodeType: { const: 'paragraph' },
    nodeId: { type: 'string' },
  },
  ['kind', 'nodeType', 'nodeId'],
);

const headingAddressSchema = objectSchema(
  {
    kind: { const: 'block' },
    nodeType: { const: 'heading' },
    nodeId: { type: 'string' },
  },
  ['kind', 'nodeType', 'nodeId'],
);

const listItemAddressSchema = objectSchema(
  {
    kind: { const: 'block' },
    nodeType: { const: 'listItem' },
    nodeId: { type: 'string' },
  },
  ['kind', 'nodeType', 'nodeId'],
);

const inlineNodeAddressSchema = objectSchema(
  {
    kind: { const: 'inline' },
    nodeType: { enum: [...inlineNodeTypeValues] },
    anchor: inlineAnchorSchema,
  },
  ['kind', 'nodeType', 'anchor'],
);

const nodeAddressSchema: JsonSchema = {
  oneOf: [blockNodeAddressSchema, inlineNodeAddressSchema],
};

const commentAddressSchema = objectSchema(
  {
    kind: { const: 'entity' },
    entityType: { const: 'comment' },
    entityId: { type: 'string' },
  },
  ['kind', 'entityType', 'entityId'],
);

const trackedChangeAddressSchema = objectSchema(
  {
    kind: { const: 'entity' },
    entityType: { const: 'trackedChange' },
    entityId: { type: 'string' },
  },
  ['kind', 'entityType', 'entityId'],
);

const entityAddressSchema: JsonSchema = {
  oneOf: [commentAddressSchema, trackedChangeAddressSchema],
};

function possibleFailureCodes(operationId: OperationId): string[] {
  return [...COMMAND_CATALOG[operationId].possibleFailureCodes];
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

const receiptSuccessSchema = objectSchema(
  {
    success: { const: true },
    inserted: arraySchema(entityAddressSchema),
    updated: arraySchema(entityAddressSchema),
    removed: arraySchema(entityAddressSchema),
  },
  ['success'],
);

function receiptFailureResultSchemaFor(operationId: OperationId): JsonSchema {
  return objectSchema(
    {
      success: { const: false },
      failure: receiptFailureSchemaFor(operationId),
    },
    ['success', 'failure'],
  );
}

function receiptResultSchemaFor(operationId: OperationId): JsonSchema {
  return {
    oneOf: [receiptSuccessSchema, receiptFailureResultSchemaFor(operationId)],
  };
}

const textMutationRangeSchema = objectSchema(
  {
    from: { type: 'integer' },
    to: { type: 'integer' },
  },
  ['from', 'to'],
);

const textMutationResolutionSchema = objectSchema(
  {
    requestedTarget: textAddressSchema,
    target: textAddressSchema,
    range: textMutationRangeSchema,
    text: { type: 'string' },
  },
  ['target', 'range', 'text'],
);

const textMutationSuccessSchema = objectSchema(
  {
    success: { const: true },
    resolution: textMutationResolutionSchema,
    inserted: arraySchema(entityAddressSchema),
    updated: arraySchema(entityAddressSchema),
    removed: arraySchema(entityAddressSchema),
  },
  ['success', 'resolution'],
);

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
    includeNodes: { type: 'boolean' },
    includeUnknown: { type: 'boolean' },
  },
  ['select'],
);

const findOutputSchema = objectSchema(
  {
    matches: arraySchema(nodeAddressSchema),
    total: { type: 'integer' },
    nodes: arraySchema(nodeInfoSchema),
    context: arraySchema(matchContextSchema),
    diagnostics: arraySchema(unknownNodeDiagnosticSchema),
  },
  ['matches', 'total'],
);

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

const listsListResultSchema = objectSchema(
  {
    matches: arraySchema(listItemAddressSchema),
    total: { type: 'integer' },
    items: arraySchema(listItemInfoSchema),
  },
  ['matches', 'total', 'items'],
);

const commentInfoSchema = objectSchema(
  {
    address: commentAddressSchema,
    commentId: { type: 'string' },
    importedId: { type: 'string' },
    parentCommentId: { type: 'string' },
    text: { type: 'string' },
    isInternal: { type: 'boolean' },
    status: { enum: ['open', 'resolved'] },
    target: textAddressSchema,
    createdTime: { type: 'number' },
    creatorName: { type: 'string' },
    creatorEmail: { type: 'string' },
  },
  ['address', 'commentId', 'status'],
);

const commentsListResultSchema = objectSchema(
  {
    matches: arraySchema(commentInfoSchema),
    total: { type: 'integer' },
  },
  ['matches', 'total'],
);

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

const trackChangesListResultSchema = objectSchema(
  {
    matches: arraySchema(trackedChangeAddressSchema),
    total: { type: 'integer' },
    changes: arraySchema(trackChangeInfoSchema),
  },
  ['matches', 'total'],
);

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
    operations: operationCapabilitiesSchema,
  },
  ['global', 'operations'],
);

const strictEmptyObjectSchema = objectSchema({});

/**
 * Shared JSON Schema constraints for inputs that accept either a canonical `target`
 * or a block-relative `blockId` + `start` + `end` locator — but not both.
 *
 * Used by: delete, replace, format.*, comments.add, comments.move.
 */
const rangeLocatorConstraints = {
  allOf: [
    { not: { required: ['target', 'blockId'] } },
    { not: { required: ['target', 'start'] } },
    { not: { required: ['target', 'end'] } },
    { if: { required: ['start'] }, then: { required: ['blockId', 'end'] } },
    { if: { required: ['end'] }, then: { required: ['blockId', 'start'] } },
    { if: { required: ['blockId'] }, then: { required: ['start', 'end'] } },
  ],
  anyOf: [{ required: ['target'] }, { required: ['blockId', 'start', 'end'] }],
};

const rangeLocatorProperties = {
  blockId: { type: 'string', description: 'Block ID for block-relative range targeting.' } as JsonSchema,
  start: {
    type: 'integer',
    minimum: 0,
    description: 'Start offset within the block identified by blockId.',
  } as JsonSchema,
  end: { type: 'integer', minimum: 0, description: 'End offset within the block identified by blockId.' } as JsonSchema,
};

/**
 * Shared input schema for format operations (bold, italic, underline, strikethrough).
 * All four accept identical input shapes.
 */
const formatInputSchema: JsonSchema = {
  ...objectSchema(
    {
      target: textAddressSchema,
      ...rangeLocatorProperties,
    },
    [],
  ),
  ...rangeLocatorConstraints,
};
const insertInputSchema: JsonSchema = {
  ...objectSchema(
    {
      target: textAddressSchema,
      text: { type: 'string' },
      blockId: { type: 'string', description: 'Block ID for block-relative targeting.' },
      offset: { type: 'integer', minimum: 0, description: 'Character offset within the block identified by blockId.' },
    },
    ['text'],
  ),
  allOf: [
    { not: { required: ['target', 'blockId'] } },
    { not: { required: ['target', 'offset'] } },
    { if: { required: ['offset'] }, then: { required: ['blockId'] } },
  ],
};

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
    input: {
      ...objectSchema(
        {
          target: textAddressSchema,
          text: { type: 'string' },
          ...rangeLocatorProperties,
        },
        ['text'],
      ),
      ...rangeLocatorConstraints,
    },
    output: textMutationResultSchemaFor('replace'),
    success: textMutationSuccessSchema,
    failure: textMutationFailureSchemaFor('replace'),
  },
  delete: {
    input: {
      ...objectSchema(
        {
          target: textAddressSchema,
          ...rangeLocatorProperties,
        },
        [],
      ),
      ...rangeLocatorConstraints,
    },
    output: textMutationResultSchemaFor('delete'),
    success: textMutationSuccessSchema,
    failure: textMutationFailureSchemaFor('delete'),
  },
  'format.bold': {
    input: formatInputSchema,
    output: textMutationResultSchemaFor('format.bold'),
    success: textMutationSuccessSchema,
    failure: textMutationFailureSchemaFor('format.bold'),
  },
  'format.italic': {
    input: formatInputSchema,
    output: textMutationResultSchemaFor('format.italic'),
    success: textMutationSuccessSchema,
    failure: textMutationFailureSchemaFor('format.italic'),
  },
  'format.underline': {
    input: formatInputSchema,
    output: textMutationResultSchemaFor('format.underline'),
    success: textMutationSuccessSchema,
    failure: textMutationFailureSchemaFor('format.underline'),
  },
  'format.strikethrough': {
    input: formatInputSchema,
    output: textMutationResultSchemaFor('format.strikethrough'),
    success: textMutationSuccessSchema,
    failure: textMutationFailureSchemaFor('format.strikethrough'),
  },
  'create.paragraph': {
    input: objectSchema({
      at: {
        oneOf: [
          objectSchema({ kind: { const: 'documentStart' } }, ['kind']),
          objectSchema({ kind: { const: 'documentEnd' } }, ['kind']),
          {
            ...objectSchema(
              {
                kind: { const: 'before' },
                target: blockNodeAddressSchema,
                nodeId: {
                  type: 'string',
                  description: 'Node ID shorthand — adapter resolves to a full BlockNodeAddress.',
                },
              },
              ['kind'],
            ),
            oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
          },
          {
            ...objectSchema(
              {
                kind: { const: 'after' },
                target: blockNodeAddressSchema,
                nodeId: {
                  type: 'string',
                  description: 'Node ID shorthand — adapter resolves to a full BlockNodeAddress.',
                },
              },
              ['kind'],
            ),
            oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
          },
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
            {
              ...objectSchema(
                {
                  kind: { const: 'before' },
                  target: blockNodeAddressSchema,
                  nodeId: {
                    type: 'string',
                    description: 'Node ID shorthand — adapter resolves to a full BlockNodeAddress.',
                  },
                },
                ['kind'],
              ),
              oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
            },
            {
              ...objectSchema(
                {
                  kind: { const: 'after' },
                  target: blockNodeAddressSchema,
                  nodeId: {
                    type: 'string',
                    description: 'Node ID shorthand — adapter resolves to a full BlockNodeAddress.',
                  },
                },
                ['kind'],
              ),
              oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
            },
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
    input: {
      ...objectSchema(
        {
          target: listItemAddressSchema,
          nodeId: { type: 'string', description: 'Node ID shorthand — adapter resolves to a ListItemAddress.' },
          position: listInsertPositionSchema,
          text: { type: 'string' },
        },
        ['position'],
      ),
      oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
    },
    output: listsInsertResultSchemaFor('lists.insert'),
    success: listsInsertSuccessSchema,
    failure: listsFailureSchemaFor('lists.insert'),
  },
  'lists.setType': {
    input: {
      ...objectSchema(
        {
          target: listItemAddressSchema,
          nodeId: { type: 'string', description: 'Node ID shorthand — adapter resolves to a ListItemAddress.' },
          kind: listKindSchema,
        },
        ['kind'],
      ),
      oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
    },
    output: listsMutateItemResultSchemaFor('lists.setType'),
    success: listsMutateItemSuccessSchema,
    failure: listsFailureSchemaFor('lists.setType'),
  },
  'lists.indent': {
    input: {
      ...objectSchema(
        {
          target: listItemAddressSchema,
          nodeId: { type: 'string', description: 'Node ID shorthand — adapter resolves to a ListItemAddress.' },
        },
        [],
      ),
      oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
    },
    output: listsMutateItemResultSchemaFor('lists.indent'),
    success: listsMutateItemSuccessSchema,
    failure: listsFailureSchemaFor('lists.indent'),
  },
  'lists.outdent': {
    input: {
      ...objectSchema(
        {
          target: listItemAddressSchema,
          nodeId: { type: 'string', description: 'Node ID shorthand — adapter resolves to a ListItemAddress.' },
        },
        [],
      ),
      oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
    },
    output: listsMutateItemResultSchemaFor('lists.outdent'),
    success: listsMutateItemSuccessSchema,
    failure: listsFailureSchemaFor('lists.outdent'),
  },
  'lists.restart': {
    input: {
      ...objectSchema(
        {
          target: listItemAddressSchema,
          nodeId: { type: 'string', description: 'Node ID shorthand — adapter resolves to a ListItemAddress.' },
        },
        [],
      ),
      oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
    },
    output: listsMutateItemResultSchemaFor('lists.restart'),
    success: listsMutateItemSuccessSchema,
    failure: listsFailureSchemaFor('lists.restart'),
  },
  'lists.exit': {
    input: {
      ...objectSchema(
        {
          target: listItemAddressSchema,
          nodeId: { type: 'string', description: 'Node ID shorthand — adapter resolves to a ListItemAddress.' },
        },
        [],
      ),
      oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
    },
    output: listsExitResultSchemaFor('lists.exit'),
    success: listsExitSuccessSchema,
    failure: listsFailureSchemaFor('lists.exit'),
  },
  'comments.add': {
    input: {
      ...objectSchema(
        {
          target: textAddressSchema,
          text: { type: 'string' },
          ...rangeLocatorProperties,
        },
        ['text'],
      ),
      ...rangeLocatorConstraints,
    },
    output: receiptResultSchemaFor('comments.add'),
    success: receiptSuccessSchema,
    failure: receiptFailureResultSchemaFor('comments.add'),
  },
  'comments.edit': {
    input: objectSchema(
      {
        commentId: { type: 'string' },
        text: { type: 'string' },
      },
      ['commentId', 'text'],
    ),
    output: receiptResultSchemaFor('comments.edit'),
    success: receiptSuccessSchema,
    failure: receiptFailureResultSchemaFor('comments.edit'),
  },
  'comments.reply': {
    input: objectSchema(
      {
        parentCommentId: { type: 'string' },
        text: { type: 'string' },
      },
      ['parentCommentId', 'text'],
    ),
    output: receiptResultSchemaFor('comments.reply'),
    success: receiptSuccessSchema,
    failure: receiptFailureResultSchemaFor('comments.reply'),
  },
  'comments.move': {
    input: {
      ...objectSchema(
        {
          commentId: { type: 'string' },
          target: textAddressSchema,
          ...rangeLocatorProperties,
        },
        ['commentId'],
      ),
      ...rangeLocatorConstraints,
    },
    output: receiptResultSchemaFor('comments.move'),
    success: receiptSuccessSchema,
    failure: receiptFailureResultSchemaFor('comments.move'),
  },
  'comments.resolve': {
    input: objectSchema({ commentId: { type: 'string' } }, ['commentId']),
    output: receiptResultSchemaFor('comments.resolve'),
    success: receiptSuccessSchema,
    failure: receiptFailureResultSchemaFor('comments.resolve'),
  },
  'comments.remove': {
    input: objectSchema({ commentId: { type: 'string' } }, ['commentId']),
    output: receiptResultSchemaFor('comments.remove'),
    success: receiptSuccessSchema,
    failure: receiptFailureResultSchemaFor('comments.remove'),
  },
  'comments.setInternal': {
    input: objectSchema(
      {
        commentId: { type: 'string' },
        isInternal: { type: 'boolean' },
      },
      ['commentId', 'isInternal'],
    ),
    output: receiptResultSchemaFor('comments.setInternal'),
    success: receiptSuccessSchema,
    failure: receiptFailureResultSchemaFor('comments.setInternal'),
  },
  'comments.setActive': {
    input: objectSchema({ commentId: { type: ['string', 'null'] } }, ['commentId']),
    output: receiptResultSchemaFor('comments.setActive'),
    success: receiptSuccessSchema,
    failure: receiptFailureResultSchemaFor('comments.setActive'),
  },
  'comments.goTo': {
    input: objectSchema({ commentId: { type: 'string' } }, ['commentId']),
    output: receiptSuccessSchema,
  },
  'comments.get': {
    input: objectSchema({ commentId: { type: 'string' } }, ['commentId']),
    output: commentInfoSchema,
  },
  'comments.list': {
    input: objectSchema({ includeResolved: { type: 'boolean' } }),
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
  'trackChanges.accept': {
    input: objectSchema({ id: { type: 'string' } }, ['id']),
    output: receiptResultSchemaFor('trackChanges.accept'),
    success: receiptSuccessSchema,
    failure: receiptFailureResultSchemaFor('trackChanges.accept'),
  },
  'trackChanges.reject': {
    input: objectSchema({ id: { type: 'string' } }, ['id']),
    output: receiptResultSchemaFor('trackChanges.reject'),
    success: receiptSuccessSchema,
    failure: receiptFailureResultSchemaFor('trackChanges.reject'),
  },
  'trackChanges.acceptAll': {
    input: strictEmptyObjectSchema,
    output: receiptResultSchemaFor('trackChanges.acceptAll'),
    success: receiptSuccessSchema,
    failure: receiptFailureResultSchemaFor('trackChanges.acceptAll'),
  },
  'trackChanges.rejectAll': {
    input: strictEmptyObjectSchema,
    output: receiptResultSchemaFor('trackChanges.rejectAll'),
    success: receiptSuccessSchema,
    failure: receiptFailureResultSchemaFor('trackChanges.rejectAll'),
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
    operations,
  };
}
