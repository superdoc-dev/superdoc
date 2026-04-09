import { COMMAND_CATALOG } from './command-catalog.js';
import { CONTRACT_VERSION, JSON_SCHEMA_DIALECT, OPERATION_IDS, type OperationId } from './types.js';
import { NODE_TYPES, BLOCK_NODE_TYPES, DELETABLE_BLOCK_NODE_TYPES, INLINE_NODE_TYPES } from '../types/base.js';
import { SELECTION_EDGE_NODE_TYPES } from '../types/address.js';
import { INLINE_PROPERTY_REGISTRY, buildInlineRunPatchSchema } from '../format/inline-run-patch.js';
import { INLINE_DIRECTIVES } from '../types/style-policy.types.js';
import {
  PARAGRAPH_ALIGNMENTS,
  TAB_STOP_ALIGNMENTS,
  TAB_STOP_LEADERS,
  BORDER_SIDES,
  CLEAR_BORDER_SIDES,
  LINE_RULES,
} from '../paragraphs/paragraphs.js';
import { buildPatchSchema, buildStateSchema } from '../styles/index.js';
import { Z_ORDER_RELATIVE_HEIGHT_MAX, Z_ORDER_RELATIVE_HEIGHT_MIN } from '../images/z-order.js';

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

/**
 * Builds a `oneOf` schema that merges each TargetLocator branch with additional
 * payload properties. This avoids the `allOf` + `additionalProperties: false`
 * conflict where each branch would reject keys defined in the other schema.
 */
function targetLocatorWithPayload(
  payloadProperties: Record<string, JsonSchema>,
  payloadRequired: readonly string[] = [],
): JsonSchema {
  return {
    oneOf: [
      objectSchema(
        {
          target: {
            ...ref('SelectionTarget'),
            description:
              "Selection target: {kind:'selection', start:{kind:'text', blockId, offset}, end:{kind:'text', blockId, offset}}. Use 'ref' instead when you have a search result handle.",
          },
          ...payloadProperties,
        },
        ['target', ...payloadRequired],
      ),
      objectSchema(
        {
          ref: {
            type: 'string',
            description:
              "Handle ref string from a superdoc_search result. Pass the handle.ref value directly (e.g. 'text:eyJ...'). Preferred over 'target' for inline formatting.",
          },
          ...payloadProperties,
        },
        ['ref', ...payloadRequired],
      ),
    ],
  };
}

/**
 * Like {@link targetLocatorWithPayload}, but also allows an untargeted branch
 * where neither `target` nor `ref` is present.
 */
function optionalTargetLocatorWithPayload(
  payloadProperties: Record<string, JsonSchema>,
  payloadRequired: readonly string[] = [],
): JsonSchema {
  return {
    oneOf: [
      objectSchema(
        {
          target: {
            ...ref('SelectionTarget'),
            description:
              "Selection target: {kind:'selection', start:{kind:'text', blockId, offset}, end:{kind:'text', blockId, offset}}.",
          },
          ...payloadProperties,
        },
        ['target', ...payloadRequired],
      ),
      objectSchema(
        {
          ref: {
            type: 'string',
            description:
              'Handle ref from superdoc_search result (pass handle.ref value directly). Preferred over building a target object.',
          },
          ...payloadProperties,
        },
        ['ref', ...payloadRequired],
      ),
      objectSchema({ ...payloadProperties }, [...payloadRequired]),
    ],
  };
}

/** Shared output/success/failure shape for ImagesMutationResult operations. */
function imagesMutationSchemaSet(inputSchema: JsonSchema): OperationSchemaSet {
  return {
    input: inputSchema,
    output: objectSchema({ success: { type: 'boolean' }, image: { type: 'object' }, failure: { type: 'object' } }),
    success: objectSchema({ success: { const: true }, image: { type: 'object' } }, ['success', 'image']),
    failure: objectSchema(
      {
        success: { const: false },
        failure: objectSchema({ code: { type: 'string' }, message: { type: 'string' } }, ['code', 'message']),
      },
      ['success', 'failure'],
    ),
  };
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
  'tableOfContents',
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

  // -- Selection-based targeting --
  SelectionEdgeNodeAddress: objectSchema(
    {
      kind: { const: 'block' },
      nodeType: { enum: [...SELECTION_EDGE_NODE_TYPES] },
      nodeId: { type: 'string' },
    },
    ['kind', 'nodeType', 'nodeId'],
  ),
  SelectionPoint: {
    description:
      "A point in the document. Use {kind:'text', blockId, offset} for character positions or {kind:'nodeEdge', node:{kind:'block', nodeType, nodeId}, edge:'before'|'after'} for block boundaries.",
    oneOf: [
      objectSchema({ kind: { const: 'text' }, blockId: { type: 'string' }, offset: { type: 'integer', minimum: 0 } }, [
        'kind',
        'blockId',
        'offset',
      ]),
      objectSchema(
        {
          kind: { const: 'nodeEdge' },
          node: ref('SelectionEdgeNodeAddress'),
          edge: { enum: ['before', 'after'] },
        },
        ['kind', 'node', 'edge'],
      ),
    ],
  } satisfies JsonSchema,
  SelectionTarget: objectSchema(
    {
      kind: { const: 'selection' },
      start: ref('SelectionPoint'),
      end: ref('SelectionPoint'),
    },
    ['kind', 'start', 'end'],
  ),
  TargetLocator: {
    oneOf: [
      objectSchema({ target: ref('SelectionTarget') }, ['target']),
      objectSchema({ ref: { type: 'string' } }, ['ref']),
    ],
  } satisfies JsonSchema,
  DeleteBehavior: { enum: ['selection', 'exact'] } satisfies JsonSchema,

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
  TableAddress: objectSchema(
    {
      kind: { const: 'block' },
      nodeType: { const: 'table' },
      nodeId: { type: 'string' },
    },
    ['kind', 'nodeType', 'nodeId'],
  ),
  TableRowAddress: objectSchema(
    {
      kind: { const: 'block' },
      nodeType: { const: 'tableRow' },
      nodeId: { type: 'string' },
    },
    ['kind', 'nodeType', 'nodeId'],
  ),
  TableCellAddress: objectSchema(
    {
      kind: { const: 'block' },
      nodeType: { const: 'tableCell' },
      nodeId: { type: 'string' },
    },
    ['kind', 'nodeType', 'nodeId'],
  ),
  TableOrRowAddress: objectSchema(
    {
      kind: { const: 'block' },
      nodeType: { enum: ['table', 'tableRow'] },
      nodeId: { type: 'string' },
    },
    ['kind', 'nodeType', 'nodeId'],
  ),
  TableOrCellAddress: objectSchema(
    {
      kind: { const: 'block' },
      nodeType: { enum: ['table', 'tableCell'] },
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
  ReceiptFailure: objectSchema(
    {
      code: { type: 'string' },
      message: { type: 'string' },
      details: {},
    },
    ['code', 'message'],
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
      selectionTarget: ref('SelectionTarget'),
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

  // -- Block-level address types (lists) --
  BlockAddress: objectSchema(
    {
      kind: { const: 'block' },
      nodeType: { const: 'paragraph' },
      nodeId: { type: 'string' },
    },
    ['kind', 'nodeType', 'nodeId'],
  ),
  BlockRange: objectSchema(
    {
      from: ref('BlockAddress'),
      to: ref('BlockAddress'),
    },
    ['from', 'to'],
  ),
  BlockAddressOrRange: {
    oneOf: [ref('BlockAddress'), ref('BlockRange')],
  },

  // -- Story locator (discriminated union on storyType) --
  StoryLocator: {
    description:
      "Story scope. Defaults to document body when omitted. Use {kind:'story', storyType:'body'} for body, or other storyType values for headers, footers, footnotes, endnotes.",
    oneOf: [
      objectSchema({ kind: { const: 'story' }, storyType: { const: 'body' } }, ['kind', 'storyType']),
      objectSchema(
        {
          kind: { const: 'story' },
          storyType: { const: 'headerFooterSlot' },
          section: ref('SectionAddress'),
          headerFooterKind: { enum: ['header', 'footer'] },
          variant: { enum: ['default', 'first', 'even'] },
          resolution: { enum: ['effective', 'explicit'] },
          onWrite: { enum: ['materializeIfInherited', 'editResolvedPart', 'error'] },
        },
        ['kind', 'storyType', 'section', 'headerFooterKind', 'variant'],
      ),
      objectSchema(
        {
          kind: { const: 'story' },
          storyType: { const: 'headerFooterPart' },
          refId: { type: 'string' },
        },
        ['kind', 'storyType', 'refId'],
      ),
      objectSchema(
        {
          kind: { const: 'story' },
          storyType: { const: 'footnote' },
          noteId: { type: 'string' },
        },
        ['kind', 'storyType', 'noteId'],
      ),
      objectSchema(
        {
          kind: { const: 'story' },
          storyType: { const: 'endnote' },
          noteId: { type: 'string' },
        },
        ['kind', 'storyType', 'noteId'],
      ),
    ],
  } satisfies JsonSchema,
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
const tableAddressSchema = ref('TableAddress');
const tableRowAddressSchema = ref('TableRowAddress');
const tableCellAddressSchema = ref('TableCellAddress');
const tableOrCellAddressSchema = ref('TableOrCellAddress');
const paragraphAddressSchema = ref('ParagraphAddress');
const headingAddressSchema = ref('HeadingAddress');
const listItemAddressSchema = ref('ListItemAddress');
const paragraphTargetSchema: JsonSchema = {
  oneOf: [paragraphAddressSchema, headingAddressSchema, listItemAddressSchema],
};
const sectionAddressSchema = ref('SectionAddress');
const inlineNodeAddressSchema = ref('InlineNodeAddress');
const nodeAddressSchema = ref('NodeAddress');
const commentAddressSchema = ref('CommentAddress');
const trackedChangeAddressSchema = ref('TrackedChangeAddress');
const entityAddressSchema = ref('EntityAddress');
const selectionTargetSchema = ref('SelectionTarget');
const targetLocatorSchema = ref('TargetLocator');
const deleteBehaviorSchema = ref('DeleteBehavior');
const resolvedHandleSchema = ref('ResolvedHandle');
const pageInfoSchema = ref('PageInfo');
const receiptSuccessSchema = ref('ReceiptSuccess');
const textMutationRangeSchema = ref('TextMutationRange');
const textMutationResolutionSchema = ref('TextMutationResolution');
const textMutationSuccessSchema = ref('TextMutationSuccess');
const matchRunSchema = ref('MatchRun');
const matchBlockSchema = ref('MatchBlock');
const storyLocatorSchema = ref('StoryLocator');

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
    ref: {
      type: 'string',
      description:
        'Ref handle for the created block. Pass directly to superdoc_format or superdoc_edit ref param without searching.',
    },
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
    ref: {
      type: 'string',
      description:
        'Ref handle for the created block. Pass directly to superdoc_format or superdoc_edit ref param without searching.',
    },
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

function _listsExitResultSchemaFor(operationId: OperationId): JsonSchema {
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
    target: selectionTargetSchema,
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
    type: { const: 'text', description: "Must be 'text' for text pattern search." },
    pattern: { type: 'string', description: 'Text or regex pattern to match.' },
    mode: { enum: ['contains', 'regex'], description: "Match mode: 'contains' (substring) or 'regex'." },
    caseSensitive: { type: 'boolean', description: 'Case-sensitive matching. Default: false.' },
  },
  ['type', 'pattern'],
);

const nodeSelectorSchema = objectSchema(
  {
    type: { const: 'node', description: "Must be 'node' for node type search." },
    nodeType: {
      enum: [...nodeTypeValues],
      description: 'Block type to match (paragraph, heading, table, listItem, etc.).',
    },
    kind: { enum: ['block', 'inline'], description: "Filter: 'block' or 'inline'." },
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

// -- SDFindInput / SDFindResult schemas (SDM/1) --

const sdTextSelectorSchema = objectSchema(
  {
    type: { const: 'text' },
    pattern: { type: 'string' },
    mode: { enum: ['contains', 'regex'] },
    caseSensitive: { type: 'boolean' },
  },
  ['type', 'pattern'],
);

const sdNodeSelectorSchema = objectSchema(
  {
    type: { const: 'node' },
    kind: { enum: ['block', 'inline'] },
    nodeType: { type: 'string' },
  },
  ['type'],
);

const sdSelectorSchema: JsonSchema = {
  oneOf: [sdTextSelectorSchema, sdNodeSelectorSchema],
};

// sdAddressSchema removed — replaced by blockNodeAddressSchema, nodeAddressSchema, textAddressSchema

const sdReadOptionsSchema = objectSchema({
  includeResolved: { type: 'boolean' },
  includeProvenance: { type: 'boolean' },
  includeContext: { type: 'boolean' },
});

const sdFindInputSchema = objectSchema(
  {
    in: storyLocatorSchema,
    select: sdSelectorSchema,
    within: blockNodeAddressSchema,
    limit: { type: 'integer' },
    offset: { type: 'integer' },
    options: sdReadOptionsSchema,
  },
  ['select'],
);

const sdNodeResultSchema = objectSchema(
  {
    node: { type: 'object' },
    address: nodeAddressSchema,
    context: { type: 'object' },
  },
  ['node', 'address'],
);

const sdFindResultSchema = objectSchema(
  {
    total: { type: 'integer', minimum: 0 },
    limit: { type: 'integer', minimum: 0 },
    offset: { type: 'integer', minimum: 0 },
    items: arraySchema(sdNodeResultSchema),
  },
  ['total', 'limit', 'offset', 'items'],
);

// ---------------------------------------------------------------------------
// SDMutationReceipt schemas (for insert/replace in SDM/1 format)
// ---------------------------------------------------------------------------

const sdMutationResolutionSchema = objectSchema(
  {
    target: { oneOf: [textAddressSchema, blockNodeAddressSchema] },
    range: textMutationRangeSchema,
    selectionTarget: selectionTargetSchema,
  },
  ['target', 'range'],
);

const sdMutationSuccessSchema = objectSchema(
  {
    success: { const: true },
    resolution: sdMutationResolutionSchema,
    evaluatedRevision: objectSchema({ before: { type: 'string' }, after: { type: 'string' } }, ['before', 'after']),
  },
  ['success'],
);

function sdMutationFailureSchemaFor(operationId: OperationId): JsonSchema {
  return objectSchema(
    {
      success: { const: false },
      failure: receiptFailureSchemaFor(operationId),
      resolution: sdMutationResolutionSchema,
      evaluatedRevision: objectSchema({ before: { type: 'string' }, after: { type: 'string' } }, ['before', 'after']),
    },
    ['success', 'failure'],
  );
}

function sdMutationResultSchemaFor(operationId: OperationId): JsonSchema {
  return {
    oneOf: [sdMutationSuccessSchema, sdMutationFailureSchemaFor(operationId)],
  };
}

const documentInfoCountsSchema = objectSchema(
  {
    words: { type: 'integer' },
    characters: { type: 'integer' },
    paragraphs: { type: 'integer' },
    headings: { type: 'integer' },
    tables: { type: 'integer' },
    images: { type: 'integer' },
    comments: { type: 'integer' },
    trackedChanges: { type: 'integer' },
    sdtFields: { type: 'integer' },
    lists: { type: 'integer' },
    pages: { type: 'integer' },
  },
  [
    'words',
    'characters',
    'paragraphs',
    'headings',
    'tables',
    'images',
    'comments',
    'trackedChanges',
    'sdtFields',
    'lists',
  ],
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

const documentStyleInfoSchema = objectSchema(
  {
    styleId: { type: 'string', description: "Style identifier (e.g. 'Normal', 'Heading1', 'BodyText')." },
    count: { type: 'integer', description: 'Number of paragraphs using this style.' },
    fontFamily: { type: 'string', description: 'Font family used by text in this style.' },
    fontSize: { type: 'number', description: 'Font size in half-points used by text in this style.' },
  },
  ['styleId', 'count'],
);

const documentStylesSchema = objectSchema(
  {
    paragraphStyles: {
      ...arraySchema(documentStyleInfoSchema),
      description: 'Paragraph styles in use, sorted by frequency (most common first).',
    },
  },
  ['paragraphStyles'],
);

const documentDefaultsSchema = objectSchema(
  {
    fontFamily: { type: 'string', description: 'Most common body text font family.' },
    fontSize: { type: 'number', description: 'Most common body text font size in half-points.' },
    styleId: { type: 'string', description: 'Most common body paragraph style ID.' },
  },
  [],
);

const documentInfoSchema = objectSchema(
  {
    counts: documentInfoCountsSchema,
    outline: arraySchema(documentInfoOutlineItemSchema),
    capabilities: documentInfoCapabilitiesSchema,
    revision: { type: 'string' },
    styles: { ...documentStylesSchema, description: 'Styles currently in use in the document.' },
    defaults: {
      ...documentDefaultsSchema,
      description:
        "Document's default body text formatting. Use these values when creating new content to match existing style.",
    },
  },
  ['counts', 'outline', 'capabilities', 'revision'],
);

const listKindSchema: JsonSchema = { enum: ['ordered', 'bullet'] };
const listInsertPositionSchema: JsonSchema = { enum: ['before', 'after'] };

const listItemInfoSchema = objectSchema(
  {
    address: listItemAddressSchema,
    listId: { type: 'string' },
    marker: { type: 'string' },
    ordinal: { type: 'integer' },
    path: arraySchema({ type: 'integer' }),
    level: { type: 'integer' },
    kind: listKindSchema,
    text: { type: 'string' },
  },
  ['address', 'listId'],
);

const listItemDomainItemSchema = discoveryItemSchema(
  {
    address: listItemAddressSchema,
    listId: { type: 'string' },
    marker: { type: 'string' },
    ordinal: { type: 'integer' },
    path: arraySchema({ type: 'integer' }),
    level: { type: 'integer' },
    kind: listKindSchema,
    text: { type: 'string' },
  },
  ['address', 'listId'],
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

// ---------------------------------------------------------------------------
// Paragraph mutation result schemas
// ---------------------------------------------------------------------------

const paragraphMutationTargetSchema = objectSchema({ target: paragraphTargetSchema }, ['target']);

const paragraphMutationSuccessSchema = objectSchema(
  {
    success: { const: true },
    target: paragraphTargetSchema,
    resolution: paragraphMutationTargetSchema,
  },
  ['success', 'target', 'resolution'],
);

function paragraphMutationFailureSchemaFor(operationId: OperationId): JsonSchema {
  return objectSchema(
    {
      success: { const: false },
      failure: receiptFailureSchemaFor(operationId),
      resolution: paragraphMutationTargetSchema,
    },
    ['success', 'failure'],
  );
}

function paragraphMutationResultSchemaFor(operationId: OperationId): JsonSchema {
  return {
    oneOf: [paragraphMutationSuccessSchema, paragraphMutationFailureSchemaFor(operationId)],
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

const trackChangeWordRevisionIdsSchema: JsonSchema = {
  ...objectSchema({
    insert: {
      type: 'string',
      description:
        'Raw imported Word OOXML revision ID (`w:id`) from a `<w:ins>` element when this logical change includes an insertion.',
    },
    delete: {
      type: 'string',
      description:
        'Raw imported Word OOXML revision ID (`w:id`) from a `<w:del>` element when this logical change includes a deletion.',
    },
    format: {
      type: 'string',
      description:
        'Raw imported Word OOXML revision ID (`w:id`) from a `<w:rPrChange>` element when this logical change includes a formatting revision.',
    },
  }),
  description:
    'Raw imported Word OOXML revision IDs (`w:id`) from the source document when available. This is provenance metadata, not the canonical SuperDoc tracked-change ID. Replacements may include both `insert` and `delete` IDs.',
};

const trackChangeInfoSchema = objectSchema(
  {
    address: trackedChangeAddressSchema,
    id: { type: 'string' },
    type: { enum: ['insert', 'delete', 'format'] },
    wordRevisionIds: trackChangeWordRevisionIdsSchema,
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
    wordRevisionIds: trackChangeWordRevisionIdsSchema,
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
        history: capabilityFlagSchema,
      },
      ['trackChanges', 'comments', 'lists', 'dryRun', 'history'],
    ),
    format: formatCapabilitiesSchema,
    operations: operationCapabilitiesSchema,
    planEngine: planEngineCapabilitiesSchema,
  },
  ['global', 'format', 'operations', 'planEngine'],
);

const strictEmptyObjectSchema = objectSchema({});
const tableBorderColorPattern = '^([0-9A-Fa-f]{6}|auto)$';

const tableBorderSpecSchema = objectSchema(
  {
    lineStyle: { type: 'string' },
    lineWeightPt: { type: 'number', exclusiveMinimum: 0 },
    color: { type: 'string', pattern: tableBorderColorPattern },
  },
  ['lineStyle', 'lineWeightPt', 'color'],
);

const nullableTableBorderSpecSchema: JsonSchema = {
  oneOf: [tableBorderSpecSchema, { type: 'null' }],
};

const sdFragmentSchema: JsonSchema = {
  oneOf: [{ type: 'object' }, { type: 'array', items: { type: 'object' } }],
};

const placementSchema: JsonSchema = { enum: ['before', 'after', 'insideStart', 'insideEnd'] };

const nestingPolicySchema: JsonSchema = {
  ...objectSchema({
    tables: { enum: ['forbid', 'allow'] },
  }),
  description: "Controls nesting behavior. tables: 'allow' permits inserting tables inside other tables.",
};

const insertInputSchema: JsonSchema = {
  oneOf: [
    optionalTargetLocatorWithPayload(
      {
        in: storyLocatorSchema,
        value: { type: 'string', description: 'Text content to insert.' },
        type: {
          type: 'string',
          enum: ['text', 'markdown', 'html'],
          description: "Content format: 'text' (default), 'markdown', or 'html'.",
        },
      },
      ['value'],
    ),
    objectSchema(
      {
        in: storyLocatorSchema,
        target: {
          ...blockNodeAddressSchema,
          description: "Block address for structural insertion: {kind:'block', nodeType:'...', nodeId:'...'}.",
        },
        content: { ...sdFragmentSchema, description: 'Document fragment to insert (structured content).' },
        placement: {
          ...placementSchema,
          description: "Where to place content relative to target: 'before', 'after', 'insideStart', or 'insideEnd'.",
        },
        nestingPolicy: nestingPolicySchema,
      },
      ['content'],
    ),
  ],
};

// ---------------------------------------------------------------------------
// Table operation shared schemas
// ---------------------------------------------------------------------------

const tableLocatorSchema: JsonSchema = {
  ...objectSchema({
    target: tableAddressSchema,
    nodeId: { type: 'string' },
  }),
  oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
};

const cellLocatorSchema: JsonSchema = {
  ...objectSchema({
    target: tableCellAddressSchema,
    nodeId: { type: 'string' },
  }),
  oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
};

/**
 * Accepts either a direct cell locator (target/nodeId pointing at a cell)
 * or a table-scoped cell locator (target/nodeId pointing at a table + rowIndex + columnIndex).
 */
const cellOrTableScopedCellLocatorSchema: JsonSchema = {
  oneOf: [
    cellLocatorSchema,
    objectSchema(
      {
        target: tableAddressSchema,
        rowIndex: { type: 'integer', minimum: 0 },
        columnIndex: { type: 'integer', minimum: 0 },
      },
      ['target', 'rowIndex', 'columnIndex'],
    ),
    objectSchema(
      {
        nodeId: { type: 'string' },
        rowIndex: { type: 'integer', minimum: 0 },
        columnIndex: { type: 'integer', minimum: 0 },
      },
      ['nodeId', 'rowIndex', 'columnIndex'],
    ),
  ],
};

const tableOrCellLocatorSchema: JsonSchema = {
  ...objectSchema({
    target: tableOrCellAddressSchema,
    nodeId: { type: 'string' },
  }),
  oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
};

function rowOperationInputSchema(
  extraProperties: Record<string, JsonSchema>,
  required: readonly string[] = [],
): JsonSchema {
  return {
    oneOf: [
      objectSchema({ target: tableRowAddressSchema, ...extraProperties }, ['target', ...required]),
      objectSchema(
        {
          target: tableAddressSchema,
          rowIndex: { type: 'integer', minimum: 0 },
          ...extraProperties,
        },
        ['target', 'rowIndex', ...required],
      ),
      objectSchema(
        {
          nodeId: { type: 'string' },
          rowIndex: { type: 'integer', minimum: 0 },
          ...extraProperties,
        },
        ['nodeId', 'rowIndex', ...required],
      ),
    ],
  };
}

const mergeRangeLocatorSchema: JsonSchema = {
  ...objectSchema(
    {
      target: tableAddressSchema,
      nodeId: { type: 'string' },
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
  oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
};

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
    table: tableAddressSchema,
    trackedChangeRefs: arraySchema(entityAddressSchema),
  },
  ['success'],
);

/** Stricter variant for create.table — the table address is required on success. */
const createTableSuccessSchema: JsonSchema = objectSchema(
  {
    success: { const: true },
    table: tableAddressSchema,
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

const historyActionSuccessSchema: JsonSchema = objectSchema(
  {
    noop: { type: 'boolean' },
    revision: objectSchema(
      {
        before: { type: 'string' },
        after: { type: 'string' },
      },
      ['before', 'after'],
    ),
  },
  ['noop', 'revision'],
);

const historyActionFailureSchema: JsonSchema = objectSchema(
  {
    success: { const: false },
    failure: objectSchema(
      {
        code: { enum: ['CAPABILITY_UNAVAILABLE'] },
        message: { type: 'string' },
        details: {},
      },
      ['code', 'message'],
    ),
  },
  ['success', 'failure'],
);

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
    const requiredFields = supportsImplicitTrueValue(operationId) ? [] : ['value'];
    const schema: OperationSchemaSet = {
      input: {
        ...targetLocatorWithPayload({ value: entry.schema }, requiredFields),
      },
      output: textMutationResultSchemaFor(operationId),
      success: textMutationSuccessSchema,
      failure: textMutationFailureSchemaFor(operationId),
    };
    return [operationId, schema];
  }),
) as Record<FormatInlineAliasOperationId, OperationSchemaSet>;
// ---------------------------------------------------------------------------
// TOC schema helpers
// ---------------------------------------------------------------------------

function tocAddressSchema(): JsonSchema {
  return objectSchema(
    {
      kind: { const: 'block' },
      nodeType: { const: 'tableOfContents' },
      nodeId: { type: 'string' },
    },
    ['kind', 'nodeType', 'nodeId'],
  );
}

const tocMutationFailureCodes = [
  'NO_OP',
  'INVALID_TARGET',
  'TARGET_NOT_FOUND',
  'CAPABILITY_UNAVAILABLE',
  'INVALID_INSERTION_CONTEXT',
  'PAGE_NUMBERS_NOT_MATERIALIZED',
] as const;

const tocMutationFailureSchema: JsonSchema = objectSchema(
  {
    success: { const: false },
    failure: objectSchema(
      {
        code: { enum: [...tocMutationFailureCodes] },
        message: { type: 'string' },
        details: {},
      },
      ['code', 'message'],
    ),
  },
  ['success', 'failure'],
);

const tocMutationSuccessSchema: JsonSchema = objectSchema({ success: { const: true }, toc: tocAddressSchema() }, [
  'success',
  'toc',
]);

function tocMutationResultSchema(): JsonSchema {
  return {
    oneOf: [tocMutationSuccessSchema, tocMutationFailureSchema],
  };
}

// --- TC entry schemas ---

function tocEntryAddressSchema(): JsonSchema {
  return objectSchema(
    {
      kind: { const: 'inline' },
      nodeType: { const: 'tableOfContentsEntry' },
      nodeId: { type: 'string' },
    },
    ['kind', 'nodeType', 'nodeId'],
  );
}

function tocEntryInsertionTargetSchema(): JsonSchema {
  return objectSchema(
    {
      kind: { const: 'inline-insert' },
      anchor: objectSchema(
        {
          nodeType: { const: 'paragraph' },
          nodeId: { type: 'string' },
        },
        ['nodeType', 'nodeId'],
      ),
      position: { enum: ['start', 'end'] },
    },
    ['kind', 'anchor'],
  );
}

const tocEntryMutationFailureCodes = [
  'NO_OP',
  'INVALID_TARGET',
  'TARGET_NOT_FOUND',
  'CAPABILITY_UNAVAILABLE',
  'INVALID_INSERTION_CONTEXT',
  'INVALID_INPUT',
] as const;

const tocEntryMutationFailureSchema: JsonSchema = objectSchema(
  {
    success: { const: false },
    failure: objectSchema(
      {
        code: { enum: [...tocEntryMutationFailureCodes] },
        message: { type: 'string' },
        details: {},
      },
      ['code', 'message'],
    ),
  },
  ['success', 'failure'],
);

const tocEntryMutationSuccessSchema: JsonSchema = objectSchema(
  { success: { const: true }, entry: tocEntryAddressSchema() },
  ['success', 'entry'],
);

function tocEntryMutationResultSchema(): JsonSchema {
  return {
    oneOf: [tocEntryMutationSuccessSchema, tocEntryMutationFailureSchema],
  };
}

// ---------------------------------------------------------------------------
// Hyperlink schema helpers
// ---------------------------------------------------------------------------

const hyperlinkTargetSchema: JsonSchema = objectSchema(
  {
    kind: { const: 'inline' },
    nodeType: { const: 'hyperlink' },
    anchor: ref('InlineAnchor'),
  },
  ['kind', 'nodeType', 'anchor'],
);

const hyperlinkReadPropertiesSchema: JsonSchema = objectSchema({
  href: { type: 'string' },
  anchor: { type: 'string' },
  docLocation: { type: 'string' },
  tooltip: { type: 'string' },
  target: { type: 'string' },
  rel: { type: 'string' },
});

const hyperlinkDestinationSchema: JsonSchema = objectSchema({
  href: { type: 'string' },
  anchor: { type: 'string' },
  docLocation: { type: 'string' },
});

const hyperlinkSpecSchema: JsonSchema = objectSchema(
  {
    destination: hyperlinkDestinationSchema,
    tooltip: { type: 'string' },
    target: { type: 'string' },
    rel: { type: 'string' },
  },
  ['destination'],
);

const hyperlinkPatchSchema: JsonSchema = objectSchema({
  href: { oneOf: [{ type: 'string' }, { type: 'null' }] },
  anchor: { oneOf: [{ type: 'string' }, { type: 'null' }] },
  docLocation: { oneOf: [{ type: 'string' }, { type: 'null' }] },
  tooltip: { oneOf: [{ type: 'string' }, { type: 'null' }] },
  target: { oneOf: [{ type: 'string' }, { type: 'null' }] },
  rel: { oneOf: [{ type: 'string' }, { type: 'null' }] },
});

const hyperlinkDomainSchema: JsonSchema = objectSchema(
  {
    address: hyperlinkTargetSchema,
    properties: hyperlinkReadPropertiesSchema,
    text: { type: 'string' },
  },
  ['address', 'properties'],
);

const hyperlinkMutationSuccessSchema: JsonSchema = objectSchema(
  { success: { const: true }, hyperlink: hyperlinkTargetSchema },
  ['success', 'hyperlink'],
);

const hyperlinkMutationFailureCodes = [
  'NO_OP',
  'INVALID_TARGET',
  'TARGET_NOT_FOUND',
  'CAPABILITY_UNAVAILABLE',
] as const;

const hyperlinkMutationFailureSchema: JsonSchema = objectSchema(
  {
    success: { const: false },
    failure: objectSchema(
      {
        code: { enum: [...hyperlinkMutationFailureCodes] },
        message: { type: 'string' },
        details: { type: 'object' },
      },
      ['code', 'message'],
    ),
  },
  ['success', 'failure'],
);

function hyperlinkMutationResultSchema(): JsonSchema {
  return { oneOf: [hyperlinkMutationSuccessSchema, hyperlinkMutationFailureSchema] };
}

const hyperlinkInfoSchema: JsonSchema = objectSchema(
  {
    address: hyperlinkTargetSchema,
    properties: hyperlinkReadPropertiesSchema,
    text: { type: 'string' },
  },
  ['address', 'properties'],
);

// ---------------------------------------------------------------------------
// Content Controls shared schemas
// ---------------------------------------------------------------------------

const contentControlTargetSchema = objectSchema(
  {
    kind: { enum: ['block', 'inline'] },
    nodeType: { const: 'sdt' },
    nodeId: { type: 'string' },
  },
  ['kind', 'nodeType', 'nodeId'],
);

const contentControlMutationSuccessSchema = objectSchema(
  {
    success: { const: true },
    contentControl: contentControlTargetSchema,
    updatedRef: contentControlTargetSchema,
  },
  ['success', 'contentControl'],
);

const contentControlMutationFailureSchema = objectSchema(
  {
    success: { const: false },
    failure: { $ref: '#/$defs/ReceiptFailure' },
  },
  ['success', 'failure'],
);

function ccMutationResultSchema(): JsonSchema {
  return { oneOf: [contentControlMutationSuccessSchema, contentControlMutationFailureSchema] };
}

const ccListResultSchema = objectSchema(
  { items: { type: 'array', items: { type: 'object' } }, total: { type: 'integer' } },
  ['items', 'total'],
);

const ccInfoSchema: JsonSchema = { type: 'object', description: 'ContentControlInfo' };

function ccTargetInput(): JsonSchema {
  return objectSchema({ target: contentControlTargetSchema }, ['target']);
}

/** Generates all contentControls.* schemas in one helper to keep the main map DRY. */
type ContentControlOperationId = Extract<OperationId, 'create.contentControl' | `contentControls.${string}`>;

function buildContentControlSchemas(): Record<ContentControlOperationId, OperationSchemaSet> {
  const targetOnlyMutation: OperationSchemaSet = {
    input: ccTargetInput(),
    output: ccMutationResultSchema(),
    success: contentControlMutationSuccessSchema,
    failure: contentControlMutationFailureSchema,
  };

  const targetOnlyRead: OperationSchemaSet = {
    input: ccTargetInput(),
    output: ccInfoSchema,
  };

  const ccContentMutation: OperationSchemaSet = {
    input: objectSchema(
      { target: contentControlTargetSchema, content: { type: 'string' }, format: { enum: ['text', 'html'] } },
      ['target', 'content'],
    ),
    output: ccMutationResultSchema(),
    success: contentControlMutationSuccessSchema,
    failure: contentControlMutationFailureSchema,
  };

  return {
    'create.contentControl': {
      input: objectSchema(
        {
          kind: { enum: ['block', 'inline'] },
          controlType: { type: 'string' },
          target: contentControlTargetSchema,
          tag: { type: 'string' },
          alias: { type: 'string' },
          lockMode: { enum: ['unlocked', 'sdtLocked', 'contentLocked', 'sdtContentLocked'] },
          content: { type: 'string' },
        },
        ['kind'],
      ),
      output: ccMutationResultSchema(),
      success: contentControlMutationSuccessSchema,
      failure: contentControlMutationFailureSchema,
    },
    'contentControls.list': {
      input: objectSchema({
        controlType: { type: 'string' },
        tag: { type: 'string' },
        offset: { type: 'integer' },
        limit: { type: 'integer' },
      }),
      output: ccListResultSchema,
    },
    'contentControls.get': targetOnlyRead,
    'contentControls.listInRange': {
      input: objectSchema(
        {
          startBlockId: { type: 'string' },
          endBlockId: { type: 'string' },
          offset: { type: 'integer' },
          limit: { type: 'integer' },
        },
        ['startBlockId', 'endBlockId'],
      ),
      output: ccListResultSchema,
    },
    'contentControls.selectByTag': {
      input: objectSchema({ tag: { type: 'string' }, offset: { type: 'integer' }, limit: { type: 'integer' } }, [
        'tag',
      ]),
      output: ccListResultSchema,
    },
    'contentControls.selectByTitle': {
      input: objectSchema({ title: { type: 'string' }, offset: { type: 'integer' }, limit: { type: 'integer' } }, [
        'title',
      ]),
      output: ccListResultSchema,
    },
    'contentControls.listChildren': {
      input: objectSchema(
        { target: contentControlTargetSchema, offset: { type: 'integer' }, limit: { type: 'integer' } },
        ['target'],
      ),
      output: ccListResultSchema,
    },
    'contentControls.getParent': { input: ccTargetInput(), output: { oneOf: [ccInfoSchema, { type: 'null' }] } },
    'contentControls.wrap': {
      input: objectSchema(
        {
          kind: { enum: ['block', 'inline'] },
          target: contentControlTargetSchema,
          tag: { type: 'string' },
          alias: { type: 'string' },
          lockMode: { enum: ['unlocked', 'sdtLocked', 'contentLocked', 'sdtContentLocked'] },
        },
        ['kind', 'target'],
      ),
      output: ccMutationResultSchema(),
      success: contentControlMutationSuccessSchema,
      failure: contentControlMutationFailureSchema,
    },
    'contentControls.unwrap': targetOnlyMutation,
    'contentControls.delete': targetOnlyMutation,
    'contentControls.copy': {
      input: objectSchema({ target: contentControlTargetSchema, destination: contentControlTargetSchema }, [
        'target',
        'destination',
      ]),
      output: ccMutationResultSchema(),
      success: contentControlMutationSuccessSchema,
      failure: contentControlMutationFailureSchema,
    },
    'contentControls.move': {
      input: objectSchema({ target: contentControlTargetSchema, destination: contentControlTargetSchema }, [
        'target',
        'destination',
      ]),
      output: ccMutationResultSchema(),
      success: contentControlMutationSuccessSchema,
      failure: contentControlMutationFailureSchema,
    },
    'contentControls.patch': {
      input: objectSchema(
        {
          target: contentControlTargetSchema,
          alias: {},
          tag: {},
          appearance: { enum: ['boundingBox', 'tags', 'hidden'] },
          color: { type: 'string' },
          placeholder: { type: 'string' },
          showingPlaceholder: { type: 'boolean' },
          temporary: { type: 'boolean' },
          tabIndex: { type: 'integer' },
        },
        ['target'],
      ),
      output: ccMutationResultSchema(),
      success: contentControlMutationSuccessSchema,
      failure: contentControlMutationFailureSchema,
    },
    'contentControls.setLockMode': {
      input: objectSchema(
        {
          target: contentControlTargetSchema,
          lockMode: { enum: ['unlocked', 'sdtLocked', 'contentLocked', 'sdtContentLocked'] },
        },
        ['target', 'lockMode'],
      ),
      output: ccMutationResultSchema(),
      success: contentControlMutationSuccessSchema,
      failure: contentControlMutationFailureSchema,
    },
    'contentControls.setType': {
      input: objectSchema({ target: contentControlTargetSchema, controlType: { type: 'string' } }, [
        'target',
        'controlType',
      ]),
      output: ccMutationResultSchema(),
      success: contentControlMutationSuccessSchema,
      failure: contentControlMutationFailureSchema,
    },
    'contentControls.getContent': {
      input: ccTargetInput(),
      output: objectSchema({ content: { type: 'string' }, format: { enum: ['text', 'html'] } }, ['content', 'format']),
    },
    'contentControls.replaceContent': ccContentMutation,
    'contentControls.clearContent': targetOnlyMutation,
    'contentControls.appendContent': ccContentMutation,
    'contentControls.prependContent': ccContentMutation,
    'contentControls.insertBefore': ccContentMutation,
    'contentControls.insertAfter': ccContentMutation,

    // Binding
    'contentControls.getBinding': {
      input: ccTargetInput(),
      output: {
        oneOf: [
          objectSchema(
            { storeItemId: { type: 'string' }, xpath: { type: 'string' }, prefixMappings: { type: 'string' } },
            ['storeItemId', 'xpath'],
          ),
          { type: 'null' },
        ],
      },
    },
    'contentControls.setBinding': {
      input: objectSchema(
        {
          target: contentControlTargetSchema,
          storeItemId: { type: 'string' },
          xpath: { type: 'string' },
          prefixMappings: { type: 'string' },
        },
        ['target', 'storeItemId', 'xpath'],
      ),
      output: ccMutationResultSchema(),
      success: contentControlMutationSuccessSchema,
      failure: contentControlMutationFailureSchema,
    },
    'contentControls.clearBinding': targetOnlyMutation,
    'contentControls.getRawProperties': {
      input: ccTargetInput(),
      output: objectSchema({ properties: { type: 'object' } }, ['properties']),
    },
    'contentControls.patchRawProperties': {
      input: objectSchema(
        { target: contentControlTargetSchema, patches: { type: 'array', items: { type: 'object' } } },
        ['target', 'patches'],
      ),
      output: ccMutationResultSchema(),
      success: contentControlMutationSuccessSchema,
      failure: contentControlMutationFailureSchema,
    },
    'contentControls.validateWordCompatibility': {
      input: ccTargetInput(),
      output: objectSchema(
        { compatible: { type: 'boolean' }, diagnostics: { type: 'array', items: { type: 'object' } } },
        ['compatible', 'diagnostics'],
      ),
    },
    'contentControls.normalizeWordCompatibility': targetOnlyMutation,
    'contentControls.normalizeTagPayload': targetOnlyMutation,

    // Text
    'contentControls.text.setMultiline': {
      input: objectSchema({ target: contentControlTargetSchema, multiline: { type: 'boolean' } }, [
        'target',
        'multiline',
      ]),
      output: ccMutationResultSchema(),
      success: contentControlMutationSuccessSchema,
      failure: contentControlMutationFailureSchema,
    },
    'contentControls.text.setValue': {
      input: objectSchema({ target: contentControlTargetSchema, value: { type: 'string' } }, ['target', 'value']),
      output: ccMutationResultSchema(),
      success: contentControlMutationSuccessSchema,
      failure: contentControlMutationFailureSchema,
    },
    'contentControls.text.clearValue': targetOnlyMutation,

    // Date
    'contentControls.date.setValue': {
      input: objectSchema({ target: contentControlTargetSchema, value: { type: 'string' } }, ['target', 'value']),
      output: ccMutationResultSchema(),
      success: contentControlMutationSuccessSchema,
      failure: contentControlMutationFailureSchema,
    },
    'contentControls.date.clearValue': targetOnlyMutation,
    'contentControls.date.setDisplayFormat': {
      input: objectSchema({ target: contentControlTargetSchema, format: { type: 'string' } }, ['target', 'format']),
      output: ccMutationResultSchema(),
      success: contentControlMutationSuccessSchema,
      failure: contentControlMutationFailureSchema,
    },
    'contentControls.date.setDisplayLocale': {
      input: objectSchema({ target: contentControlTargetSchema, locale: { type: 'string' } }, ['target', 'locale']),
      output: ccMutationResultSchema(),
      success: contentControlMutationSuccessSchema,
      failure: contentControlMutationFailureSchema,
    },
    'contentControls.date.setStorageFormat': {
      input: objectSchema({ target: contentControlTargetSchema, format: { type: 'string' } }, ['target', 'format']),
      output: ccMutationResultSchema(),
      success: contentControlMutationSuccessSchema,
      failure: contentControlMutationFailureSchema,
    },
    'contentControls.date.setCalendar': {
      input: objectSchema({ target: contentControlTargetSchema, calendar: { type: 'string' } }, ['target', 'calendar']),
      output: ccMutationResultSchema(),
      success: contentControlMutationSuccessSchema,
      failure: contentControlMutationFailureSchema,
    },

    // Checkbox
    'contentControls.checkbox.getState': {
      input: ccTargetInput(),
      output: objectSchema({ checked: { type: 'boolean' } }, ['checked']),
    },
    'contentControls.checkbox.setState': {
      input: objectSchema({ target: contentControlTargetSchema, checked: { type: 'boolean' } }, ['target', 'checked']),
      output: ccMutationResultSchema(),
      success: contentControlMutationSuccessSchema,
      failure: contentControlMutationFailureSchema,
    },
    'contentControls.checkbox.toggle': targetOnlyMutation,
    'contentControls.checkbox.setSymbolPair': {
      input: objectSchema(
        { target: contentControlTargetSchema, checkedSymbol: { type: 'object' }, uncheckedSymbol: { type: 'object' } },
        ['target', 'checkedSymbol', 'uncheckedSymbol'],
      ),
      output: ccMutationResultSchema(),
      success: contentControlMutationSuccessSchema,
      failure: contentControlMutationFailureSchema,
    },

    // Choice list
    'contentControls.choiceList.getItems': {
      input: ccTargetInput(),
      output: objectSchema({ items: { type: 'array', items: { type: 'object' } }, selectedValue: { type: 'string' } }, [
        'items',
      ]),
    },
    'contentControls.choiceList.setItems': {
      input: objectSchema({ target: contentControlTargetSchema, items: { type: 'array', items: { type: 'object' } } }, [
        'target',
        'items',
      ]),
      output: ccMutationResultSchema(),
      success: contentControlMutationSuccessSchema,
      failure: contentControlMutationFailureSchema,
    },
    'contentControls.choiceList.setSelected': {
      input: objectSchema({ target: contentControlTargetSchema, value: { type: 'string' } }, ['target', 'value']),
      output: ccMutationResultSchema(),
      success: contentControlMutationSuccessSchema,
      failure: contentControlMutationFailureSchema,
    },

    // Repeating section
    'contentControls.repeatingSection.listItems': { input: ccTargetInput(), output: ccListResultSchema },
    'contentControls.repeatingSection.insertItemBefore': {
      input: objectSchema({ target: contentControlTargetSchema, index: { type: 'integer' } }, ['target', 'index']),
      output: ccMutationResultSchema(),
      success: contentControlMutationSuccessSchema,
      failure: contentControlMutationFailureSchema,
    },
    'contentControls.repeatingSection.insertItemAfter': {
      input: objectSchema({ target: contentControlTargetSchema, index: { type: 'integer' } }, ['target', 'index']),
      output: ccMutationResultSchema(),
      success: contentControlMutationSuccessSchema,
      failure: contentControlMutationFailureSchema,
    },
    'contentControls.repeatingSection.cloneItem': {
      input: objectSchema({ target: contentControlTargetSchema, index: { type: 'integer' } }, ['target', 'index']),
      output: ccMutationResultSchema(),
      success: contentControlMutationSuccessSchema,
      failure: contentControlMutationFailureSchema,
    },
    'contentControls.repeatingSection.deleteItem': {
      input: objectSchema({ target: contentControlTargetSchema, index: { type: 'integer' } }, ['target', 'index']),
      output: ccMutationResultSchema(),
      success: contentControlMutationSuccessSchema,
      failure: contentControlMutationFailureSchema,
    },
    'contentControls.repeatingSection.setAllowInsertDelete': {
      input: objectSchema({ target: contentControlTargetSchema, allow: { type: 'boolean' } }, ['target', 'allow']),
      output: ccMutationResultSchema(),
      success: contentControlMutationSuccessSchema,
      failure: contentControlMutationFailureSchema,
    },

    // Group
    'contentControls.group.wrap': targetOnlyMutation,
    'contentControls.group.ungroup': targetOnlyMutation,
  };
}
// Reference namespace schema helpers
// ---------------------------------------------------------------------------

// --- Shared patterns ---
const refListQuerySchema = objectSchema({
  limit: { type: 'integer', minimum: 1 },
  offset: { type: 'integer', minimum: 0 },
});

const discoveryOutputSchema: JsonSchema = { type: 'object' };

const receiptFailureSchema: JsonSchema = objectSchema(
  {
    code: { type: 'string' },
    message: { type: 'string' },
    details: {},
  },
  ['code', 'message'],
);

/** Failure branch shared by all reference-namespace mutation results. */
const refFailureSchema: JsonSchema = objectSchema({ success: { const: false }, failure: receiptFailureSchema }, [
  'success',
  'failure',
]);

/** Creates output, success, and failure schemas for a reference-namespace mutation. */
function refMutationSchemas(
  successProperties: Record<string, JsonSchema>,
  requiredSuccess: string[],
): { output: JsonSchema; success: JsonSchema; failure: JsonSchema } {
  const success = objectSchema({ success: { const: true }, ...successProperties }, ['success', ...requiredSuccess]);
  return {
    output: { oneOf: [success, refFailureSchema] },
    success,
    failure: refFailureSchema,
  };
}

/** Creates output, success, and failure schemas for a config-style mutation (no address in success). */
function refConfigSchemas(): { output: JsonSchema; success: JsonSchema; failure: JsonSchema } {
  const success = objectSchema({ success: { const: true } }, ['success']);
  return {
    output: { oneOf: [success, refFailureSchema] },
    success,
    failure: refFailureSchema,
  };
}

// --- Bookmark schemas ---
const bookmarkAddressSchema: JsonSchema = objectSchema(
  { kind: { const: 'entity' }, entityType: { const: 'bookmark' }, name: { type: 'string' } },
  ['kind', 'entityType', 'name'],
);

const bookmarkMutation = refMutationSchemas({ bookmark: bookmarkAddressSchema }, ['bookmark']);

// --- Footnote schemas ---
const footnoteAddressSchema: JsonSchema = objectSchema(
  { kind: { const: 'entity' }, entityType: { const: 'footnote' }, noteId: { type: 'string' } },
  ['kind', 'entityType', 'noteId'],
);

const footnoteConfigScopeSchema: JsonSchema = {
  oneOf: [
    objectSchema({ kind: { const: 'document' } }, ['kind']),
    objectSchema({ kind: { const: 'section' }, sectionId: { type: 'string' } }, ['kind', 'sectionId']),
  ],
};

const footnoteNumberingSchema: JsonSchema = objectSchema({
  format: { enum: ['decimal', 'lowerRoman', 'upperRoman', 'lowerLetter', 'upperLetter', 'symbol'] },
  start: { type: 'integer' },
  restartPolicy: { enum: ['continuous', 'eachSection', 'eachPage'] },
  position: { enum: ['pageBottom', 'beneathText', 'sectionEnd', 'documentEnd'] },
});

const footnoteMutation = refMutationSchemas({ footnote: footnoteAddressSchema }, ['footnote']);
const footnoteConfig = refConfigSchemas();

// --- CrossRef schemas ---
const crossRefAddressSchema: JsonSchema = objectSchema(
  { kind: { const: 'inline' }, nodeType: { const: 'crossRef' }, anchor: ref('InlineAnchor') },
  ['kind', 'nodeType', 'anchor'],
);

const crossRefTargetSchema: JsonSchema = {
  oneOf: [
    objectSchema({ kind: { const: 'bookmark' }, name: { type: 'string' } }, ['kind', 'name']),
    objectSchema({ kind: { const: 'heading' }, nodeId: { type: 'string' } }, ['kind', 'nodeId']),
    objectSchema({ kind: { const: 'note' }, noteId: { type: 'string' } }, ['kind', 'noteId']),
    objectSchema({ kind: { const: 'caption' }, nodeId: { type: 'string' } }, ['kind', 'nodeId']),
    objectSchema({ kind: { const: 'numberedItem' }, nodeId: { type: 'string' } }, ['kind', 'nodeId']),
    objectSchema(
      { kind: { const: 'styledParagraph' }, styleName: { type: 'string' }, direction: { enum: ['before', 'after'] } },
      ['kind', 'styleName'],
    ),
  ],
};

const crossRefDisplaySchema: JsonSchema = {
  enum: [
    'content',
    'pageNumber',
    'noteNumber',
    'labelAndNumber',
    'aboveBelow',
    'numberOnly',
    'numberFullContext',
    'styledContent',
    'styledPageNumber',
  ],
};

const crossRefMutation = refMutationSchemas({ crossRef: crossRefAddressSchema }, ['crossRef']);

// --- Index schemas ---
const indexAddressSchema: JsonSchema = objectSchema(
  { kind: { const: 'block' }, nodeType: { const: 'index' }, nodeId: { type: 'string' } },
  ['kind', 'nodeType', 'nodeId'],
);

const indexEntryAddressSchema: JsonSchema = objectSchema(
  { kind: { const: 'inline' }, nodeType: { const: 'indexEntry' }, anchor: ref('InlineAnchor') },
  ['kind', 'nodeType', 'anchor'],
);

const indexConfigSchema: JsonSchema = objectSchema({
  headingSeparator: { type: 'string' },
  entryPageSeparator: { type: 'string' },
  pageRangeSeparator: { type: 'string' },
  sequenceId: { type: 'string' },
  columns: { type: 'integer' },
  entryTypeFilter: { type: 'string' },
  pageRangeBookmark: { type: 'string' },
  letterRange: objectSchema({ from: { type: 'string' }, to: { type: 'string' } }, ['from', 'to']),
  runIn: { type: 'boolean' },
  accentedSorting: { type: 'boolean' },
});

const indexEntryDataSchema: JsonSchema = objectSchema(
  {
    text: { type: 'string' },
    subEntry: { type: 'string' },
    bold: { type: 'boolean' },
    italic: { type: 'boolean' },
    crossReference: { type: 'string' },
    pageRangeBookmark: { type: 'string' },
    entryType: { type: 'string' },
    yomi: { type: 'string' },
  },
  ['text'],
);

const indexEntryPatchSchema: JsonSchema = objectSchema({
  text: { type: 'string' },
  subEntry: { type: 'string' },
  bold: { type: 'boolean' },
  italic: { type: 'boolean' },
  crossReference: { type: 'string' },
  pageRangeBookmark: { type: 'string' },
  entryType: { type: 'string' },
  yomi: { type: 'string' },
});

const indexMutation = refMutationSchemas({ index: indexAddressSchema }, ['index']);
const indexEntryMutation = refMutationSchemas({ entry: indexEntryAddressSchema }, ['entry']);

// --- Caption schemas ---
const captionAddressSchema: JsonSchema = objectSchema(
  { kind: { const: 'block' }, nodeType: { const: 'paragraph' }, nodeId: { type: 'string' } },
  ['kind', 'nodeType', 'nodeId'],
);

const captionMutation = refMutationSchemas({ caption: captionAddressSchema }, ['caption']);
const captionConfig = refConfigSchemas();

// --- Field schemas ---
const fieldAddressSchema: JsonSchema = objectSchema(
  {
    kind: { const: 'field' },
    blockId: { type: 'string' },
    occurrenceIndex: { type: 'integer' },
    nestingDepth: { type: 'integer' },
  },
  ['kind', 'blockId', 'occurrenceIndex'],
);

const fieldMutation = refMutationSchemas({ field: fieldAddressSchema }, ['field']);

// --- Citation schemas ---
const citationAddressSchema: JsonSchema = objectSchema(
  { kind: { const: 'inline' }, nodeType: { const: 'citation' }, anchor: ref('InlineAnchor') },
  ['kind', 'nodeType', 'anchor'],
);

const citationSourceAddressSchema: JsonSchema = objectSchema(
  { kind: { const: 'entity' }, entityType: { const: 'citationSource' }, sourceId: { type: 'string' } },
  ['kind', 'entityType', 'sourceId'],
);

const bibliographyAddressSchema: JsonSchema = objectSchema(
  { kind: { const: 'block' }, nodeType: { const: 'bibliography' }, nodeId: { type: 'string' } },
  ['kind', 'nodeType', 'nodeId'],
);

const citationMutation = refMutationSchemas({ citation: citationAddressSchema }, ['citation']);
const citationSourceMutation = refMutationSchemas({ source: citationSourceAddressSchema }, ['source']);
const bibliographyMutation = refMutationSchemas({ bibliography: bibliographyAddressSchema }, ['bibliography']);

const citationPersonSchema: JsonSchema = objectSchema(
  {
    first: { type: 'string' },
    middle: { type: 'string' },
    last: { type: 'string' },
  },
  ['last'],
);

const citationSourceFieldsSchema: JsonSchema = objectSchema({
  title: { type: 'string' },
  authors: arraySchema(citationPersonSchema),
  year: { type: 'string' },
  publisher: { type: 'string' },
  city: { type: 'string' },
  journalName: { type: 'string' },
  volume: { type: 'string' },
  issue: { type: 'string' },
  pages: { type: 'string' },
  url: { type: 'string' },
  doi: { type: 'string' },
  edition: { type: 'string' },
  editor: arraySchema(citationPersonSchema),
  translator: arraySchema(citationPersonSchema),
  medium: { type: 'string' },
  shortTitle: { type: 'string' },
  standardNumber: { type: 'string' },
});

const tocCreateLocationSchema: JsonSchema = {
  oneOf: [
    objectSchema({ kind: { const: 'documentStart' } }, ['kind']),
    objectSchema({ kind: { const: 'documentEnd' } }, ['kind']),
    objectSchema({ kind: { const: 'before' }, target: blockNodeAddressSchema }, ['kind', 'target']),
    objectSchema({ kind: { const: 'after' }, target: blockNodeAddressSchema }, ['kind', 'target']),
  ],
};

// --- Authorities schemas ---
const authoritiesAddressSchema: JsonSchema = objectSchema(
  { kind: { const: 'block' }, nodeType: { const: 'tableOfAuthorities' }, nodeId: { type: 'string' } },
  ['kind', 'nodeType', 'nodeId'],
);

const authorityEntryAddressSchema: JsonSchema = objectSchema(
  { kind: { const: 'inline' }, nodeType: { const: 'authorityEntry' }, anchor: ref('InlineAnchor') },
  ['kind', 'nodeType', 'anchor'],
);

const authoritiesConfigSchema: JsonSchema = objectSchema({
  category: { type: 'integer' },
  entryPageSeparator: { type: 'string' },
  usePassim: { type: 'boolean' },
  includeHeadings: { type: 'boolean' },
  tabLeader: { type: 'string' },
  pageRangeSeparator: { type: 'string' },
});

const authorityEntryDataSchema: JsonSchema = objectSchema(
  {
    longCitation: { type: 'string' },
    shortCitation: { type: 'string' },
    category: { oneOf: [{ type: 'string' }, { type: 'integer' }] },
    bold: { type: 'boolean' },
    italic: { type: 'boolean' },
  },
  ['longCitation', 'category'],
);

const authorityEntryPatchSchema: JsonSchema = objectSchema({
  longCitation: { type: 'string' },
  shortCitation: { type: 'string' },
  category: { oneOf: [{ type: 'string' }, { type: 'integer' }] },
  bold: { type: 'boolean' },
  italic: { type: 'boolean' },
});

const authoritiesMutation = refMutationSchemas({ authorities: authoritiesAddressSchema }, ['authorities']);
const authorityEntryMutation = refMutationSchemas({ entry: authorityEntryAddressSchema }, ['entry']);

// --- Diff schemas ---

const diffCoverageSchema: JsonSchema = objectSchema(
  {
    body: { type: 'boolean', const: true },
    comments: { type: 'boolean' },
    styles: { type: 'boolean' },
    numbering: { type: 'boolean' },
    headerFooters: { type: 'boolean' },
  },
  ['body', 'comments', 'styles', 'numbering', 'headerFooters'],
);

const diffSummarySchema: JsonSchema = objectSchema(
  {
    hasChanges: { type: 'boolean' },
    changedComponents: {
      type: 'array',
      items: { type: 'string', enum: ['body', 'comments', 'styles', 'numbering', 'headerFooters', 'parts'] },
    },
    body: objectSchema({ hasChanges: { type: 'boolean' } }, ['hasChanges']),
    comments: objectSchema({ hasChanges: { type: 'boolean' } }, ['hasChanges']),
    styles: objectSchema({ hasChanges: { type: 'boolean' } }, ['hasChanges']),
    numbering: objectSchema({ hasChanges: { type: 'boolean' } }, ['hasChanges']),
    headerFooters: objectSchema({ hasChanges: { type: 'boolean' } }, ['hasChanges']),
    parts: objectSchema({ hasChanges: { type: 'boolean' } }, ['hasChanges']),
  },
  ['hasChanges', 'changedComponents', 'body', 'comments', 'styles', 'numbering', 'headerFooters', 'parts'],
);

const diffSnapshotSchema: JsonSchema = objectSchema(
  {
    version: { type: 'string', enum: ['sd-diff-snapshot/v1', 'sd-diff-snapshot/v2'] },
    engine: { type: 'string', enum: ['super-editor'] },
    fingerprint: { type: 'string' },
    coverage: diffCoverageSchema,
    payload: { type: 'object', description: 'Opaque engine-owned snapshot data.' },
  },
  ['version', 'engine', 'fingerprint', 'coverage', 'payload'],
);

const diffPayloadSchema: JsonSchema = objectSchema(
  {
    version: { type: 'string', enum: ['sd-diff-payload/v1', 'sd-diff-payload/v2'] },
    engine: { type: 'string', enum: ['super-editor'] },
    baseFingerprint: { type: 'string' },
    targetFingerprint: { type: 'string' },
    coverage: diffCoverageSchema,
    summary: diffSummarySchema,
    payload: { type: 'object', description: 'Opaque engine-owned diff data.' },
  },
  ['version', 'engine', 'baseFingerprint', 'targetFingerprint', 'coverage', 'summary', 'payload'],
);

const diffApplyResultSchema: JsonSchema = objectSchema(
  {
    appliedOperations: { type: 'integer' },
    baseFingerprint: { type: 'string' },
    targetFingerprint: { type: 'string' },
    coverage: diffCoverageSchema,
    summary: diffSummarySchema,
    diagnostics: { type: 'array', items: { type: 'string' } },
  },
  ['appliedOperations', 'baseFingerprint', 'targetFingerprint', 'coverage', 'summary', 'diagnostics'],
);

const operationSchemas: Record<OperationId, OperationSchemaSet> = {
  get: {
    input: objectSchema({
      options: objectSchema({
        includeResolved: { type: 'boolean' },
        includeProvenance: { type: 'boolean' },
        includeContext: { type: 'boolean' },
      }),
    }),
    output: objectSchema(
      {
        modelVersion: { const: 'sdm/1' },
        body: { type: 'array' },
      },
      ['modelVersion', 'body'],
    ),
  },
  find: {
    input: sdFindInputSchema,
    output: sdFindResultSchema,
  },
  getNode: {
    input: nodeAddressSchema,
    output: sdNodeResultSchema,
  },
  getNodeById: {
    input: objectSchema(
      {
        nodeId: { type: 'string' },
        nodeType: { enum: [...blockNodeTypeValues] },
      },
      ['nodeId'],
    ),
    output: sdNodeResultSchema,
  },
  getText: {
    input: objectSchema({
      in: storyLocatorSchema,
    }),
    output: { type: 'string' },
  },
  getMarkdown: {
    input: objectSchema({
      in: storyLocatorSchema,
    }),
    output: { type: 'string' },
  },
  getHtml: {
    input: objectSchema({
      in: storyLocatorSchema,
      unflattenLists: {
        type: 'boolean',
        description: 'When true, flattens nested list structures in output. Default: false.',
      },
    }),
    output: { type: 'string' },
  },
  markdownToFragment: {
    input: objectSchema({ markdown: { type: 'string' } }, ['markdown']),
    output: objectSchema(
      {
        fragment: {},
        lossy: { type: 'boolean' },
        diagnostics: arraySchema(
          objectSchema(
            {
              code: { type: 'string' },
              severity: { type: 'string', enum: ['error', 'warning', 'info'] },
              message: { type: 'string' },
              path: arraySchema({ type: 'string' }),
            },
            ['code', 'severity', 'message'],
          ),
        ),
      },
      ['fragment', 'lossy', 'diagnostics'],
    ),
  },
  info: {
    input: strictEmptyObjectSchema,
    output: documentInfoSchema,
  },
  clearContent: {
    input: strictEmptyObjectSchema,
    output: receiptResultSchemaFor('clearContent'),
    success: receiptSuccessSchema,
    failure: receiptFailureResultSchemaFor('clearContent'),
  },
  insert: {
    input: insertInputSchema,
    output: sdMutationResultSchemaFor('insert'),
    success: sdMutationSuccessSchema,
    failure: sdMutationFailureSchemaFor('insert'),
  },
  replace: {
    input: {
      oneOf: [
        // Text replacement: TargetLocator + text
        {
          ...targetLocatorWithPayload(
            {
              in: storyLocatorSchema,
              text: { type: 'string', description: 'Replacement text content.' },
            },
            ['text'],
          ),
        },
        // Structural replacement: exactly one of (target | ref) + content
        {
          oneOf: [
            objectSchema(
              {
                in: storyLocatorSchema,
                target: {
                  oneOf: [blockNodeAddressSchema, selectionTargetSchema],
                  description: 'Target block or selection to replace.',
                },
                content: {
                  ...sdFragmentSchema,
                  description: 'Document fragment to replace with (structured content).',
                },
                nestingPolicy: nestingPolicySchema,
              },
              ['target', 'content'],
            ),
            objectSchema(
              {
                in: storyLocatorSchema,
                ref: { type: 'string', description: 'Reference handle from a previous search result.' },
                content: {
                  ...sdFragmentSchema,
                  description: 'Document fragment to replace with (structured content).',
                },
                nestingPolicy: nestingPolicySchema,
              },
              ['ref', 'content'],
            ),
          ],
        },
      ],
    },
    output: sdMutationResultSchemaFor('replace'),
    success: sdMutationSuccessSchema,
    failure: sdMutationFailureSchemaFor('replace'),
  },
  delete: {
    input: {
      ...targetLocatorWithPayload({
        in: storyLocatorSchema,
        behavior: { ...deleteBehaviorSchema, description: "Delete behavior: 'selection' (default) or 'exact'." },
      }),
    },
    output: textMutationResultSchemaFor('delete'),
    success: textMutationSuccessSchema,
    failure: textMutationFailureSchemaFor('delete'),
  },
  'format.apply': {
    input: {
      ...targetLocatorWithPayload(
        {
          in: storyLocatorSchema,
          inline: {
            ...buildInlineRunPatchSchema(),
            description:
              'Inline formatting properties to apply. Set a property to apply it, use null to clear it. Example: {bold: true, italic: true} or {bold: null} to remove bold.',
          },
        },
        ['inline'],
      ),
    },
    output: textMutationResultSchemaFor('format.apply'),
    success: textMutationSuccessSchema,
    failure: textMutationFailureSchemaFor('format.apply'),
  },
  ...formatInlineAliasOperationSchemas,
  'blocks.list': {
    input: objectSchema({
      offset: { type: 'number', minimum: 0, description: 'Number of blocks to skip. Default: 0.' },
      limit: { type: 'number', minimum: 1, description: 'Maximum blocks to return. Omit for all blocks.' },
      nodeTypes: {
        type: 'array',
        items: { enum: [...blockNodeTypeValues] },
        description: "Filter by block types (e.g. ['paragraph', 'heading']). Omit for all types.",
      },
    }),
    output: objectSchema(
      {
        total: { type: 'number' },
        blocks: {
          type: 'array',
          items: objectSchema(
            {
              ordinal: { type: 'number' },
              nodeId: { type: 'string', description: 'Block ID for targeting with other tools.' },
              nodeType: { enum: [...blockNodeTypeValues] },
              textPreview: { oneOf: [{ type: 'string' }, { type: 'null' }] },
              isEmpty: { type: 'boolean' },
              styleId: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Named paragraph style.' },
              fontFamily: { type: 'string', description: 'Font family from first text run.' },
              fontSize: { type: 'number', description: 'Font size from first text run.' },
              bold: { type: 'boolean', description: 'True if text is bold.' },
              color: { type: 'string', description: "Text color when explicitly set (e.g. '#000000')." },
              alignment: { type: 'string', description: 'Paragraph alignment.' },
              headingLevel: { type: 'number', description: 'Heading level (1-6).' },
              ref: {
                type: 'string',
                description:
                  'Ref handle for this block. Pass directly to superdoc_format or superdoc_edit ref param. Only present for non-empty blocks.',
              },
            },
            ['ordinal', 'nodeId', 'nodeType'],
          ),
        },
        revision: { type: 'string' },
      },
      ['total', 'blocks', 'revision'],
    ),
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
        deletedBlock: objectSchema({
          ordinal: { type: 'number' },
          nodeId: { type: 'string' },
          nodeType: { type: 'string' },
          textPreview: { oneOf: [{ type: 'string' }, { type: 'null' }] },
        }),
      },
      ['success', 'deleted'],
    ),
    success: objectSchema(
      {
        success: { const: true },
        deleted: deletableBlockNodeAddressSchema,
        deletedBlock: objectSchema({
          ordinal: { type: 'number' },
          nodeId: { type: 'string' },
          nodeType: { type: 'string' },
          textPreview: { oneOf: [{ type: 'string' }, { type: 'null' }] },
        }),
      },
      ['success', 'deleted'],
    ),
    failure: preApplyFailureResultSchemaFor('blocks.delete'),
  },
  'blocks.deleteRange': {
    input: objectSchema(
      {
        start: blockNodeAddressSchema,
        end: blockNodeAddressSchema,
      },
      ['start', 'end'],
    ),
    output: objectSchema(
      {
        success: { const: true },
        deletedCount: { type: 'number' },
        deletedBlocks: {
          type: 'array',
          items: objectSchema(
            {
              ordinal: { type: 'number' },
              nodeId: { type: 'string' },
              nodeType: { type: 'string' },
              textPreview: { oneOf: [{ type: 'string' }, { type: 'null' }] },
            },
            ['ordinal', 'nodeId', 'nodeType', 'textPreview'],
          ),
        },
        revision: objectSchema(
          {
            before: { type: 'string' },
            after: { type: 'string' },
          },
          ['before', 'after'],
        ),
        dryRun: { type: 'boolean' },
      },
      ['success', 'deletedCount', 'deletedBlocks', 'revision', 'dryRun'],
    ),
    success: objectSchema(
      {
        success: { const: true },
        deletedCount: { type: 'number' },
        deletedBlocks: { type: 'array' },
        revision: objectSchema({ before: { type: 'string' }, after: { type: 'string' } }, ['before', 'after']),
        dryRun: { type: 'boolean' },
      },
      ['success', 'deletedCount', 'deletedBlocks', 'revision', 'dryRun'],
    ),
    failure: preApplyFailureResultSchemaFor('blocks.deleteRange'),
  },

  // --- styles.paragraph.* ---
  'styles.paragraph.setStyle': {
    input: objectSchema(
      {
        target: paragraphTargetSchema,
        styleId: {
          type: 'string',
          minLength: 1,
          description:
            "Named paragraph style ID (e.g. 'Normal', 'Heading1', 'BodyText'). Use superdoc_search to find a nearby paragraph, then inspect its style to determine the correct styleId.",
        },
      },
      ['target', 'styleId'],
    ),
    output: paragraphMutationResultSchemaFor('styles.paragraph.setStyle'),
    success: paragraphMutationSuccessSchema,
    failure: paragraphMutationFailureSchemaFor('styles.paragraph.setStyle'),
  },
  'styles.paragraph.clearStyle': {
    input: objectSchema({ target: paragraphTargetSchema }, ['target']),
    output: paragraphMutationResultSchemaFor('styles.paragraph.clearStyle'),
    success: paragraphMutationSuccessSchema,
    failure: paragraphMutationFailureSchemaFor('styles.paragraph.clearStyle'),
  },

  // --- format.paragraph.* ---
  'format.paragraph.resetDirectFormatting': {
    input: objectSchema({ target: paragraphTargetSchema }, ['target']),
    output: paragraphMutationResultSchemaFor('format.paragraph.resetDirectFormatting'),
    success: paragraphMutationSuccessSchema,
    failure: paragraphMutationFailureSchemaFor('format.paragraph.resetDirectFormatting'),
  },
  'format.paragraph.setAlignment': {
    input: objectSchema({ target: paragraphTargetSchema, alignment: { enum: [...PARAGRAPH_ALIGNMENTS] } }, [
      'target',
      'alignment',
    ]),
    output: paragraphMutationResultSchemaFor('format.paragraph.setAlignment'),
    success: paragraphMutationSuccessSchema,
    failure: paragraphMutationFailureSchemaFor('format.paragraph.setAlignment'),
  },
  'format.paragraph.clearAlignment': {
    input: objectSchema({ target: paragraphTargetSchema }, ['target']),
    output: paragraphMutationResultSchemaFor('format.paragraph.clearAlignment'),
    success: paragraphMutationSuccessSchema,
    failure: paragraphMutationFailureSchemaFor('format.paragraph.clearAlignment'),
  },
  'format.paragraph.setIndentation': {
    input: {
      ...objectSchema(
        {
          target: paragraphTargetSchema,
          left: { type: 'integer', minimum: 0, description: 'Left indentation in twips (1440 = 1 inch).' },
          right: { type: 'integer', minimum: 0, description: 'Right indentation in twips (1440 = 1 inch).' },
          firstLine: {
            type: 'integer',
            minimum: 0,
            description: 'First line indent in twips. Cannot be combined with hanging.',
          },
          hanging: {
            type: 'integer',
            minimum: 0,
            description: 'Hanging indent in twips. Cannot be combined with firstLine.',
          },
        },
        ['target'],
      ),
      anyOf: [{ required: ['left'] }, { required: ['right'] }, { required: ['firstLine'] }, { required: ['hanging'] }],
      not: { required: ['firstLine', 'hanging'] },
    },
    output: paragraphMutationResultSchemaFor('format.paragraph.setIndentation'),
    success: paragraphMutationSuccessSchema,
    failure: paragraphMutationFailureSchemaFor('format.paragraph.setIndentation'),
  },
  'format.paragraph.clearIndentation': {
    input: objectSchema({ target: paragraphTargetSchema }, ['target']),
    output: paragraphMutationResultSchemaFor('format.paragraph.clearIndentation'),
    success: paragraphMutationSuccessSchema,
    failure: paragraphMutationFailureSchemaFor('format.paragraph.clearIndentation'),
  },
  'format.paragraph.setSpacing': {
    input: {
      ...objectSchema(
        {
          target: paragraphTargetSchema,
          before: { type: 'integer', minimum: 0, description: 'Space before paragraph in twips (20 twips = 1pt).' },
          after: { type: 'integer', minimum: 0, description: 'Space after paragraph in twips (20 twips = 1pt).' },
          line: {
            type: 'integer',
            minimum: 1,
            description: 'Line spacing value. Meaning depends on lineRule. Must be provided together with lineRule.',
          },
          lineRule: {
            enum: [...LINE_RULES],
            description: "Line spacing rule. Required when 'line' is set.",
          },
        },
        ['target'],
      ),
      anyOf: [{ required: ['before'] }, { required: ['after'] }, { required: ['line'] }, { required: ['lineRule'] }],
      if: { required: ['line'] },
      then: { required: ['lineRule'] },
    },
    output: paragraphMutationResultSchemaFor('format.paragraph.setSpacing'),
    success: paragraphMutationSuccessSchema,
    failure: paragraphMutationFailureSchemaFor('format.paragraph.setSpacing'),
  },
  'format.paragraph.clearSpacing': {
    input: objectSchema({ target: paragraphTargetSchema }, ['target']),
    output: paragraphMutationResultSchemaFor('format.paragraph.clearSpacing'),
    success: paragraphMutationSuccessSchema,
    failure: paragraphMutationFailureSchemaFor('format.paragraph.clearSpacing'),
  },
  'format.paragraph.setKeepOptions': {
    input: {
      ...objectSchema(
        {
          target: paragraphTargetSchema,
          keepNext: { type: 'boolean' },
          keepLines: { type: 'boolean' },
          widowControl: { type: 'boolean' },
        },
        ['target'],
      ),
      oneOf: [
        { required: ['target', 'keepNext'] },
        { required: ['target', 'keepLines'] },
        { required: ['target', 'widowControl'] },
      ],
    },
    output: paragraphMutationResultSchemaFor('format.paragraph.setKeepOptions'),
    success: paragraphMutationSuccessSchema,
    failure: paragraphMutationFailureSchemaFor('format.paragraph.setKeepOptions'),
  },
  'format.paragraph.setOutlineLevel': {
    input: objectSchema(
      {
        target: paragraphTargetSchema,
        outlineLevel: { oneOf: [{ type: 'integer', minimum: 0, maximum: 9 }, { type: 'null' }] },
      },
      ['target', 'outlineLevel'],
    ),
    output: paragraphMutationResultSchemaFor('format.paragraph.setOutlineLevel'),
    success: paragraphMutationSuccessSchema,
    failure: paragraphMutationFailureSchemaFor('format.paragraph.setOutlineLevel'),
  },
  'format.paragraph.setFlowOptions': {
    input: {
      ...objectSchema(
        {
          target: paragraphTargetSchema,
          contextualSpacing: { type: 'boolean' },
          pageBreakBefore: { type: 'boolean' },
          suppressAutoHyphens: { type: 'boolean' },
        },
        ['target'],
      ),
      oneOf: [
        { required: ['target', 'contextualSpacing'] },
        { required: ['target', 'pageBreakBefore'] },
        { required: ['target', 'suppressAutoHyphens'] },
      ],
    },
    output: paragraphMutationResultSchemaFor('format.paragraph.setFlowOptions'),
    success: paragraphMutationSuccessSchema,
    failure: paragraphMutationFailureSchemaFor('format.paragraph.setFlowOptions'),
  },
  'format.paragraph.setTabStop': {
    input: objectSchema(
      {
        target: paragraphTargetSchema,
        position: { type: 'integer', minimum: 0 },
        alignment: { enum: [...TAB_STOP_ALIGNMENTS] },
        leader: { enum: [...TAB_STOP_LEADERS] },
      },
      ['target', 'position', 'alignment'],
    ),
    output: paragraphMutationResultSchemaFor('format.paragraph.setTabStop'),
    success: paragraphMutationSuccessSchema,
    failure: paragraphMutationFailureSchemaFor('format.paragraph.setTabStop'),
  },
  'format.paragraph.clearTabStop': {
    input: objectSchema({ target: paragraphTargetSchema, position: { type: 'integer', minimum: 0 } }, [
      'target',
      'position',
    ]),
    output: paragraphMutationResultSchemaFor('format.paragraph.clearTabStop'),
    success: paragraphMutationSuccessSchema,
    failure: paragraphMutationFailureSchemaFor('format.paragraph.clearTabStop'),
  },
  'format.paragraph.clearAllTabStops': {
    input: objectSchema({ target: paragraphTargetSchema }, ['target']),
    output: paragraphMutationResultSchemaFor('format.paragraph.clearAllTabStops'),
    success: paragraphMutationSuccessSchema,
    failure: paragraphMutationFailureSchemaFor('format.paragraph.clearAllTabStops'),
  },
  'format.paragraph.setBorder': {
    input: objectSchema(
      {
        target: paragraphTargetSchema,
        side: { enum: [...BORDER_SIDES] },
        style: { type: 'string', minLength: 1 },
        color: { type: 'string', minLength: 1 },
        size: { type: 'integer', minimum: 0 },
        space: { type: 'integer', minimum: 0 },
      },
      ['target', 'side', 'style'],
    ),
    output: paragraphMutationResultSchemaFor('format.paragraph.setBorder'),
    success: paragraphMutationSuccessSchema,
    failure: paragraphMutationFailureSchemaFor('format.paragraph.setBorder'),
  },
  'format.paragraph.clearBorder': {
    input: objectSchema({ target: paragraphTargetSchema, side: { enum: [...CLEAR_BORDER_SIDES] } }, ['target', 'side']),
    output: paragraphMutationResultSchemaFor('format.paragraph.clearBorder'),
    success: paragraphMutationSuccessSchema,
    failure: paragraphMutationFailureSchemaFor('format.paragraph.clearBorder'),
  },
  'format.paragraph.setShading': {
    input: {
      ...objectSchema(
        {
          target: paragraphTargetSchema,
          fill: { type: 'string', minLength: 1 },
          color: { type: 'string', minLength: 1 },
          pattern: { type: 'string', minLength: 1 },
        },
        ['target'],
      ),
      oneOf: [{ required: ['target', 'fill'] }, { required: ['target', 'color'] }, { required: ['target', 'pattern'] }],
    },
    output: paragraphMutationResultSchemaFor('format.paragraph.setShading'),
    success: paragraphMutationSuccessSchema,
    failure: paragraphMutationFailureSchemaFor('format.paragraph.setShading'),
  },
  'format.paragraph.clearShading': {
    input: objectSchema({ target: paragraphTargetSchema }, ['target']),
    output: paragraphMutationResultSchemaFor('format.paragraph.clearShading'),
    success: paragraphMutationSuccessSchema,
    failure: paragraphMutationFailureSchemaFor('format.paragraph.clearShading'),
  },
  'format.paragraph.setDirection': {
    input: objectSchema(
      {
        target: paragraphTargetSchema,
        direction: { type: 'string', enum: ['ltr', 'rtl'] },
        alignmentPolicy: { type: 'string', enum: ['preserve', 'matchDirection'] },
      },
      ['target', 'direction'],
    ),
    output: paragraphMutationResultSchemaFor('format.paragraph.setDirection'),
    success: paragraphMutationSuccessSchema,
    failure: paragraphMutationFailureSchemaFor('format.paragraph.setDirection'),
  },
  'format.paragraph.clearDirection': {
    input: objectSchema({ target: paragraphTargetSchema }, ['target']),
    output: paragraphMutationResultSchemaFor('format.paragraph.clearDirection'),
    success: paragraphMutationSuccessSchema,
    failure: paragraphMutationFailureSchemaFor('format.paragraph.clearDirection'),
  },
  'styles.apply': (() => {
    // Derived from PROPERTY_REGISTRY — no hardcoded property lists
    const runInputSchema = objectSchema(
      {
        target: objectSchema({ scope: { const: 'docDefaults' }, channel: { const: 'run' } }, ['scope', 'channel']),
        patch: buildPatchSchema('run'),
      },
      ['target', 'patch'],
    );
    const paragraphInputSchema = objectSchema(
      {
        target: objectSchema({ scope: { const: 'docDefaults' }, channel: { const: 'paragraph' } }, [
          'scope',
          'channel',
        ]),
        patch: buildPatchSchema('paragraph'),
      },
      ['target', 'patch'],
    );

    const stylesTargetResolutionSchema = objectSchema(
      {
        scope: { const: 'docDefaults' },
        channel: { enum: ['run', 'paragraph'] },
        xmlPart: { const: 'word/styles.xml' },
        xmlPath: { enum: ['w:styles/w:docDefaults/w:rPrDefault/w:rPr', 'w:styles/w:docDefaults/w:pPrDefault/w:pPr'] },
      },
      ['scope', 'channel', 'xmlPart', 'xmlPath'],
    );

    const stylesStateSchema = buildStateSchema();

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
      input: { oneOf: [runInputSchema, paragraphInputSchema] },
      output: { oneOf: [stylesSuccessSchema, stylesFailureSchema] },
      success: stylesSuccessSchema,
      failure: stylesFailureSchema,
    };
  })(),
  'create.paragraph': {
    input: objectSchema({
      in: storyLocatorSchema,
      at: {
        description:
          "Position: {kind:'documentEnd'} to append, {kind:'documentStart'} to prepend, or {kind:'before'|'after', target:{kind:'block', nodeType:'...', nodeId:'...'}} for relative placement.",
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
      text: {
        type: 'string',
        description:
          'Paragraph text content. Each call creates ONE paragraph. For multiple items (e.g. list items), call superdoc_create separately for each item — do NOT use newlines to put multiple items in one paragraph.',
      },
    }),
    output: createParagraphResultSchemaFor('create.paragraph'),
    success: createParagraphSuccessSchema,
    failure: createParagraphFailureSchemaFor('create.paragraph'),
  },
  'create.heading': {
    input: objectSchema(
      {
        in: storyLocatorSchema,
        level: { ...headingLevelSchema, description: 'Heading level (1-6).' },
        at: {
          description:
            "Position: {kind:'documentEnd'} to append, {kind:'documentStart'} to prepend, or {kind:'before'|'after', target:{kind:'block', nodeType:'...', nodeId:'...'}} for relative placement.",
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
        text: { type: 'string', description: 'Heading text content.' },
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
        target: {
          ...listItemAddressSchema,
          description:
            "The target list item. For 'insert': the item to insert relative to. For 'create' with mode 'fromParagraphs': use nodeType 'paragraph' instead. Format: {kind:'block', nodeType:'listItem', nodeId:'<id>'}.",
        },
        position: {
          ...listInsertPositionSchema,
          description: "Required. Insert position relative to target: 'before' or 'after'.",
        },
        text: { type: 'string', description: 'Text content for the new list item.' },
      },
      ['target', 'position'],
    ),
    output: listsInsertResultSchemaFor('lists.insert'),
    success: listsInsertSuccessSchema,
    failure: listsFailureSchemaFor('lists.insert'),
  },
  'lists.create': {
    input: {
      type: 'object',
      properties: {
        mode: {
          enum: ['empty', 'fromParagraphs'],
          description:
            "Required. 'fromParagraphs' converts existing paragraphs into list items — each paragraph becomes one item, so create one paragraph per item first. 'empty' creates a new empty list at 'at'.",
        },
        at: {
          ...ref('BlockAddress'),
          description:
            "Required when mode is 'empty'. The paragraph to create the list at. Format: {kind:'block', nodeType:'paragraph', nodeId:'<id>'}.",
        },
        target: {
          ...ref('BlockAddressOrRange'),
          description:
            "Required when mode is 'fromParagraphs'. Each call converts ONE paragraph into a list item. To make a list with N items, create N separate paragraphs first, then call superdoc_list create for EACH one. Format: {kind:'block', nodeType:'paragraph', nodeId:'<id>'}.",
        },
        kind: {
          ...listKindSchema,
          description: "List type: 'bullet' for bullet points, 'ordered' for numbered lists.",
        },
        level: {
          type: 'integer',
          minimum: 0,
          maximum: 8,
          description: 'List nesting level (0-8). 0 is the top level.',
        },
        preset: {
          enum: [
            'decimal',
            'decimalParenthesis',
            'lowerLetter',
            'upperLetter',
            'lowerRoman',
            'upperRoman',
            'disc',
            'circle',
            'square',
            'dash',
          ],
          description: "Predefined list style preset. Overrides 'kind' with a specific numbering or bullet format.",
        },
        style: objectSchema(
          {
            version: { const: 1 },
            levels: arraySchema(
              objectSchema(
                {
                  level: { type: 'integer', minimum: 0, maximum: 8 },
                  numFmt: { type: 'string' },
                  lvlText: { type: 'string' },
                  start: { type: 'integer' },
                  alignment: { enum: ['left', 'center', 'right'] },
                  indents: objectSchema({
                    left: { type: 'integer' },
                    hanging: { type: 'integer' },
                    firstLine: { type: 'integer' },
                  }),
                  trailingCharacter: { enum: ['tab', 'space', 'nothing'] },
                  markerFont: { type: 'string' },
                  pictureBulletId: { type: 'integer' },
                  tabStopAt: { type: ['integer', 'null'] },
                },
                ['level'],
              ),
            ),
          },
          ['version', 'levels'],
        ),
        sequence: {
          oneOf: [
            objectSchema({ mode: { const: 'new' }, startAt: { type: 'integer', minimum: 1 } }, ['mode']),
            objectSchema({ mode: { const: 'continuePrevious' } }, ['mode']),
          ],
        },
      },
      required: ['mode'],
      additionalProperties: false,
      allOf: [
        // mode-conditional: 'empty' requires 'at', 'fromParagraphs' requires 'target'
        {
          if: { properties: { mode: { const: 'empty' } } },
          then: { required: ['mode', 'at'] },
          else: { required: ['mode', 'target'] },
        },
        // continuePrevious is incompatible with preset/style
        {
          if: {
            properties: { sequence: { properties: { mode: { const: 'continuePrevious' } }, required: ['mode'] } },
            required: ['sequence'],
          },
          then: {
            not: { anyOf: [{ required: ['preset'] }, { required: ['style'] }] },
          },
        },
      ],
    },
    output: {
      oneOf: [
        objectSchema({ success: { const: true }, listId: { type: 'string' }, item: listItemAddressSchema }, [
          'success',
          'listId',
          'item',
        ]),
        listsFailureSchemaFor('lists.create'),
      ],
    },
    success: objectSchema({ success: { const: true }, listId: { type: 'string' }, item: listItemAddressSchema }, [
      'success',
      'listId',
      'item',
    ]),
    failure: listsFailureSchemaFor('lists.create'),
  },
  'lists.attach': {
    input: objectSchema(
      {
        target: ref('BlockAddressOrRange'),
        attachTo: listItemAddressSchema,
        level: { type: 'integer', minimum: 0, maximum: 8 },
      },
      ['target', 'attachTo'],
    ),
    output: listsMutateItemResultSchemaFor('lists.attach'),
    success: listsMutateItemSuccessSchema,
    failure: listsFailureSchemaFor('lists.attach'),
  },
  'lists.detach': {
    input: objectSchema(
      {
        target: listItemAddressSchema,
      },
      ['target'],
    ),
    output: {
      oneOf: [
        objectSchema({ success: { const: true }, paragraph: ref('ParagraphAddress') }, ['success', 'paragraph']),
        listsFailureSchemaFor('lists.detach'),
      ],
    },
    success: objectSchema({ success: { const: true }, paragraph: ref('ParagraphAddress') }, ['success', 'paragraph']),
    failure: listsFailureSchemaFor('lists.detach'),
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
  'lists.join': {
    input: objectSchema(
      {
        target: listItemAddressSchema,
        direction: { enum: ['withPrevious', 'withNext'] },
      },
      ['target', 'direction'],
    ),
    output: {
      oneOf: [
        objectSchema({ success: { const: true }, listId: { type: 'string' } }, ['success', 'listId']),
        listsFailureSchemaFor('lists.join'),
      ],
    },
    success: objectSchema({ success: { const: true }, listId: { type: 'string' } }, ['success', 'listId']),
    failure: listsFailureSchemaFor('lists.join'),
  },
  'lists.canJoin': {
    input: objectSchema(
      {
        target: listItemAddressSchema,
        direction: { enum: ['withPrevious', 'withNext'] },
      },
      ['target', 'direction'],
    ),
    output: objectSchema(
      {
        canJoin: { type: 'boolean' },
        reason: { enum: ['NO_ADJACENT_SEQUENCE', 'INCOMPATIBLE_DEFINITIONS', 'ALREADY_SAME_SEQUENCE'] },
        adjacentListId: { type: 'string' },
      },
      ['canJoin'],
    ),
  },
  'lists.separate': {
    input: objectSchema(
      {
        target: listItemAddressSchema,
        copyOverrides: { type: 'boolean' },
      },
      ['target'],
    ),
    output: {
      oneOf: [
        objectSchema({ success: { const: true }, listId: { type: 'string' }, numId: { type: 'integer' } }, [
          'success',
          'listId',
          'numId',
        ]),
        listsFailureSchemaFor('lists.separate'),
      ],
    },
    success: objectSchema({ success: { const: true }, listId: { type: 'string' }, numId: { type: 'integer' } }, [
      'success',
      'listId',
      'numId',
    ]),
    failure: listsFailureSchemaFor('lists.separate'),
  },
  'lists.setLevel': {
    input: objectSchema(
      {
        target: listItemAddressSchema,
        level: { type: 'integer', minimum: 0, maximum: 8 },
      },
      ['target', 'level'],
    ),
    output: listsMutateItemResultSchemaFor('lists.setLevel'),
    success: listsMutateItemSuccessSchema,
    failure: listsFailureSchemaFor('lists.setLevel'),
  },
  'lists.setValue': {
    input: objectSchema(
      {
        target: listItemAddressSchema,
        value: { type: ['integer', 'null'] },
      },
      ['target', 'value'],
    ),
    output: listsMutateItemResultSchemaFor('lists.setValue'),
    success: listsMutateItemSuccessSchema,
    failure: listsFailureSchemaFor('lists.setValue'),
  },
  'lists.continuePrevious': {
    input: objectSchema(
      {
        target: listItemAddressSchema,
      },
      ['target'],
    ),
    output: listsMutateItemResultSchemaFor('lists.continuePrevious'),
    success: listsMutateItemSuccessSchema,
    failure: listsFailureSchemaFor('lists.continuePrevious'),
  },
  'lists.canContinuePrevious': {
    input: objectSchema(
      {
        target: listItemAddressSchema,
      },
      ['target'],
    ),
    output: objectSchema(
      {
        canContinue: { type: 'boolean' },
        reason: { enum: ['NO_PREVIOUS_LIST', 'INCOMPATIBLE_DEFINITIONS', 'ALREADY_CONTINUOUS'] },
        previousListId: { type: 'string' },
      },
      ['canContinue'],
    ),
  },
  'lists.setLevelRestart': {
    input: objectSchema(
      {
        target: listItemAddressSchema,
        level: { type: 'integer', minimum: 0, maximum: 8 },
        restartAfterLevel: { type: ['integer', 'null'] },
        scope: { enum: ['definition', 'instance'] },
      },
      ['target', 'level', 'restartAfterLevel'],
    ),
    output: listsMutateItemResultSchemaFor('lists.setLevelRestart'),
    success: listsMutateItemSuccessSchema,
    failure: listsFailureSchemaFor('lists.setLevelRestart'),
  },
  'lists.convertToText': {
    input: objectSchema(
      {
        target: listItemAddressSchema,
        includeMarker: { type: 'boolean' },
      },
      ['target'],
    ),
    output: {
      oneOf: [
        objectSchema({ success: { const: true }, paragraph: ref('ParagraphAddress') }, ['success', 'paragraph']),
        listsFailureSchemaFor('lists.convertToText'),
      ],
    },
    success: objectSchema({ success: { const: true }, paragraph: ref('ParagraphAddress') }, ['success', 'paragraph']),
    failure: listsFailureSchemaFor('lists.convertToText'),
  },

  // SD-1973 — List formatting and templates
  'lists.applyTemplate': {
    input: objectSchema(
      {
        target: listItemAddressSchema,
        template: objectSchema(
          {
            version: { const: 1 },
            levels: arraySchema(
              objectSchema(
                {
                  level: { type: 'integer', minimum: 0, maximum: 8 },
                  numFmt: { type: 'string' },
                  lvlText: { type: 'string' },
                  start: { type: 'integer' },
                  alignment: { enum: ['left', 'center', 'right'] },
                  indents: objectSchema({
                    left: { type: 'integer' },
                    hanging: { type: 'integer' },
                    firstLine: { type: 'integer' },
                  }),
                  trailingCharacter: { enum: ['tab', 'space', 'nothing'] },
                  markerFont: { type: 'string' },
                  pictureBulletId: { type: 'integer' },
                },
                ['level'],
              ),
            ),
          },
          ['version', 'levels'],
        ),
        levels: arraySchema({ type: 'integer', minimum: 0, maximum: 8 }),
      },
      ['target', 'template'],
    ),
    output: listsMutateItemResultSchemaFor('lists.applyTemplate'),
    success: listsMutateItemSuccessSchema,
    failure: listsFailureSchemaFor('lists.applyTemplate'),
  },
  'lists.applyPreset': {
    input: objectSchema(
      {
        target: listItemAddressSchema,
        preset: {
          enum: [
            'decimal',
            'decimalParenthesis',
            'lowerLetter',
            'upperLetter',
            'lowerRoman',
            'upperRoman',
            'disc',
            'circle',
            'square',
            'dash',
          ],
        },
        levels: arraySchema({ type: 'integer', minimum: 0, maximum: 8 }),
      },
      ['target', 'preset'],
    ),
    output: listsMutateItemResultSchemaFor('lists.applyPreset'),
    success: listsMutateItemSuccessSchema,
    failure: listsFailureSchemaFor('lists.applyPreset'),
  },
  'lists.setType': {
    input: objectSchema(
      {
        target: listItemAddressSchema,
        kind: { enum: ['ordered', 'bullet'] },
        continuity: {
          enum: ['preserve', 'none'],
          description: "Numbering continuity: 'preserve' keeps numbering; 'none' restarts.",
        },
      },
      ['target', 'kind'],
    ),
    output: listsMutateItemResultSchemaFor('lists.setType'),
    success: listsMutateItemSuccessSchema,
    failure: listsFailureSchemaFor('lists.setType'),
  },
  'lists.captureTemplate': (() => {
    const successSchema = objectSchema(
      {
        success: { const: true },
        template: objectSchema(
          {
            version: { const: 1 },
            levels: arraySchema(
              objectSchema(
                {
                  level: { type: 'integer', minimum: 0, maximum: 8 },
                  numFmt: { type: 'string' },
                  lvlText: { type: 'string' },
                  start: { type: 'integer' },
                  alignment: { enum: ['left', 'center', 'right'] },
                  indents: objectSchema({
                    left: { type: 'integer' },
                    hanging: { type: 'integer' },
                    firstLine: { type: 'integer' },
                  }),
                  trailingCharacter: { enum: ['tab', 'space', 'nothing'] },
                  markerFont: { type: 'string' },
                  pictureBulletId: { type: 'integer' },
                },
                ['level'],
              ),
            ),
          },
          ['version', 'levels'],
        ),
      },
      ['success', 'template'],
    );
    return {
      input: objectSchema(
        {
          target: listItemAddressSchema,
          levels: arraySchema({ type: 'integer', minimum: 0, maximum: 8 }),
        },
        ['target'],
      ),
      output: { oneOf: [successSchema, listsFailureSchemaFor('lists.captureTemplate')] },
      success: successSchema,
      failure: listsFailureSchemaFor('lists.captureTemplate'),
    };
  })(),
  'lists.setLevelNumbering': {
    input: objectSchema(
      {
        target: listItemAddressSchema,
        level: { type: 'integer', minimum: 0, maximum: 8 },
        numFmt: { type: 'string' },
        lvlText: { type: 'string' },
        start: { type: 'integer' },
      },
      ['target', 'level', 'numFmt', 'lvlText'],
    ),
    output: listsMutateItemResultSchemaFor('lists.setLevelNumbering'),
    success: listsMutateItemSuccessSchema,
    failure: listsFailureSchemaFor('lists.setLevelNumbering'),
  },
  'lists.setLevelBullet': {
    input: objectSchema(
      {
        target: listItemAddressSchema,
        level: { type: 'integer', minimum: 0, maximum: 8 },
        markerText: { type: 'string' },
      },
      ['target', 'level', 'markerText'],
    ),
    output: listsMutateItemResultSchemaFor('lists.setLevelBullet'),
    success: listsMutateItemSuccessSchema,
    failure: listsFailureSchemaFor('lists.setLevelBullet'),
  },
  'lists.setLevelPictureBullet': {
    input: objectSchema(
      {
        target: listItemAddressSchema,
        level: { type: 'integer', minimum: 0, maximum: 8 },
        pictureBulletId: { type: 'integer' },
      },
      ['target', 'level', 'pictureBulletId'],
    ),
    output: listsMutateItemResultSchemaFor('lists.setLevelPictureBullet'),
    success: listsMutateItemSuccessSchema,
    failure: listsFailureSchemaFor('lists.setLevelPictureBullet'),
  },
  'lists.setLevelAlignment': {
    input: objectSchema(
      {
        target: listItemAddressSchema,
        level: { type: 'integer', minimum: 0, maximum: 8 },
        alignment: { enum: ['left', 'center', 'right'] },
      },
      ['target', 'level', 'alignment'],
    ),
    output: listsMutateItemResultSchemaFor('lists.setLevelAlignment'),
    success: listsMutateItemSuccessSchema,
    failure: listsFailureSchemaFor('lists.setLevelAlignment'),
  },
  'lists.setLevelIndents': {
    input: {
      type: 'object',
      properties: {
        target: listItemAddressSchema,
        level: { type: 'integer', minimum: 0, maximum: 8 },
        left: { type: 'integer' },
        hanging: { type: 'integer' },
        firstLine: { type: 'integer' },
      },
      required: ['target', 'level'],
      additionalProperties: false,
      anyOf: [{ required: ['left'] }, { required: ['hanging'] }, { required: ['firstLine'] }],
      not: { required: ['hanging', 'firstLine'] },
    },
    output: listsMutateItemResultSchemaFor('lists.setLevelIndents'),
    success: listsMutateItemSuccessSchema,
    failure: listsFailureSchemaFor('lists.setLevelIndents'),
  },
  'lists.setLevelTrailingCharacter': {
    input: objectSchema(
      {
        target: listItemAddressSchema,
        level: { type: 'integer', minimum: 0, maximum: 8 },
        trailingCharacter: { enum: ['tab', 'space', 'nothing'] },
      },
      ['target', 'level', 'trailingCharacter'],
    ),
    output: listsMutateItemResultSchemaFor('lists.setLevelTrailingCharacter'),
    success: listsMutateItemSuccessSchema,
    failure: listsFailureSchemaFor('lists.setLevelTrailingCharacter'),
  },
  'lists.setLevelMarkerFont': {
    input: objectSchema(
      {
        target: listItemAddressSchema,
        level: { type: 'integer', minimum: 0, maximum: 8 },
        fontFamily: { type: 'string' },
      },
      ['target', 'level', 'fontFamily'],
    ),
    output: listsMutateItemResultSchemaFor('lists.setLevelMarkerFont'),
    success: listsMutateItemSuccessSchema,
    failure: listsFailureSchemaFor('lists.setLevelMarkerFont'),
  },
  'lists.clearLevelOverrides': {
    input: objectSchema(
      {
        target: listItemAddressSchema,
        level: { type: 'integer', minimum: 0, maximum: 8 },
      },
      ['target', 'level'],
    ),
    output: listsMutateItemResultSchemaFor('lists.clearLevelOverrides'),
    success: listsMutateItemSuccessSchema,
    failure: listsFailureSchemaFor('lists.clearLevelOverrides'),
  },

  // SD-2025 — User-facing list style operations
  'lists.getStyle': (() => {
    const listLevelTemplateSchema = objectSchema(
      {
        level: { type: 'integer', minimum: 0, maximum: 8 },
        numFmt: { type: 'string' },
        lvlText: { type: 'string' },
        start: { type: 'integer' },
        alignment: { enum: ['left', 'center', 'right'] },
        indents: objectSchema({
          left: { type: 'integer' },
          hanging: { type: 'integer' },
          firstLine: { type: 'integer' },
        }),
        trailingCharacter: { enum: ['tab', 'space', 'nothing'] },
        markerFont: { type: 'string' },
        pictureBulletId: { type: 'integer' },
        tabStopAt: { type: ['integer', 'null'] },
      },
      ['level'],
    );
    const styleSchema = objectSchema(
      {
        version: { const: 1 },
        levels: arraySchema(listLevelTemplateSchema),
      },
      ['version', 'levels'],
    );
    const successSchema = objectSchema(
      {
        success: { const: true },
        style: styleSchema,
      },
      ['success', 'style'],
    );
    return {
      input: objectSchema(
        {
          target: listItemAddressSchema,
          levels: arraySchema({ type: 'integer', minimum: 0, maximum: 8 }),
        },
        ['target'],
      ),
      output: { oneOf: [successSchema, listsFailureSchemaFor('lists.getStyle')] },
      success: successSchema,
      failure: listsFailureSchemaFor('lists.getStyle'),
    };
  })(),
  'lists.applyStyle': {
    input: objectSchema(
      {
        target: listItemAddressSchema,
        style: objectSchema(
          {
            version: { const: 1 },
            levels: arraySchema(
              objectSchema(
                {
                  level: { type: 'integer', minimum: 0, maximum: 8 },
                  numFmt: { type: 'string' },
                  lvlText: { type: 'string' },
                  start: { type: 'integer' },
                  alignment: { enum: ['left', 'center', 'right'] },
                  indents: objectSchema({
                    left: { type: 'integer' },
                    hanging: { type: 'integer' },
                    firstLine: { type: 'integer' },
                  }),
                  trailingCharacter: { enum: ['tab', 'space', 'nothing'] },
                  markerFont: { type: 'string' },
                  pictureBulletId: { type: 'integer' },
                  tabStopAt: { type: ['integer', 'null'] },
                },
                ['level'],
              ),
            ),
          },
          ['version', 'levels'],
        ),
        levels: arraySchema({ type: 'integer', minimum: 0, maximum: 8 }),
      },
      ['target', 'style'],
    ),
    output: listsMutateItemResultSchemaFor('lists.applyStyle'),
    success: listsMutateItemSuccessSchema,
    failure: listsFailureSchemaFor('lists.applyStyle'),
  },
  'lists.restartAt': {
    input: objectSchema(
      {
        target: listItemAddressSchema,
        startAt: { type: 'integer', minimum: 1 },
      },
      ['target', 'startAt'],
    ),
    output: listsMutateItemResultSchemaFor('lists.restartAt'),
    success: listsMutateItemSuccessSchema,
    failure: listsFailureSchemaFor('lists.restartAt'),
  },
  'lists.setLevelNumberStyle': {
    input: objectSchema(
      {
        target: listItemAddressSchema,
        level: { type: 'integer', minimum: 0, maximum: 8 },
        numberStyle: { type: 'string' },
      },
      ['target', 'level', 'numberStyle'],
    ),
    output: listsMutateItemResultSchemaFor('lists.setLevelNumberStyle'),
    success: listsMutateItemSuccessSchema,
    failure: listsFailureSchemaFor('lists.setLevelNumberStyle'),
  },
  'lists.setLevelText': {
    input: objectSchema(
      {
        target: listItemAddressSchema,
        level: { type: 'integer', minimum: 0, maximum: 8 },
        text: { type: 'string' },
      },
      ['target', 'level', 'text'],
    ),
    output: listsMutateItemResultSchemaFor('lists.setLevelText'),
    success: listsMutateItemSuccessSchema,
    failure: listsFailureSchemaFor('lists.setLevelText'),
  },
  'lists.setLevelStart': {
    input: objectSchema(
      {
        target: listItemAddressSchema,
        level: { type: 'integer', minimum: 0, maximum: 8 },
        startAt: { type: 'integer', minimum: 1 },
      },
      ['target', 'level', 'startAt'],
    ),
    output: listsMutateItemResultSchemaFor('lists.setLevelStart'),
    success: listsMutateItemSuccessSchema,
    failure: listsFailureSchemaFor('lists.setLevelStart'),
  },
  'lists.setLevelLayout': {
    input: objectSchema(
      {
        target: listItemAddressSchema,
        level: { type: 'integer', minimum: 0, maximum: 8 },
        layout: objectSchema({
          alignment: { enum: ['left', 'center', 'right'] },
          alignedAt: { type: 'integer' },
          textIndentAt: { type: 'integer' },
          followCharacter: { enum: ['tab', 'space', 'nothing'] },
          tabStopAt: { type: ['integer', 'null'] },
        }),
      },
      ['target', 'level', 'layout'],
    ),
    output: listsMutateItemResultSchemaFor('lists.setLevelLayout'),
    success: listsMutateItemSuccessSchema,
    failure: listsFailureSchemaFor('lists.setLevelLayout'),
  },

  'comments.create': {
    input: objectSchema(
      {
        text: { type: 'string', description: 'Comment text content.' },
        target: {
          ...textAddressSchema,
          description: "Text range to anchor the comment: {kind:'text', blockId:'...', range:{start:N, end:N}}.",
        },
        parentCommentId: {
          type: 'string',
          description: 'Parent comment ID for creating a threaded reply.',
        },
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
        text: { type: 'string', description: 'Updated comment text.' },
        target: textAddressSchema,
        status: { enum: ['resolved'], description: "Set comment status. Use 'resolved' to mark as resolved." },
        isInternal: {
          type: 'boolean',
          description: 'When true, marks the comment as internal (hidden from external collaborators).',
        },
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
      includeResolved: {
        type: 'boolean',
        description: 'When true, includes resolved comments in results. Default: false.',
      },
      limit: { type: 'integer', description: 'Maximum number of comments to return.' },
      offset: { type: 'integer', description: 'Number of comments to skip for pagination.' },
    }),
    output: commentsListResultSchema,
  },
  'trackChanges.list': {
    input: objectSchema({
      limit: { type: 'integer', description: 'Maximum number of tracked changes to return.' },
      offset: { type: 'integer', description: 'Number of tracked changes to skip for pagination.' },
      type: {
        enum: ['insert', 'delete', 'format'],
        description: "Filter by change type: 'insert', 'delete', or 'format'.",
      },
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
        in: storyLocatorSchema,
        select: {
          description:
            "Search selector. Use {type:'text', pattern:'...'} for text search or {type:'node', nodeType:'paragraph'|'heading'|...} for node search.",
          oneOf: [textSelectorSchema, nodeSelectorSchema],
        },
        within: {
          ...blockNodeAddressSchema,
          description: "Limit search scope to within a specific block: {kind:'block', nodeType:'...', nodeId:'...'}.",
        },
        require: {
          enum: ['any', 'first', 'exactlyOne', 'all'],
          description:
            "Match cardinality: 'any' (all matches), 'first' (only first), 'exactlyOne' (fail if != 1), 'all' (fail if 0).",
        },
        mode: {
          enum: ['strict', 'candidates'],
          description:
            "Search mode: 'strict' (default, exact matching) or 'candidates' (returns scored potential matches).",
        },
        includeNodes: {
          type: 'boolean',
          description: 'When true, includes full node data in results. Default: false.',
        },
        limit: { type: 'integer', minimum: 1, description: 'Maximum number of matches to return.' },
        offset: { type: 'integer', minimum: 0, description: 'Number of matches to skip for pagination.' },
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
          address: blockNodeAddressSchema,
          target: selectionTargetSchema,
          snippet: { type: 'string' },
          highlightRange: rangeSchema,
          blocks: { type: 'array', items: matchBlockSchema, minItems: 1 },
        },
        ['matchKind', 'address', 'target', 'snippet', 'highlightRange', 'blocks'],
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
  // ---------------------------------------------------------------------------
  // Mutation step schema — discriminated union by `op`
  // ---------------------------------------------------------------------------

  ...(() => {
    // Targeting: SelectWhere | RefWhere
    const selectWhereSchema = objectSchema(
      {
        by: { const: 'select', type: 'string' },
        select: { oneOf: [textSelectorSchema, nodeSelectorSchema] },
        within: blockNodeAddressSchema,
        require: { enum: ['first', 'exactlyOne', 'all'] },
      },
      ['by', 'select', 'require'],
    );

    const refWhereSchema = objectSchema(
      {
        by: { const: 'ref', type: 'string' },
        ref: { type: 'string' },
        within: blockNodeAddressSchema,
      },
      ['by', 'ref'],
    );

    const targetWhereSchema = objectSchema(
      {
        by: { const: 'target', type: 'string' },
        target: selectionTargetSchema,
      },
      ['by', 'target'],
    );

    const stepWhereSchema: JsonSchema = { oneOf: [selectWhereSchema, refWhereSchema, targetWhereSchema] };

    // Insert-only where (no 'all' require, no ref)
    const insertWhereSchema = objectSchema(
      {
        by: { const: 'select', type: 'string' },
        select: { oneOf: [textSelectorSchema, nodeSelectorSchema] },
        within: blockNodeAddressSchema,
        require: { enum: ['first', 'exactlyOne'] },
      },
      ['by', 'select', 'require'],
    );

    // Assert where (select only, no require)
    const assertWhereSchema = objectSchema(
      {
        by: { const: 'select', type: 'string' },
        select: { oneOf: [textSelectorSchema, nodeSelectorSchema] },
        within: blockNodeAddressSchema,
      },
      ['by', 'select'],
    );

    // Replacement payload
    const replacementBlockSchema = objectSchema({ text: { type: 'string' } }, ['text']);
    const replacementPayloadSchema: JsonSchema = {
      oneOf: [
        objectSchema({ text: { type: 'string' } }, ['text']),
        objectSchema({ blocks: arraySchema(replacementBlockSchema) }, ['blocks']),
      ],
    };

    // Style policies
    const inlineDirectiveSchema: JsonSchema = { enum: [...INLINE_DIRECTIVES] };
    const setMarksSchema = objectSchema({
      bold: inlineDirectiveSchema,
      italic: inlineDirectiveSchema,
      underline: inlineDirectiveSchema,
      strike: inlineDirectiveSchema,
    });
    const inlineStylePolicySchema = objectSchema(
      {
        mode: { enum: ['preserve', 'set', 'clear', 'merge'], type: 'string' },
        requireUniform: { type: 'boolean' },
        onNonUniform: { enum: ['error', 'useLeadingRun', 'majority', 'union'] },
        setMarks: setMarksSchema,
      },
      ['mode'],
    );
    const paragraphStylePolicySchema = objectSchema(
      {
        mode: { enum: ['preserve', 'set', 'clear'], type: 'string' },
      },
      ['mode'],
    );
    const stylePolicySchema = objectSchema(
      {
        inline: inlineStylePolicySchema,
        paragraph: paragraphStylePolicySchema,
      },
      ['inline'],
    );
    const insertStylePolicySchema = objectSchema(
      {
        inline: objectSchema(
          {
            mode: { enum: ['inherit', 'set', 'clear'], type: 'string' },
            setMarks: setMarksSchema,
          },
          ['mode'],
        ),
      },
      ['inline'],
    );

    // Step variants
    const textRewriteStepSchema = objectSchema(
      {
        id: { type: 'string' },
        op: { const: 'text.rewrite', type: 'string' },
        where: stepWhereSchema,
        args: objectSchema(
          {
            replacement: replacementPayloadSchema,
            style: stylePolicySchema,
          },
          ['replacement'],
        ),
      },
      ['id', 'op', 'where', 'args'],
    );

    const textInsertStepSchema = objectSchema(
      {
        id: { type: 'string' },
        op: { const: 'text.insert', type: 'string' },
        where: insertWhereSchema,
        args: objectSchema(
          {
            position: { enum: ['before', 'after'] },
            content: objectSchema({ text: { type: 'string' } }, ['text']),
            style: insertStylePolicySchema,
          },
          ['position', 'content'],
        ),
      },
      ['id', 'op', 'where', 'args'],
    );

    const textDeleteStepSchema = objectSchema(
      {
        id: { type: 'string' },
        op: { const: 'text.delete', type: 'string' },
        where: stepWhereSchema,
        args: objectSchema({ behavior: deleteBehaviorSchema }),
      },
      ['id', 'op', 'where', 'args'],
    );

    const formatApplyStepSchema = objectSchema(
      {
        id: { type: 'string' },
        op: { const: 'format.apply', type: 'string' },
        where: stepWhereSchema,
        args: objectSchema(
          {
            inline: buildInlineRunPatchSchema(),
          },
          ['inline'],
        ),
      },
      ['id', 'op', 'where', 'args'],
    );

    const assertStepSchema = objectSchema(
      {
        id: { type: 'string' },
        op: { const: 'assert', type: 'string' },
        where: assertWhereSchema,
        args: objectSchema(
          {
            expectCount: { type: 'number' },
          },
          ['expectCount'],
        ),
      },
      ['id', 'op', 'where', 'args'],
    );

    const mutationStepSchema: JsonSchema = {
      oneOf: [
        textRewriteStepSchema,
        textInsertStepSchema,
        textDeleteStepSchema,
        formatApplyStepSchema,
        assertStepSchema,
      ],
    };

    const mutationsInputSchema = objectSchema(
      {
        in: storyLocatorSchema,
        expectedRevision: {
          type: 'string',
          description:
            'Document revision for optimistic concurrency. Mutation fails if document was modified since this revision.',
        },
        atomic: {
          const: true,
          type: 'boolean',
          description: 'Must be true. All steps execute as one atomic transaction.',
        },
        changeMode: {
          enum: ['direct', 'tracked'],
          description:
            "Required. Use 'direct' for immediate edits or 'tracked' for suggestions. Must always be provided.",
        },
        steps: {
          ...arraySchema(mutationStepSchema),
          description:
            "Ordered array of mutation steps. Each step needs 'op' (text.rewrite, text.insert, text.delete, format.apply, or assert) and a 'where' targeting clause.",
        },
      },
      ['atomic', 'changeMode', 'steps'],
    );

    // ---------------------------------------------------------------
    // ranges.resolve schema
    // ---------------------------------------------------------------

    const documentEdgeAnchorSchema = objectSchema(
      {
        kind: { const: 'document' },
        edge: { enum: ['start', 'end'] },
      },
      ['kind', 'edge'],
    );

    const pointAnchorSchema = objectSchema(
      {
        kind: { const: 'point' },
        point: ref('SelectionPoint'),
      },
      ['kind', 'point'],
    );

    const refBoundaryAnchorSchema = objectSchema(
      {
        kind: { const: 'ref' },
        ref: { type: 'string', minLength: 1 },
        boundary: { enum: ['start', 'end'] },
      },
      ['kind', 'ref', 'boundary'],
    );

    const rangeAnchorSchema: JsonSchema = {
      oneOf: [documentEdgeAnchorSchema, pointAnchorSchema, refBoundaryAnchorSchema],
    };

    const rangeBlockPreviewSchema = objectSchema(
      {
        nodeId: { type: 'string' },
        nodeType: { enum: [...blockNodeTypeValues] },
        textPreview: { type: 'string' },
      },
      ['nodeId', 'nodeType', 'textPreview'],
    );

    const rangePreviewSchema = objectSchema(
      {
        text: { type: 'string' },
        truncated: { type: 'boolean' },
        blocks: arraySchema(rangeBlockPreviewSchema),
      },
      ['text', 'truncated', 'blocks'],
    );

    const resolveRangeOutputSchema = objectSchema(
      {
        evaluatedRevision: { type: 'string' },
        handle: objectSchema(
          {
            ref: { oneOf: [{ type: 'string' }, { type: 'null' }] },
            refStability: { const: 'ephemeral' },
            coversFullTarget: { type: 'boolean' },
          },
          ['ref', 'refStability', 'coversFullTarget'],
        ),
        target: selectionTargetSchema,
        preview: rangePreviewSchema,
      },
      ['evaluatedRevision', 'handle', 'target', 'preview'],
    );

    return {
      'ranges.resolve': {
        input: objectSchema(
          {
            start: rangeAnchorSchema,
            end: rangeAnchorSchema,
            expectedRevision: { type: 'string' },
          },
          ['start', 'end'],
        ),
        output: resolveRangeOutputSchema,
      },

      'mutations.preview': {
        input: mutationsInputSchema,
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
        input: mutationsInputSchema,
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
    };
  })(),
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
          target: tableAddressSchema,
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
          target: tableAddressSchema,
          nodeId: { type: 'string' },
          rowIndex: { type: 'integer', minimum: 1 },
        },
        ['rowIndex'],
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
        target: tableAddressSchema,
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
        target: tableAddressSchema,
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
    input: rowOperationInputSchema(
      {
        position: { enum: ['above', 'below'] },
        count: { type: 'integer', minimum: 1 },
      },
      ['position'],
    ),
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },
  'tables.deleteRow': {
    input: rowOperationInputSchema({}),
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },
  'tables.setRowHeight': {
    input: rowOperationInputSchema(
      {
        heightPt: { type: 'number', exclusiveMinimum: 0 },
        rule: { enum: ['atLeast', 'exact', 'auto'] },
      },
      ['heightPt', 'rule'],
    ),
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
    input: rowOperationInputSchema({
      allowBreakAcrossPages: { type: 'boolean' },
      repeatHeader: { type: 'boolean' },
    }),
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },

  // --- tables: column structure ---
  'tables.insertColumn': {
    input: {
      ...objectSchema(
        {
          target: tableAddressSchema,
          nodeId: { type: 'string' },
          columnIndex: { type: 'integer', minimum: 0 },
          position: { enum: ['left', 'right'] },
          count: { type: 'integer', minimum: 1 },
        },
        ['columnIndex', 'position'],
      ),
      oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
    },
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },
  'tables.deleteColumn': {
    input: {
      ...objectSchema(
        {
          target: tableAddressSchema,
          nodeId: { type: 'string' },
          columnIndex: { type: 'integer', minimum: 0 },
        },
        ['columnIndex'],
      ),
      oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
    },
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },
  'tables.setColumnWidth': {
    input: {
      ...objectSchema(
        {
          target: tableAddressSchema,
          nodeId: { type: 'string' },
          columnIndex: { type: 'integer', minimum: 0 },
          widthPt: { type: 'number', exclusiveMinimum: 0 },
        },
        ['columnIndex', 'widthPt'],
      ),
      oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
    },
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },
  'tables.distributeColumns': {
    input: {
      ...objectSchema({
        target: tableAddressSchema,
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
          target: tableCellAddressSchema,
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
          target: tableCellAddressSchema,
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
    input: cellOrTableScopedCellLocatorSchema,
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },
  'tables.splitCell': {
    input: {
      ...objectSchema(
        {
          target: tableCellAddressSchema,
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
        target: tableCellAddressSchema,
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
          target: tableAddressSchema,
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
        target: tableAddressSchema,
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
          target: tableAddressSchema,
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
          target: tableAddressSchema,
          nodeId: { type: 'string' },
          flag: {
            enum: ['headerRow', 'lastRow', 'totalRow', 'firstColumn', 'lastColumn', 'bandedRows', 'bandedColumns'],
          },
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
          target: tableOrCellAddressSchema,
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
          target: tableOrCellAddressSchema,
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
          target: tableAddressSchema,
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
          target: tableOrCellAddressSchema,
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
    input: tableOrCellLocatorSchema,
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },
  'tables.setTablePadding': {
    input: {
      ...objectSchema(
        {
          target: tableAddressSchema,
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
          target: tableCellAddressSchema,
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
          target: tableAddressSchema,
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

  // --- tables.* convenience operations (SD-2129) ---

  'tables.applyStyle': {
    input: {
      ...objectSchema({
        target: blockNodeAddressSchema,
        nodeId: { type: 'string' },
        styleId: { type: 'string' },
        styleOptions: objectSchema({
          headerRow: { type: 'boolean' },
          lastRow: { type: 'boolean' },
          totalRow: { type: 'boolean' },
          firstColumn: { type: 'boolean' },
          lastColumn: { type: 'boolean' },
          bandedRows: { type: 'boolean' },
          bandedColumns: { type: 'boolean' },
        }),
      }),
      oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
    },
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },
  'tables.setBorders': {
    input: {
      oneOf: [
        {
          ...objectSchema(
            {
              target: blockNodeAddressSchema,
              nodeId: { type: 'string' },
              mode: { const: 'applyTo' },
              applyTo: {
                enum: ['all', 'outside', 'inside', 'top', 'bottom', 'left', 'right', 'insideH', 'insideV'],
              },
              border: nullableTableBorderSpecSchema,
            },
            ['mode', 'applyTo', 'border'],
          ),
          oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
        },
        {
          ...objectSchema(
            {
              target: blockNodeAddressSchema,
              nodeId: { type: 'string' },
              mode: { const: 'edges' },
              edges: objectSchema({
                top: nullableTableBorderSpecSchema,
                bottom: nullableTableBorderSpecSchema,
                left: nullableTableBorderSpecSchema,
                right: nullableTableBorderSpecSchema,
                insideH: nullableTableBorderSpecSchema,
                insideV: nullableTableBorderSpecSchema,
              }),
            },
            ['mode', 'edges'],
          ),
          oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
        },
      ],
    },
    output: tableMutationResultSchema,
    success: tableMutationSuccessSchema,
    failure: tableMutationFailureSchema,
  },
  'tables.setTableOptions': {
    input: {
      ...objectSchema({
        target: blockNodeAddressSchema,
        nodeId: { type: 'string' },
        defaultCellMargins: objectSchema(
          {
            topPt: { type: 'number', minimum: 0 },
            rightPt: { type: 'number', minimum: 0 },
            bottomPt: { type: 'number', minimum: 0 },
            leftPt: { type: 'number', minimum: 0 },
          },
          ['topPt', 'rightPt', 'bottomPt', 'leftPt'],
        ),
        cellSpacingPt: { oneOf: [{ type: 'number', minimum: 0 }, { type: 'null' }] },
      }),
      oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
    },
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
        address: tableAddressSchema,
        rows: { type: 'integer', minimum: 0 },
        columns: { type: 'integer', minimum: 0 },
      },
      ['nodeId', 'address', 'rows', 'columns'],
    ),
  },
  'tables.getCells': {
    input: {
      ...objectSchema({
        target: tableAddressSchema,
        nodeId: { type: 'string' },
        rowIndex: { type: 'integer', minimum: 0 },
        columnIndex: { type: 'integer', minimum: 0 },
      }),
      oneOf: [{ required: ['target'] }, { required: ['nodeId'] }],
    },
    output: objectSchema(
      {
        nodeId: { type: 'string' },
        address: tableAddressSchema,
        cells: {
          type: 'array',
          items: objectSchema(
            {
              nodeId: { type: 'string' },
              address: tableCellAddressSchema,
              rowIndex: { type: 'integer', minimum: 0 },
              columnIndex: { type: 'integer', minimum: 0 },
              colspan: { type: 'integer', minimum: 1 },
              rowspan: { type: 'integer', minimum: 1 },
            },
            ['nodeId', 'address', 'rowIndex', 'columnIndex', 'colspan', 'rowspan'],
          ),
        },
      },
      ['nodeId', 'address', 'cells'],
    ),
  },
  'tables.getProperties': {
    input: tableLocatorSchema,
    output: objectSchema(
      {
        nodeId: { type: 'string' },
        address: tableAddressSchema,
        styleId: { type: 'string' },
        alignment: { enum: ['left', 'center', 'right'] },
        direction: { enum: ['ltr', 'rtl'] },
        preferredWidth: { type: 'number' },
        autoFitMode: { enum: ['fixedWidth', 'fitContents', 'fitWindow'] },
        styleOptions: objectSchema({
          headerRow: { type: 'boolean' },
          lastRow: { type: 'boolean' },
          firstColumn: { type: 'boolean' },
          lastColumn: { type: 'boolean' },
          bandedRows: { type: 'boolean' },
          bandedColumns: { type: 'boolean' },
        }),
        borders: objectSchema({
          top: nullableTableBorderSpecSchema,
          bottom: nullableTableBorderSpecSchema,
          left: nullableTableBorderSpecSchema,
          right: nullableTableBorderSpecSchema,
          insideH: nullableTableBorderSpecSchema,
          insideV: nullableTableBorderSpecSchema,
        }),
        defaultCellMargins: objectSchema({
          topPt: { type: 'number' },
          rightPt: { type: 'number' },
          bottomPt: { type: 'number' },
          leftPt: { type: 'number' },
        }),
        cellSpacingPt: { type: 'number' },
      },
      ['nodeId', 'address'],
    ),
  },
  'tables.getStyles': {
    input: strictEmptyObjectSchema,
    output: objectSchema(
      {
        explicitDefaultStyleId: { type: ['string', 'null'] },
        effectiveDefaultStyleId: { type: ['string', 'null'] },
        effectiveDefaultSource: { type: 'string' },
        styles: arraySchema(
          objectSchema(
            {
              id: { type: 'string' },
              name: { type: ['string', 'null'] },
              basedOn: { type: ['string', 'null'] },
              isDefault: { type: 'boolean' },
              isCustom: { type: 'boolean' },
              uiPriority: { type: ['integer', 'null'] },
              hidden: { type: 'boolean' },
              quickFormat: { type: 'boolean' },
              conditionalRegions: arraySchema({ type: 'string' }),
            },
            [
              'id',
              'name',
              'basedOn',
              'isDefault',
              'isCustom',
              'uiPriority',
              'hidden',
              'quickFormat',
              'conditionalRegions',
            ],
          ),
        ),
      },
      ['explicitDefaultStyleId', 'effectiveDefaultStyleId', 'effectiveDefaultSource', 'styles'],
    ),
  },
  'tables.setDefaultStyle': {
    input: objectSchema({ styleId: { type: 'string' } }, ['styleId']),
    output: documentMutationResultSchemaFor('tables.setDefaultStyle'),
    success: documentMutationSuccessSchema,
    failure: sectionMutationFailureSchemaFor('tables.setDefaultStyle'),
  },
  'tables.clearDefaultStyle': {
    input: strictEmptyObjectSchema,
    output: documentMutationResultSchemaFor('tables.clearDefaultStyle'),
    success: documentMutationSuccessSchema,
    failure: sectionMutationFailureSchemaFor('tables.clearDefaultStyle'),
  },

  // --- history.* ---
  'history.get': {
    input: strictEmptyObjectSchema,
    output: objectSchema(
      {
        undoDepth: { type: 'integer', minimum: 0 },
        redoDepth: { type: 'integer', minimum: 0 },
        canUndo: { type: 'boolean' },
        canRedo: { type: 'boolean' },
        historyUnsafeOperations: { type: 'array', items: { type: 'string' } },
      },
      ['undoDepth', 'redoDepth', 'canUndo', 'canRedo', 'historyUnsafeOperations'],
    ),
  },
  'history.undo': {
    input: strictEmptyObjectSchema,
    output: historyActionSuccessSchema,
    success: historyActionSuccessSchema,
    failure: historyActionFailureSchema,
  },
  'history.redo': {
    input: strictEmptyObjectSchema,
    output: historyActionSuccessSchema,
    success: historyActionSuccessSchema,
    failure: historyActionFailureSchema,
  },
  // -------------------------------------------------------------------------
  // TOC schemas
  // -------------------------------------------------------------------------

  'create.tableOfContents': {
    input: objectSchema({
      at: {
        oneOf: [
          objectSchema({ kind: { const: 'documentStart' } }, ['kind']),
          objectSchema({ kind: { const: 'documentEnd' } }, ['kind']),
          objectSchema({ kind: { const: 'before' }, target: blockNodeAddressSchema }, ['kind', 'target']),
          objectSchema({ kind: { const: 'after' }, target: blockNodeAddressSchema }, ['kind', 'target']),
        ],
      },
      config: objectSchema({
        outlineLevels: objectSchema({ from: { type: 'integer' }, to: { type: 'integer' } }, ['from', 'to']),
        useAppliedOutlineLevel: { type: 'boolean' },
        tcFieldIdentifier: { type: 'string' },
        tcFieldLevels: objectSchema({ from: { type: 'integer' }, to: { type: 'integer' } }, ['from', 'to']),
        hyperlinks: { type: 'boolean' },
        hideInWebView: { type: 'boolean' },
        omitPageNumberLevels: objectSchema({ from: { type: 'integer' }, to: { type: 'integer' } }, ['from', 'to']),
        separator: { type: 'string' },
        includePageNumbers: { type: 'boolean' },
        tabLeader: { enum: ['none', 'dot', 'hyphen', 'underscore', 'middleDot'] },
        rightAlignPageNumbers: { type: 'boolean' },
      }),
    }),
    output: tocMutationResultSchema(),
    success: tocMutationSuccessSchema,
    failure: tocMutationFailureSchema,
  },
  'toc.list': {
    input: objectSchema({
      limit: { type: 'integer' },
      offset: { type: 'integer' },
    }),
    output: objectSchema(
      {
        evaluatedRevision: { type: 'string' },
        total: { type: 'integer' },
        items: arraySchema(
          objectSchema(
            {
              id: { type: 'string' },
              handle: ref('ResolvedHandle'),
              address: tocAddressSchema(),
              instruction: { type: 'string' },
              sourceConfig: { type: 'object' },
              displayConfig: { type: 'object' },
              preserved: { type: 'object' },
              entryCount: { type: 'integer' },
            },
            ['id', 'handle', 'address', 'instruction', 'entryCount'],
          ),
        ),
        page: ref('PageInfo'),
      },
      ['evaluatedRevision', 'total', 'items', 'page'],
    ),
  },
  'toc.get': {
    input: objectSchema({ target: tocAddressSchema() }, ['target']),
    output: objectSchema(
      {
        nodeType: { const: 'tableOfContents' },
        kind: { const: 'block' },
        properties: objectSchema(
          {
            instruction: { type: 'string' },
            sourceConfig: { type: 'object' },
            displayConfig: { type: 'object' },
            preservedSwitches: { type: 'object' },
            entryCount: { type: 'integer' },
          },
          ['instruction', 'entryCount'],
        ),
      },
      ['nodeType', 'kind', 'properties'],
    ),
  },
  'toc.configure': {
    input: objectSchema(
      {
        target: tocAddressSchema(),
        patch: objectSchema({
          outlineLevels: objectSchema({ from: { type: 'integer' }, to: { type: 'integer' } }, ['from', 'to']),
          useAppliedOutlineLevel: { type: 'boolean' },
          tcFieldIdentifier: { type: 'string' },
          tcFieldLevels: objectSchema({ from: { type: 'integer' }, to: { type: 'integer' } }, ['from', 'to']),
          hyperlinks: { type: 'boolean' },
          hideInWebView: { type: 'boolean' },
          omitPageNumberLevels: objectSchema({ from: { type: 'integer' }, to: { type: 'integer' } }, ['from', 'to']),
          separator: { type: 'string' },
          includePageNumbers: { type: 'boolean' },
          tabLeader: { enum: ['none', 'dot', 'hyphen', 'underscore', 'middleDot'] },
          rightAlignPageNumbers: { type: 'boolean' },
        }),
      },
      ['target', 'patch'],
    ),
    output: tocMutationResultSchema(),
    success: tocMutationSuccessSchema,
    failure: tocMutationFailureSchema,
  },
  'toc.update': {
    input: objectSchema(
      {
        target: tocAddressSchema(),
        mode: { enum: ['all', 'pageNumbers'] },
      },
      ['target'],
    ),
    output: tocMutationResultSchema(),
    success: tocMutationSuccessSchema,
    failure: tocMutationFailureSchema,
  },
  'toc.remove': {
    input: objectSchema({ target: tocAddressSchema() }, ['target']),
    output: tocMutationResultSchema(),
    success: tocMutationSuccessSchema,
    failure: tocMutationFailureSchema,
  },
  'toc.markEntry': {
    input: objectSchema(
      {
        target: tocEntryInsertionTargetSchema(),
        text: { type: 'string' },
        level: { type: 'integer', minimum: 1, maximum: 9 },
        tableIdentifier: { type: 'string' },
        omitPageNumber: { type: 'boolean' },
      },
      ['target', 'text'],
    ),
    output: tocEntryMutationResultSchema(),
    success: tocEntryMutationSuccessSchema,
    failure: tocEntryMutationFailureSchema,
  },
  'toc.unmarkEntry': {
    input: objectSchema({ target: tocEntryAddressSchema() }, ['target']),
    output: tocEntryMutationResultSchema(),
    success: tocEntryMutationSuccessSchema,
    failure: tocEntryMutationFailureSchema,
  },
  'toc.listEntries': {
    input: objectSchema({
      tableIdentifier: { type: 'string' },
      levelRange: objectSchema({ from: { type: 'integer' }, to: { type: 'integer' } }, ['from', 'to']),
      limit: { type: 'integer' },
      offset: { type: 'integer' },
    }),
    output: objectSchema(
      {
        evaluatedRevision: { type: 'string' },
        total: { type: 'integer' },
        items: arraySchema(
          objectSchema(
            {
              id: { type: 'string' },
              handle: ref('ResolvedHandle'),
              address: tocEntryAddressSchema(),
              instruction: { type: 'string' },
              text: { type: 'string' },
              level: { type: 'integer' },
              tableIdentifier: { type: 'string' },
              omitPageNumber: { type: 'boolean' },
            },
            ['id', 'handle', 'address', 'instruction', 'text', 'level', 'omitPageNumber'],
          ),
        ),
        page: ref('PageInfo'),
      },
      ['evaluatedRevision', 'total', 'items', 'page'],
    ),
  },
  'toc.getEntry': {
    input: objectSchema({ target: tocEntryAddressSchema() }, ['target']),
    output: objectSchema(
      {
        nodeType: { const: 'tableOfContentsEntry' },
        kind: { const: 'inline' },
        properties: objectSchema(
          {
            instruction: { type: 'string' },
            text: { type: 'string' },
            level: { type: 'integer' },
            tableIdentifier: { type: 'string' },
            omitPageNumber: { type: 'boolean' },
          },
          ['instruction', 'text', 'level', 'omitPageNumber'],
        ),
      },
      ['nodeType', 'kind', 'properties'],
    ),
  },
  'toc.editEntry': {
    input: objectSchema(
      {
        target: tocEntryAddressSchema(),
        patch: objectSchema({
          text: { type: 'string' },
          level: { type: 'integer', minimum: 1, maximum: 9 },
          tableIdentifier: { type: 'string' },
          omitPageNumber: { type: 'boolean' },
        }),
      },
      ['target', 'patch'],
    ),
    output: tocEntryMutationResultSchema(),
    success: tocEntryMutationSuccessSchema,
    failure: tocEntryMutationFailureSchema,
  },

  // --- images ---

  // Shared image location schema — discriminated union on `kind`.
  // Used by create.image (at) and images.move (to).

  'create.image': {
    input: objectSchema(
      {
        in: storyLocatorSchema,
        src: { type: 'string' },
        alt: { type: 'string' },
        title: { type: 'string' },
        size: objectSchema({ width: { type: 'number' }, height: { type: 'number' } }),
        at: {
          oneOf: [
            objectSchema({ kind: { const: 'documentStart' } }, ['kind']),
            objectSchema({ kind: { const: 'documentEnd' } }, ['kind']),
            objectSchema({ kind: { const: 'before' }, target: blockNodeAddressSchema }, ['kind', 'target']),
            objectSchema({ kind: { const: 'after' }, target: blockNodeAddressSchema }, ['kind', 'target']),
            objectSchema(
              { kind: { const: 'inParagraph' }, target: blockNodeAddressSchema, offset: { type: 'integer' } },
              ['kind', 'target'],
            ),
          ],
        },
      },
      ['src'],
    ),
    output: objectSchema({ success: { type: 'boolean' }, image: { type: 'object' }, failure: { type: 'object' } }),
    success: objectSchema({ success: { const: true }, image: { type: 'object' } }, ['success', 'image']),
    failure: objectSchema(
      {
        success: { const: false },
        failure: objectSchema({ code: { enum: ['INVALID_TARGET', 'INVALID_INPUT'] }, message: { type: 'string' } }, [
          'code',
          'message',
        ]),
      },
      ['success', 'failure'],
    ),
  },
  'images.list': {
    input: objectSchema({ offset: { type: 'integer' }, limit: { type: 'integer' } }),
    output: objectSchema({ total: { type: 'integer' }, items: arraySchema({ type: 'object' }) }, ['total', 'items']),
  },
  'images.get': {
    input: objectSchema({ imageId: { type: 'string' } }, ['imageId']),
    output: { type: 'object' as const },
  },
  'images.delete': {
    input: objectSchema({ imageId: { type: 'string' } }, ['imageId']),
    output: objectSchema({ success: { type: 'boolean' }, image: { type: 'object' }, failure: { type: 'object' } }),
    success: objectSchema({ success: { const: true }, image: { type: 'object' } }, ['success', 'image']),
    failure: objectSchema(
      {
        success: { const: false },
        failure: objectSchema({ code: { type: 'string' }, message: { type: 'string' } }, ['code', 'message']),
      },
      ['success', 'failure'],
    ),
  },
  'images.move': {
    input: objectSchema(
      {
        imageId: { type: 'string' },
        to: {
          oneOf: [
            objectSchema({ kind: { const: 'documentStart' } }, ['kind']),
            objectSchema({ kind: { const: 'documentEnd' } }, ['kind']),
            objectSchema({ kind: { const: 'before' }, target: blockNodeAddressSchema }, ['kind', 'target']),
            objectSchema({ kind: { const: 'after' }, target: blockNodeAddressSchema }, ['kind', 'target']),
            objectSchema(
              { kind: { const: 'inParagraph' }, target: blockNodeAddressSchema, offset: { type: 'integer' } },
              ['kind', 'target'],
            ),
          ],
        },
      },
      ['imageId', 'to'],
    ),
    output: objectSchema({ success: { type: 'boolean' }, image: { type: 'object' }, failure: { type: 'object' } }),
    success: objectSchema({ success: { const: true }, image: { type: 'object' } }, ['success', 'image']),
    failure: objectSchema(
      {
        success: { const: false },
        failure: objectSchema({ code: { type: 'string' }, message: { type: 'string' } }, ['code', 'message']),
      },
      ['success', 'failure'],
    ),
  },
  'images.convertToInline': {
    input: objectSchema({ imageId: { type: 'string' } }, ['imageId']),
    output: objectSchema({ success: { type: 'boolean' }, image: { type: 'object' }, failure: { type: 'object' } }),
    success: objectSchema({ success: { const: true }, image: { type: 'object' } }, ['success', 'image']),
    failure: objectSchema(
      {
        success: { const: false },
        failure: objectSchema({ code: { type: 'string' }, message: { type: 'string' } }, ['code', 'message']),
      },
      ['success', 'failure'],
    ),
  },
  'images.convertToFloating': {
    input: objectSchema({ imageId: { type: 'string' } }, ['imageId']),
    output: objectSchema({ success: { type: 'boolean' }, image: { type: 'object' }, failure: { type: 'object' } }),
    success: objectSchema({ success: { const: true }, image: { type: 'object' } }, ['success', 'image']),
    failure: objectSchema(
      {
        success: { const: false },
        failure: objectSchema({ code: { type: 'string' }, message: { type: 'string' } }, ['code', 'message']),
      },
      ['success', 'failure'],
    ),
  },
  'images.setSize': {
    input: objectSchema(
      {
        imageId: { type: 'string' },
        size: objectSchema(
          {
            width: { type: 'number', exclusiveMinimum: 0 },
            height: { type: 'number', exclusiveMinimum: 0 },
            unit: { type: 'string', enum: ['px', 'pt', 'twip'] },
          },
          ['width', 'height'],
        ),
      },
      ['imageId', 'size'],
    ),
    output: objectSchema({ success: { type: 'boolean' }, image: { type: 'object' }, failure: { type: 'object' } }),
    success: objectSchema({ success: { const: true }, image: { type: 'object' } }, ['success', 'image']),
    failure: objectSchema(
      {
        success: { const: false },
        failure: objectSchema({ code: { type: 'string' }, message: { type: 'string' } }, ['code', 'message']),
      },
      ['success', 'failure'],
    ),
  },
  'images.setWrapType': {
    input: objectSchema(
      {
        imageId: { type: 'string' },
        type: { type: 'string', enum: ['None', 'Square', 'Through', 'Tight', 'TopAndBottom', 'Inline'] },
      },
      ['imageId', 'type'],
    ),
    output: objectSchema({ success: { type: 'boolean' }, image: { type: 'object' }, failure: { type: 'object' } }),
    success: objectSchema({ success: { const: true }, image: { type: 'object' } }, ['success', 'image']),
    failure: objectSchema(
      {
        success: { const: false },
        failure: objectSchema({ code: { type: 'string' }, message: { type: 'string' } }, ['code', 'message']),
      },
      ['success', 'failure'],
    ),
  },
  'images.setWrapSide': {
    input: objectSchema(
      { imageId: { type: 'string' }, side: { type: 'string', enum: ['bothSides', 'left', 'right', 'largest'] } },
      ['imageId', 'side'],
    ),
    output: objectSchema({ success: { type: 'boolean' }, image: { type: 'object' }, failure: { type: 'object' } }),
    success: objectSchema({ success: { const: true }, image: { type: 'object' } }, ['success', 'image']),
    failure: objectSchema(
      {
        success: { const: false },
        failure: objectSchema({ code: { type: 'string' }, message: { type: 'string' } }, ['code', 'message']),
      },
      ['success', 'failure'],
    ),
  },
  'images.setWrapDistances': {
    input: objectSchema(
      {
        imageId: { type: 'string' },
        distances: objectSchema({
          distTop: { type: 'number' },
          distBottom: { type: 'number' },
          distLeft: { type: 'number' },
          distRight: { type: 'number' },
        }),
      },
      ['imageId', 'distances'],
    ),
    output: objectSchema({ success: { type: 'boolean' }, image: { type: 'object' }, failure: { type: 'object' } }),
    success: objectSchema({ success: { const: true }, image: { type: 'object' } }, ['success', 'image']),
    failure: objectSchema(
      {
        success: { const: false },
        failure: objectSchema({ code: { type: 'string' }, message: { type: 'string' } }, ['code', 'message']),
      },
      ['success', 'failure'],
    ),
  },
  'images.setPosition': {
    input: objectSchema(
      {
        imageId: { type: 'string' },
        position: objectSchema({
          hRelativeFrom: { type: 'string' },
          vRelativeFrom: { type: 'string' },
          alignH: { type: 'string' },
          alignV: { type: 'string' },
          marginOffset: objectSchema({
            horizontal: { type: 'number' },
            top: { type: 'number' },
          }),
        }),
      },
      ['imageId', 'position'],
    ),
    output: objectSchema({ success: { type: 'boolean' }, image: { type: 'object' }, failure: { type: 'object' } }),
    success: objectSchema({ success: { const: true }, image: { type: 'object' } }, ['success', 'image']),
    failure: objectSchema(
      {
        success: { const: false },
        failure: objectSchema({ code: { type: 'string' }, message: { type: 'string' } }, ['code', 'message']),
      },
      ['success', 'failure'],
    ),
  },
  'images.setAnchorOptions': {
    input: objectSchema(
      {
        imageId: { type: 'string' },
        options: objectSchema({
          behindDoc: { type: 'boolean' },
          allowOverlap: { type: 'boolean' },
          layoutInCell: { type: 'boolean' },
          lockAnchor: { type: 'boolean' },
          simplePos: { type: 'boolean' },
        }),
      },
      ['imageId', 'options'],
    ),
    output: objectSchema({ success: { type: 'boolean' }, image: { type: 'object' }, failure: { type: 'object' } }),
    success: objectSchema({ success: { const: true }, image: { type: 'object' } }, ['success', 'image']),
    failure: objectSchema(
      {
        success: { const: false },
        failure: objectSchema({ code: { type: 'string' }, message: { type: 'string' } }, ['code', 'message']),
      },
      ['success', 'failure'],
    ),
  },
  'images.setZOrder': imagesMutationSchemaSet(
    objectSchema(
      {
        imageId: { type: 'string' },
        zOrder: objectSchema(
          {
            relativeHeight: {
              type: 'integer',
              minimum: Z_ORDER_RELATIVE_HEIGHT_MIN,
              maximum: Z_ORDER_RELATIVE_HEIGHT_MAX,
            },
          },
          ['relativeHeight'],
        ),
      },
      ['imageId', 'zOrder'],
    ),
  ),

  // --- SD-2100: Geometry ---

  'images.scale': imagesMutationSchemaSet(
    objectSchema({ imageId: { type: 'string' }, factor: { type: 'number', exclusiveMinimum: 0 } }, [
      'imageId',
      'factor',
    ]),
  ),

  'images.setLockAspectRatio': imagesMutationSchemaSet(
    objectSchema({ imageId: { type: 'string' }, locked: { type: 'boolean' } }, ['imageId', 'locked']),
  ),

  'images.rotate': imagesMutationSchemaSet(
    objectSchema({ imageId: { type: 'string' }, angle: { type: 'number', minimum: 0, maximum: 360 } }, [
      'imageId',
      'angle',
    ]),
  ),

  'images.flip': imagesMutationSchemaSet(
    objectSchema({ imageId: { type: 'string' }, horizontal: { type: 'boolean' }, vertical: { type: 'boolean' } }, [
      'imageId',
    ]),
  ),

  'images.crop': imagesMutationSchemaSet(
    objectSchema(
      {
        imageId: { type: 'string' },
        crop: objectSchema(
          {
            left: { type: 'number', minimum: 0, maximum: 100 },
            top: { type: 'number', minimum: 0, maximum: 100 },
            right: { type: 'number', minimum: 0, maximum: 100 },
            bottom: { type: 'number', minimum: 0, maximum: 100 },
          },
          [], // All fields optional; omitted edges default to 0 at runtime
        ),
      },
      ['imageId', 'crop'],
    ),
  ),

  'images.resetCrop': imagesMutationSchemaSet(objectSchema({ imageId: { type: 'string' } }, ['imageId'])),

  // --- SD-2100: Content replacement ---

  'images.replaceSource': imagesMutationSchemaSet(
    objectSchema({ imageId: { type: 'string' }, src: { type: 'string' }, resetSize: { type: 'boolean' } }, [
      'imageId',
      'src',
    ]),
  ),

  // --- SD-2100: Semantic metadata ---

  'images.setAltText': imagesMutationSchemaSet(
    objectSchema({ imageId: { type: 'string' }, description: { type: 'string' } }, ['imageId', 'description']),
  ),

  'images.setDecorative': imagesMutationSchemaSet(
    objectSchema({ imageId: { type: 'string' }, decorative: { type: 'boolean' } }, ['imageId', 'decorative']),
  ),

  'images.setName': imagesMutationSchemaSet(
    objectSchema({ imageId: { type: 'string' }, name: { type: 'string' } }, ['imageId', 'name']),
  ),

  'images.setHyperlink': imagesMutationSchemaSet(
    objectSchema(
      {
        imageId: { type: 'string' },
        url: { type: ['string', 'null'] },
        tooltip: { type: 'string' },
      },
      ['imageId', 'url'],
    ),
  ),

  // --- SD-2100: Caption lifecycle ---

  'images.insertCaption': imagesMutationSchemaSet(
    objectSchema({ imageId: { type: 'string' }, text: { type: 'string' } }, ['imageId', 'text']),
  ),

  'images.updateCaption': imagesMutationSchemaSet(
    objectSchema({ imageId: { type: 'string' }, text: { type: 'string' } }, ['imageId', 'text']),
  ),

  'images.removeCaption': imagesMutationSchemaSet(objectSchema({ imageId: { type: 'string' } }, ['imageId'])),

  // --- hyperlinks.* ---
  'hyperlinks.list': {
    input: objectSchema({
      within: blockNodeAddressSchema,
      hrefPattern: { type: 'string' },
      anchor: { type: 'string' },
      textPattern: { type: 'string' },
      limit: { type: 'integer' },
      offset: { type: 'integer' },
    }),
    output: discoveryResultSchema(hyperlinkDomainSchema),
  },
  'hyperlinks.get': {
    input: objectSchema({ target: hyperlinkTargetSchema }, ['target']),
    output: hyperlinkInfoSchema,
  },
  'hyperlinks.wrap': {
    input: objectSchema({ target: textAddressSchema, link: hyperlinkSpecSchema }, ['target', 'link']),
    output: hyperlinkMutationResultSchema(),
    success: hyperlinkMutationSuccessSchema,
    failure: hyperlinkMutationFailureSchema,
  },
  'hyperlinks.insert': {
    input: objectSchema({ target: textAddressSchema, text: { type: 'string' }, link: hyperlinkSpecSchema }, [
      'text',
      'link',
    ]),
    output: hyperlinkMutationResultSchema(),
    success: hyperlinkMutationSuccessSchema,
    failure: hyperlinkMutationFailureSchema,
  },
  'hyperlinks.patch': {
    input: objectSchema({ target: hyperlinkTargetSchema, patch: hyperlinkPatchSchema }, ['target', 'patch']),
    output: hyperlinkMutationResultSchema(),
    success: hyperlinkMutationSuccessSchema,
    failure: hyperlinkMutationFailureSchema,
  },
  'hyperlinks.remove': {
    input: objectSchema({ target: hyperlinkTargetSchema, mode: { enum: ['unwrap', 'deleteText'] } }, ['target']),
    output: hyperlinkMutationResultSchema(),
    success: hyperlinkMutationSuccessSchema,
    failure: hyperlinkMutationFailureSchema,
  },

  // =========================================================================
  // headerFooters.*
  // =========================================================================

  'headerFooters.list': {
    input: objectSchema({
      kind: { enum: ['header', 'footer'] },
      section: sectionAddressSchema,
      limit: { type: 'integer', minimum: 1 },
      offset: { type: 'integer', minimum: 0 },
    }),
    output: discoveryResultSchema(
      discoveryItemSchema(
        {
          section: sectionAddressSchema,
          sectionIndex: { type: 'integer', minimum: 0 },
          kind: { enum: ['header', 'footer'] },
          variant: { enum: ['default', 'first', 'even'] },
          refId: { type: ['string', 'null'] },
          isExplicit: { type: 'boolean' },
        },
        ['section', 'sectionIndex', 'kind', 'variant', 'isExplicit'],
      ),
    ),
  },
  'headerFooters.get': {
    input: objectSchema(
      {
        target: objectSchema(
          {
            kind: { const: 'headerFooterSlot' },
            section: sectionAddressSchema,
            headerFooterKind: { enum: ['header', 'footer'] },
            variant: { enum: ['default', 'first', 'even'] },
          },
          ['kind', 'section', 'headerFooterKind', 'variant'],
        ),
      },
      ['target'],
    ),
    output: objectSchema(
      {
        section: sectionAddressSchema,
        sectionIndex: { type: 'integer', minimum: 0 },
        kind: { enum: ['header', 'footer'] },
        variant: { enum: ['default', 'first', 'even'] },
        refId: { type: ['string', 'null'] },
        isExplicit: { type: 'boolean' },
      },
      ['section', 'sectionIndex', 'kind', 'variant', 'isExplicit'],
    ),
  },
  'headerFooters.resolve': {
    input: objectSchema(
      {
        target: objectSchema(
          {
            kind: { const: 'headerFooterSlot' },
            section: sectionAddressSchema,
            headerFooterKind: { enum: ['header', 'footer'] },
            variant: { enum: ['default', 'first', 'even'] },
          },
          ['kind', 'section', 'headerFooterKind', 'variant'],
        ),
      },
      ['target'],
    ),
    output: {
      oneOf: [
        objectSchema({ status: { const: 'explicit' }, refId: { type: 'string' }, section: sectionAddressSchema }, [
          'status',
          'refId',
          'section',
        ]),
        objectSchema(
          {
            status: { const: 'inherited' },
            refId: { type: 'string' },
            resolvedFromSection: sectionAddressSchema,
            resolvedVariant: { enum: ['default', 'first', 'even'] },
          },
          ['status', 'refId', 'resolvedFromSection', 'resolvedVariant'],
        ),
        objectSchema({ status: { const: 'none' } }, ['status']),
      ],
    },
  },
  'headerFooters.refs.set': {
    input: objectSchema(
      {
        target: objectSchema(
          {
            kind: { const: 'headerFooterSlot' },
            section: sectionAddressSchema,
            headerFooterKind: { enum: ['header', 'footer'] },
            variant: { enum: ['default', 'first', 'even'] },
          },
          ['kind', 'section', 'headerFooterKind', 'variant'],
        ),
        refId: { type: 'string', minLength: 1 },
      },
      ['target', 'refId'],
    ),
    output: sectionMutationResultSchemaFor('headerFooters.refs.set'),
    success: sectionMutationSuccessSchema,
    failure: sectionMutationFailureSchemaFor('headerFooters.refs.set'),
  },
  'headerFooters.refs.clear': {
    input: objectSchema(
      {
        target: objectSchema(
          {
            kind: { const: 'headerFooterSlot' },
            section: sectionAddressSchema,
            headerFooterKind: { enum: ['header', 'footer'] },
            variant: { enum: ['default', 'first', 'even'] },
          },
          ['kind', 'section', 'headerFooterKind', 'variant'],
        ),
      },
      ['target'],
    ),
    output: sectionMutationResultSchemaFor('headerFooters.refs.clear'),
    success: sectionMutationSuccessSchema,
    failure: sectionMutationFailureSchemaFor('headerFooters.refs.clear'),
  },
  'headerFooters.refs.setLinkedToPrevious': {
    input: objectSchema(
      {
        target: objectSchema(
          {
            kind: { const: 'headerFooterSlot' },
            section: sectionAddressSchema,
            headerFooterKind: { enum: ['header', 'footer'] },
            variant: { enum: ['default', 'first', 'even'] },
          },
          ['kind', 'section', 'headerFooterKind', 'variant'],
        ),
        linked: { type: 'boolean' },
      },
      ['target', 'linked'],
    ),
    output: sectionMutationResultSchemaFor('headerFooters.refs.setLinkedToPrevious'),
    success: sectionMutationSuccessSchema,
    failure: sectionMutationFailureSchemaFor('headerFooters.refs.setLinkedToPrevious'),
  },
  'headerFooters.parts.list': {
    input: objectSchema({
      kind: { enum: ['header', 'footer'] },
      limit: { type: 'integer', minimum: 1 },
      offset: { type: 'integer', minimum: 0 },
    }),
    output: discoveryResultSchema(
      discoveryItemSchema(
        {
          refId: { type: 'string' },
          kind: { enum: ['header', 'footer'] },
          partPath: { type: 'string' },
          referencedBySections: arraySchema(sectionAddressSchema),
        },
        ['refId', 'kind', 'partPath', 'referencedBySections'],
      ),
    ),
  },
  'headerFooters.parts.create': {
    input: objectSchema(
      {
        kind: { enum: ['header', 'footer'] },
        sourceRefId: { type: 'string', minLength: 1 },
      },
      ['kind'],
    ),
    output: {
      oneOf: [
        objectSchema({ success: { const: true }, refId: { type: 'string' }, partPath: { type: 'string' } }, [
          'success',
          'refId',
          'partPath',
        ]),
        objectSchema(
          {
            success: { const: false },
            failure: receiptFailureSchemaFor('headerFooters.parts.create'),
          },
          ['success', 'failure'],
        ),
      ],
    },
    success: objectSchema({ success: { const: true }, refId: { type: 'string' }, partPath: { type: 'string' } }, [
      'success',
      'refId',
      'partPath',
    ]),
    failure: objectSchema(
      {
        success: { const: false },
        failure: receiptFailureSchemaFor('headerFooters.parts.create'),
      },
      ['success', 'failure'],
    ),
  },
  'headerFooters.parts.delete': {
    input: objectSchema(
      {
        target: objectSchema(
          {
            kind: { const: 'headerFooterPart' },
            refId: { type: 'string', minLength: 1 },
          },
          ['kind', 'refId'],
        ),
      },
      ['target'],
    ),
    output: {
      oneOf: [
        objectSchema({ success: { const: true }, refId: { type: 'string' }, partPath: { type: 'string' } }, [
          'success',
          'refId',
          'partPath',
        ]),
        objectSchema(
          {
            success: { const: false },
            failure: receiptFailureSchemaFor('headerFooters.parts.delete'),
          },
          ['success', 'failure'],
        ),
      ],
    },
    success: objectSchema({ success: { const: true }, refId: { type: 'string' }, partPath: { type: 'string' } }, [
      'success',
      'refId',
      'partPath',
    ]),
    failure: objectSchema(
      {
        success: { const: false },
        failure: receiptFailureSchemaFor('headerFooters.parts.delete'),
      },
      ['success', 'failure'],
    ),
  },

  // =========================================================================
  // Content Controls (SD-2070) — schemas
  // =========================================================================
  ...buildContentControlSchemas(),
  // -------------------------------------------------------------------------
  // Bookmarks
  // -------------------------------------------------------------------------
  'bookmarks.list': {
    input: refListQuerySchema,
    output: discoveryOutputSchema,
  },
  'bookmarks.get': {
    input: objectSchema({ target: bookmarkAddressSchema }, ['target']),
    output: { type: 'object' },
  },
  'bookmarks.insert': {
    input: objectSchema(
      {
        name: { type: 'string' },
        at: textTargetSchema,
        tableColumn: objectSchema({ colFirst: { type: 'integer' }, colLast: { type: 'integer' } }, [
          'colFirst',
          'colLast',
        ]),
      },
      ['name', 'at'],
    ),
    ...bookmarkMutation,
  },
  'bookmarks.rename': {
    input: objectSchema({ target: bookmarkAddressSchema, newName: { type: 'string' } }, ['target', 'newName']),
    ...bookmarkMutation,
  },
  'bookmarks.remove': {
    input: objectSchema({ target: bookmarkAddressSchema }, ['target']),
    ...bookmarkMutation,
  },

  // -------------------------------------------------------------------------
  // Footnotes
  // -------------------------------------------------------------------------
  'footnotes.list': {
    input: objectSchema({
      type: { enum: ['footnote', 'endnote'] },
      limit: { type: 'integer' },
      offset: { type: 'integer' },
    }),
    output: discoveryOutputSchema,
  },
  'footnotes.get': {
    input: objectSchema({ target: footnoteAddressSchema }, ['target']),
    output: { type: 'object' },
  },
  'footnotes.insert': {
    input: objectSchema(
      { at: textTargetSchema, type: { enum: ['footnote', 'endnote'] }, content: { type: 'string' } },
      ['at', 'type', 'content'],
    ),
    ...footnoteMutation,
  },
  'footnotes.update': {
    input: objectSchema({ target: footnoteAddressSchema, patch: objectSchema({ content: { type: 'string' } }) }, [
      'target',
      'patch',
    ]),
    ...footnoteMutation,
  },
  'footnotes.remove': {
    input: objectSchema({ target: footnoteAddressSchema }, ['target']),
    ...footnoteMutation,
  },
  'footnotes.configure': {
    input: objectSchema(
      {
        type: { enum: ['footnote', 'endnote'] },
        scope: footnoteConfigScopeSchema,
        numbering: footnoteNumberingSchema,
      },
      ['type', 'scope'],
    ),
    ...footnoteConfig,
  },

  // -------------------------------------------------------------------------
  // Cross-References
  // -------------------------------------------------------------------------
  'crossRefs.list': {
    input: refListQuerySchema,
    output: discoveryOutputSchema,
  },
  'crossRefs.get': {
    input: objectSchema({ target: crossRefAddressSchema }, ['target']),
    output: { type: 'object' },
  },
  'crossRefs.insert': {
    input: objectSchema({ at: textTargetSchema, target: crossRefTargetSchema, display: crossRefDisplaySchema }, [
      'at',
      'target',
      'display',
    ]),
    ...crossRefMutation,
  },
  'crossRefs.rebuild': {
    input: objectSchema({ target: crossRefAddressSchema }, ['target']),
    ...crossRefMutation,
  },
  'crossRefs.remove': {
    input: objectSchema({ target: crossRefAddressSchema }, ['target']),
    ...crossRefMutation,
  },

  // -------------------------------------------------------------------------
  // Index
  // -------------------------------------------------------------------------
  'index.list': {
    input: refListQuerySchema,
    output: discoveryOutputSchema,
  },
  'index.get': {
    input: objectSchema({ target: indexAddressSchema }, ['target']),
    output: { type: 'object' },
  },
  'index.insert': {
    input: objectSchema({ at: tocCreateLocationSchema, config: indexConfigSchema }, ['at']),
    ...indexMutation,
  },
  'index.configure': {
    input: objectSchema({ target: indexAddressSchema, patch: indexConfigSchema }, ['target', 'patch']),
    ...indexMutation,
  },
  'index.rebuild': {
    input: objectSchema({ target: indexAddressSchema }, ['target']),
    ...indexMutation,
  },
  'index.remove': {
    input: objectSchema({ target: indexAddressSchema }, ['target']),
    ...indexMutation,
  },

  // --- Index entries ---
  'index.entries.list': {
    input: objectSchema({ entryType: { type: 'string' }, limit: { type: 'integer' }, offset: { type: 'integer' } }),
    output: discoveryOutputSchema,
  },
  'index.entries.get': {
    input: objectSchema({ target: indexEntryAddressSchema }, ['target']),
    output: { type: 'object' },
  },
  'index.entries.insert': {
    input: objectSchema({ at: textTargetSchema, entry: indexEntryDataSchema }, ['at', 'entry']),
    ...indexEntryMutation,
  },
  'index.entries.update': {
    input: objectSchema({ target: indexEntryAddressSchema, patch: indexEntryPatchSchema }, ['target', 'patch']),
    ...indexEntryMutation,
  },
  'index.entries.remove': {
    input: objectSchema({ target: indexEntryAddressSchema }, ['target']),
    ...indexEntryMutation,
  },

  // -------------------------------------------------------------------------
  // Captions
  // -------------------------------------------------------------------------
  'captions.list': {
    input: objectSchema({ label: { type: 'string' }, limit: { type: 'integer' }, offset: { type: 'integer' } }),
    output: discoveryOutputSchema,
  },
  'captions.get': {
    input: objectSchema({ target: captionAddressSchema }, ['target']),
    output: { type: 'object' },
  },
  'captions.insert': {
    input: objectSchema(
      {
        adjacentTo: blockNodeAddressSchema,
        position: { enum: ['above', 'below'] },
        label: { type: 'string' },
        text: { type: 'string' },
      },
      ['adjacentTo', 'position', 'label'],
    ),
    ...captionMutation,
  },
  'captions.update': {
    input: objectSchema({ target: captionAddressSchema, patch: objectSchema({ text: { type: 'string' } }) }, [
      'target',
      'patch',
    ]),
    ...captionMutation,
  },
  'captions.remove': {
    input: objectSchema({ target: captionAddressSchema }, ['target']),
    ...captionMutation,
  },
  'captions.configure': {
    input: objectSchema(
      {
        label: { type: 'string' },
        format: { enum: ['decimal', 'lowerRoman', 'upperRoman', 'lowerLetter', 'upperLetter'] },
        includeChapter: { type: 'boolean' },
        chapterStyle: { type: 'string' },
      },
      ['label'],
    ),
    ...captionConfig,
  },

  // -------------------------------------------------------------------------
  // Fields
  // -------------------------------------------------------------------------
  'fields.list': {
    input: refListQuerySchema,
    output: discoveryOutputSchema,
  },
  'fields.get': {
    input: objectSchema({ target: fieldAddressSchema }, ['target']),
    output: { type: 'object' },
  },
  'fields.insert': {
    input: objectSchema({ mode: { const: 'raw' }, at: textTargetSchema, instruction: { type: 'string' } }, [
      'mode',
      'at',
      'instruction',
    ]),
    ...fieldMutation,
  },
  'fields.rebuild': {
    input: objectSchema({ target: fieldAddressSchema }, ['target']),
    ...fieldMutation,
  },
  'fields.remove': {
    input: objectSchema({ mode: { const: 'raw' }, target: fieldAddressSchema }, ['mode', 'target']),
    ...fieldMutation,
  },

  // -------------------------------------------------------------------------
  // Citations
  // -------------------------------------------------------------------------
  'citations.list': {
    input: refListQuerySchema,
    output: discoveryOutputSchema,
  },
  'citations.get': {
    input: objectSchema({ target: citationAddressSchema }, ['target']),
    output: { type: 'object' },
  },
  'citations.insert': {
    input: objectSchema({ at: textTargetSchema, sourceIds: { type: 'array', items: { type: 'string' } } }, [
      'at',
      'sourceIds',
    ]),
    ...citationMutation,
  },
  'citations.update': {
    input: objectSchema(
      {
        target: citationAddressSchema,
        patch: objectSchema({ sourceIds: { type: 'array', items: { type: 'string' } } }),
      },
      ['target', 'patch'],
    ),
    ...citationMutation,
  },
  'citations.remove': {
    input: objectSchema({ target: citationAddressSchema }, ['target']),
    ...citationMutation,
  },

  // --- Citations: sources ---
  'citations.sources.list': {
    input: objectSchema({ type: { type: 'string' }, limit: { type: 'integer' }, offset: { type: 'integer' } }),
    output: discoveryOutputSchema,
  },
  'citations.sources.get': {
    input: objectSchema({ target: citationSourceAddressSchema }, ['target']),
    output: { type: 'object' },
  },
  'citations.sources.insert': {
    input: objectSchema(
      {
        type: {
          enum: [
            'book',
            'journalArticle',
            'conferenceProceedings',
            'report',
            'website',
            'patent',
            'case',
            'statute',
            'thesis',
            'film',
            'interview',
            'misc',
          ],
        },
        fields: citationSourceFieldsSchema,
      },
      ['type', 'fields'],
    ),
    ...citationSourceMutation,
  },
  'citations.sources.update': {
    input: objectSchema({ target: citationSourceAddressSchema, patch: citationSourceFieldsSchema }, [
      'target',
      'patch',
    ]),
    ...citationSourceMutation,
  },
  'citations.sources.remove': {
    input: objectSchema({ target: citationSourceAddressSchema }, ['target']),
    ...citationSourceMutation,
  },

  // --- Citations: bibliography ---
  'citations.bibliography.get': {
    input: objectSchema({ target: bibliographyAddressSchema }, ['target']),
    output: { type: 'object' },
  },
  'citations.bibliography.insert': {
    input: objectSchema({ at: tocCreateLocationSchema, style: { type: 'string' } }, ['at']),
    ...bibliographyMutation,
  },
  'citations.bibliography.rebuild': {
    input: objectSchema({ target: bibliographyAddressSchema }, ['target']),
    ...bibliographyMutation,
  },
  'citations.bibliography.configure': {
    input: objectSchema({ target: bibliographyAddressSchema, style: { type: 'string' } }, ['target', 'style']),
    ...bibliographyMutation,
  },
  'citations.bibliography.remove': {
    input: objectSchema({ target: bibliographyAddressSchema }, ['target']),
    ...bibliographyMutation,
  },

  // -------------------------------------------------------------------------
  // Authorities
  // -------------------------------------------------------------------------
  'authorities.list': {
    input: refListQuerySchema,
    output: discoveryOutputSchema,
  },
  'authorities.get': {
    input: objectSchema({ target: authoritiesAddressSchema }, ['target']),
    output: { type: 'object' },
  },
  'authorities.insert': {
    input: objectSchema({ at: tocCreateLocationSchema, config: authoritiesConfigSchema }, ['at']),
    ...authoritiesMutation,
  },
  'authorities.configure': {
    input: objectSchema({ target: authoritiesAddressSchema, patch: authoritiesConfigSchema }, ['target', 'patch']),
    ...authoritiesMutation,
  },
  'authorities.rebuild': {
    input: objectSchema({ target: authoritiesAddressSchema }, ['target']),
    ...authoritiesMutation,
  },
  'authorities.remove': {
    input: objectSchema({ target: authoritiesAddressSchema }, ['target']),
    ...authoritiesMutation,
  },

  // --- Authorities: entries ---
  'authorities.entries.list': {
    input: objectSchema({
      category: { oneOf: [{ type: 'string' }, { type: 'integer' }] },
      limit: { type: 'integer' },
      offset: { type: 'integer' },
    }),
    output: discoveryOutputSchema,
  },
  'authorities.entries.get': {
    input: objectSchema({ target: authorityEntryAddressSchema }, ['target']),
    output: { type: 'object' },
  },
  'authorities.entries.insert': {
    input: objectSchema({ at: textTargetSchema, entry: authorityEntryDataSchema }, ['at', 'entry']),
    ...authorityEntryMutation,
  },
  'authorities.entries.update': {
    input: objectSchema({ target: authorityEntryAddressSchema, patch: authorityEntryPatchSchema }, ['target', 'patch']),
    ...authorityEntryMutation,
  },
  'authorities.entries.remove': {
    input: objectSchema({ target: authorityEntryAddressSchema }, ['target']),
    ...authorityEntryMutation,
  },

  // --- diff.* ---
  'diff.capture': {
    input: objectSchema({}),
    output: diffSnapshotSchema,
  },
  'diff.compare': {
    input: objectSchema({ targetSnapshot: diffSnapshotSchema }, ['targetSnapshot']),
    output: diffPayloadSchema,
  },
  'diff.apply': {
    input: objectSchema({ diff: diffPayloadSchema }, ['diff']),
    output: diffApplyResultSchema,
    success: diffApplyResultSchema,
    failure: { type: 'object' },
  },
  // --- protection.* ---
  'protection.get': {
    input: objectSchema({}),
    output: objectSchema(
      {
        editingRestriction: objectSchema(
          {
            mode: { type: 'string', enum: ['none', 'readOnly', 'comments', 'trackedChanges', 'forms'] },
            enforced: { type: 'boolean' },
            runtimeEnforced: { type: 'boolean' },
            passwordProtected: { type: 'boolean' },
            formattingRestricted: { type: 'boolean' },
          },
          ['mode', 'enforced', 'runtimeEnforced', 'passwordProtected', 'formattingRestricted'],
        ),
        writeProtection: objectSchema(
          {
            enabled: { type: 'boolean' },
            passwordProtected: { type: 'boolean' },
          },
          ['enabled', 'passwordProtected'],
        ),
        readOnlyRecommended: { type: 'boolean' },
      },
      ['editingRestriction', 'writeProtection', 'readOnlyRecommended'],
    ),
  },
  'protection.setEditingRestriction': {
    input: objectSchema(
      {
        mode: { type: 'string', enum: ['readOnly'] },
        formattingRestricted: { type: 'boolean' },
      },
      ['mode'],
    ),
    output: { type: 'object' },
    success: { type: 'object' },
    failure: { type: 'object' },
  },
  'protection.clearEditingRestriction': {
    input: objectSchema({}),
    output: { type: 'object' },
    success: { type: 'object' },
    failure: { type: 'object' },
  },

  // --- permissionRanges.* ---
  'permissionRanges.list': {
    input: refListQuerySchema,
    output: discoveryOutputSchema,
  },
  'permissionRanges.get': {
    input: objectSchema({ id: { type: 'string' } }, ['id']),
    output: { type: 'object' },
  },
  'permissionRanges.create': {
    input: objectSchema(
      {
        target: selectionTargetSchema,
        principal: objectSchema(
          {
            kind: { type: 'string', enum: ['everyone', 'editor'] },
            id: { type: 'string' },
          },
          ['kind'],
        ),
        id: { type: 'string' },
      },
      ['target', 'principal'],
    ),
    output: { type: 'object' },
    success: { type: 'object' },
    failure: { type: 'object' },
  },
  'permissionRanges.remove': {
    input: objectSchema({ id: { type: 'string' } }, ['id']),
    output: { type: 'object' },
    success: { type: 'object' },
    failure: { type: 'object' },
  },
  'permissionRanges.updatePrincipal': {
    input: objectSchema(
      {
        id: { type: 'string' },
        principal: objectSchema(
          {
            kind: { type: 'string', enum: ['everyone', 'editor'] },
            id: { type: 'string' },
          },
          ['kind'],
        ),
      },
      ['id', 'principal'],
    ),
    output: { type: 'object' },
    success: { type: 'object' },
    failure: { type: 'object' },
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
  // Cast is safe — the runtime loops below verify completeness against OPERATION_IDS.
  const operations = { ...operationSchemas } as unknown as Record<OperationId, OperationSchemaSet>;

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
