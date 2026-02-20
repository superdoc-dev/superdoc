import { CliError } from './errors';
import { isRecord } from './guards';
import type {
  BlockNodeType,
  CreateParagraphInput,
  ListInsertInput,
  ListItemAddress,
  ListKind,
  ListsListQuery,
  ListSetTypeInput,
  ListTargetInput,
  NodeAddress,
  NodeKind,
  NodeType,
  Query,
  TextAddress,
} from './types';
import {
  BLOCK_NODE_TYPES as DOCUMENT_API_BLOCK_NODE_TYPES,
  LIST_INSERT_POSITIONS as DOCUMENT_API_LIST_INSERT_POSITIONS,
  LIST_KINDS as DOCUMENT_API_LIST_KINDS,
  NODE_KINDS as DOCUMENT_API_NODE_KINDS,
  NODE_TYPES as DOCUMENT_API_NODE_TYPES,
} from '@superdoc/document-api';

const NODE_TYPES = new Set<NodeType>(DOCUMENT_API_NODE_TYPES);
const BLOCK_NODE_TYPES = new Set<BlockNodeType>(DOCUMENT_API_BLOCK_NODE_TYPES);
const NODE_KINDS = new Set<NodeKind>(DOCUMENT_API_NODE_KINDS);
const LIST_KINDS = new Set<ListKind>(DOCUMENT_API_LIST_KINDS);
const LIST_INSERT_POSITIONS = new Set<string>(DOCUMENT_API_LIST_INSERT_POSITIONS);

function expectRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new CliError('VALIDATION_ERROR', `${path} must be an object.`);
  }
  return value;
}

function expectString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new CliError('VALIDATION_ERROR', `${path} must be a non-empty string.`);
  }
  return value;
}

function expectNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new CliError('VALIDATION_ERROR', `${path} must be a finite number.`);
  }
  return value;
}

function expectNonNegativeInteger(value: unknown, path: string): number {
  const numberValue = expectNumber(value, path);
  if (!Number.isInteger(numberValue) || numberValue < 0) {
    throw new CliError('VALIDATION_ERROR', `${path} must be a non-negative integer.`);
  }
  return numberValue;
}

function expectOnlyKeys(obj: Record<string, unknown>, allowedKeys: readonly string[], path: string): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      throw new CliError('VALIDATION_ERROR', `${path}.${key} is not allowed.`);
    }
  }
}

function validateNodeType(value: unknown, path: string): NodeType {
  const nodeType = expectString(value, path);
  if (!NODE_TYPES.has(nodeType as NodeType)) {
    throw new CliError('VALIDATION_ERROR', `${path} must be a supported node type.`);
  }
  return nodeType as NodeType;
}

function validateBlockNodeType(value: unknown, path: string): BlockNodeType {
  const nodeType = validateNodeType(value, path);
  if (!BLOCK_NODE_TYPES.has(nodeType as BlockNodeType)) {
    throw new CliError('VALIDATION_ERROR', `${path} must be a supported block node type.`);
  }
  return nodeType as BlockNodeType;
}

function validateRange(value: unknown, path: string): { start: number; end: number } {
  const obj = expectRecord(value, path);
  const start = expectNonNegativeInteger(obj.start, `${path}.start`);
  const end = expectNonNegativeInteger(obj.end, `${path}.end`);
  if (end < start) {
    throw new CliError('VALIDATION_ERROR', `${path}.end must be greater than or equal to ${path}.start.`);
  }
  return { start, end };
}

function validateInlineAnchor(value: unknown, path: string): Extract<NodeAddress, { kind: 'inline' }>['anchor'] {
  const obj = expectRecord(value, path);
  const startObj = expectRecord(obj.start, `${path}.start`);
  const endObj = expectRecord(obj.end, `${path}.end`);

  const startBlockId = expectString(startObj.blockId, `${path}.start.blockId`);
  const endBlockId = expectString(endObj.blockId, `${path}.end.blockId`);
  const startOffset = expectNonNegativeInteger(startObj.offset, `${path}.start.offset`);
  const endOffset = expectNonNegativeInteger(endObj.offset, `${path}.end.offset`);

  if (startBlockId !== endBlockId) {
    throw new CliError('VALIDATION_ERROR', `${path} must not span multiple blocks.`);
  }
  if (endOffset < startOffset) {
    throw new CliError('VALIDATION_ERROR', `${path}.end.offset must be greater than or equal to start.offset.`);
  }

  return {
    start: { blockId: startBlockId, offset: startOffset },
    end: { blockId: endBlockId, offset: endOffset },
  };
}

export function validateNodeAddress(value: unknown, path = 'address'): NodeAddress {
  const obj = expectRecord(value, path);
  const kind = expectString(obj.kind, `${path}.kind`);

  if (kind === 'block') {
    return {
      kind: 'block',
      nodeType: validateBlockNodeType(obj.nodeType, `${path}.nodeType`),
      nodeId: expectString(obj.nodeId, `${path}.nodeId`),
    };
  }

  if (kind === 'inline') {
    return {
      kind: 'inline',
      nodeType: validateNodeType(obj.nodeType, `${path}.nodeType`) as Extract<
        NodeAddress,
        { kind: 'inline' }
      >['nodeType'],
      anchor: validateInlineAnchor(obj.anchor, `${path}.anchor`),
    };
  }

  throw new CliError('VALIDATION_ERROR', `${path}.kind must be one of: block, inline.`);
}

export function validateTextAddress(value: unknown, path = 'target'): TextAddress {
  const obj = expectRecord(value, path);
  const kind = expectString(obj.kind, `${path}.kind`);

  if (kind !== 'text') {
    throw new CliError('VALIDATION_ERROR', `${path}.kind must be "text".`);
  }

  return {
    kind: 'text',
    blockId: expectString(obj.blockId, `${path}.blockId`),
    range: validateRange(obj.range, `${path}.range`),
  };
}

export function validateListItemAddress(value: unknown, path = 'target'): ListItemAddress {
  const address = validateNodeAddress(value, path);
  if (address.kind !== 'block' || address.nodeType !== 'listItem') {
    throw new CliError('VALIDATION_ERROR', `${path} must be a block listItem address.`);
  }
  return address as ListItemAddress;
}

export function validateListsListQuery(value: unknown, path = 'query'): ListsListQuery {
  const obj = expectRecord(value, path);
  const query: ListsListQuery = {};

  if (obj.within != null) {
    const within = validateNodeAddress(obj.within, `${path}.within`);
    if (within.kind !== 'block') {
      throw new CliError('VALIDATION_ERROR', `${path}.within.kind must be "block".`);
    }
    query.within = within;
  }

  if (obj.limit != null) {
    query.limit = expectNonNegativeInteger(obj.limit, `${path}.limit`);
  }

  if (obj.offset != null) {
    query.offset = expectNonNegativeInteger(obj.offset, `${path}.offset`);
  }

  if (obj.kind != null) {
    const kind = expectString(obj.kind, `${path}.kind`);
    if (!LIST_KINDS.has(kind as ListKind)) {
      throw new CliError('VALIDATION_ERROR', `${path}.kind must be "ordered" or "bullet".`);
    }
    query.kind = kind as ListKind;
  }

  if (obj.level != null) {
    query.level = expectNonNegativeInteger(obj.level, `${path}.level`);
  }

  if (obj.ordinal != null) {
    query.ordinal = expectNonNegativeInteger(obj.ordinal, `${path}.ordinal`);
  }

  return query;
}

export function validateListTargetInput(value: unknown, path = 'input'): ListTargetInput {
  const obj = expectRecord(value, path);
  return {
    target: validateListItemAddress(obj.target, `${path}.target`),
  };
}

export function validateListSetTypeInput(value: unknown, path = 'input'): ListSetTypeInput {
  const obj = expectRecord(value, path);
  const kind = expectString(obj.kind, `${path}.kind`);
  if (!LIST_KINDS.has(kind as ListKind)) {
    throw new CliError('VALIDATION_ERROR', `${path}.kind must be "ordered" or "bullet".`);
  }

  return {
    target: validateListItemAddress(obj.target, `${path}.target`),
    kind: kind as ListKind,
  };
}

export function validateListInsertInput(value: unknown, path = 'input'): ListInsertInput {
  const obj = expectRecord(value, path);
  const position = expectString(obj.position, `${path}.position`);
  if (!LIST_INSERT_POSITIONS.has(position)) {
    throw new CliError('VALIDATION_ERROR', `${path}.position must be "before" or "after".`);
  }

  if (obj.text != null && typeof obj.text !== 'string') {
    throw new CliError('VALIDATION_ERROR', `${path}.text must be a string.`);
  }

  return {
    target: validateListItemAddress(obj.target, `${path}.target`),
    position: position as ListInsertInput['position'],
    text: typeof obj.text === 'string' ? obj.text : undefined,
  };
}

function validateCreateParagraphLocation(value: unknown, path: string): NonNullable<CreateParagraphInput['at']> {
  const obj = expectRecord(value, path);
  const kind = expectString(obj.kind, `${path}.kind`);

  if (kind === 'documentStart' || kind === 'documentEnd') {
    return { kind };
  }

  if (kind === 'before' || kind === 'after') {
    const target = validateNodeAddress(obj.target, `${path}.target`);
    if (target.kind !== 'block') {
      throw new CliError('VALIDATION_ERROR', `${path}.target.kind must be "block".`);
    }

    return {
      kind,
      target,
    };
  }

  throw new CliError('VALIDATION_ERROR', `${path}.kind must be one of: documentStart, documentEnd, before, after.`);
}

export function validateCreateParagraphInput(value: unknown, path = 'input'): CreateParagraphInput {
  const obj = expectRecord(value, path);
  const input: CreateParagraphInput = {};

  if (obj.at != null) {
    input.at = validateCreateParagraphLocation(obj.at, `${path}.at`);
  }

  if (obj.text != null) {
    if (typeof obj.text !== 'string') {
      throw new CliError('VALIDATION_ERROR', `${path}.text must be a string.`);
    }
    input.text = obj.text;
  }

  return input;
}

function validateQuerySelect(value: unknown, path: string): Query['select'] {
  const obj = expectRecord(value, path);
  const type = expectString(obj.type, `${path}.type`);

  if (type === 'text') {
    expectOnlyKeys(obj, ['type', 'pattern', 'mode', 'caseSensitive'], path);
    const pattern = expectString(obj.pattern, `${path}.pattern`);
    const modeValue = obj.mode;
    let mode: 'contains' | 'regex' | undefined;
    if (modeValue != null) {
      if (modeValue !== 'contains' && modeValue !== 'regex') {
        throw new CliError('VALIDATION_ERROR', `${path}.mode must be "contains" or "regex".`);
      }
      mode = modeValue;
    }

    if (obj.caseSensitive != null && typeof obj.caseSensitive !== 'boolean') {
      throw new CliError('VALIDATION_ERROR', `${path}.caseSensitive must be a boolean.`);
    }

    return {
      type: 'text',
      pattern,
      mode,
      caseSensitive: typeof obj.caseSensitive === 'boolean' ? obj.caseSensitive : undefined,
    };
  }

  if (type === 'node') {
    expectOnlyKeys(obj, ['type', 'nodeType', 'kind'], path);
    const nodeType = obj.nodeType != null ? validateNodeType(obj.nodeType, `${path}.nodeType`) : undefined;

    if (obj.kind != null && !NODE_KINDS.has(obj.kind as NodeKind)) {
      throw new CliError('VALIDATION_ERROR', `${path}.kind must be "block" or "inline".`);
    }

    return {
      type: 'node',
      nodeType,
      kind: obj.kind as NodeKind | undefined,
    };
  }

  if (!NODE_TYPES.has(type as NodeType)) {
    throw new CliError('VALIDATION_ERROR', `${path}.type must be a supported selector type.`);
  }

  expectOnlyKeys(obj, ['type'], path);

  return {
    type: 'node',
    nodeType: type as NodeType,
  };
}

export function validateQuery(value: unknown, path = 'query'): Query {
  const obj = expectRecord(value, path);
  expectOnlyKeys(obj, ['select', 'within', 'limit', 'offset', 'includeNodes', 'includeUnknown'], path);

  const query: Query = {
    select: validateQuerySelect(obj.select, `${path}.select`),
  };

  if (obj.within != null) {
    query.within = validateNodeAddress(obj.within, `${path}.within`);
  }

  if (obj.limit != null) {
    query.limit = expectNonNegativeInteger(obj.limit, `${path}.limit`);
  }

  if (obj.offset != null) {
    query.offset = expectNonNegativeInteger(obj.offset, `${path}.offset`);
  }

  if (obj.includeNodes != null) {
    if (typeof obj.includeNodes !== 'boolean') {
      throw new CliError('VALIDATION_ERROR', `${path}.includeNodes must be a boolean.`);
    }
    query.includeNodes = obj.includeNodes;
  }

  if (obj.includeUnknown != null) {
    if (typeof obj.includeUnknown !== 'boolean') {
      throw new CliError('VALIDATION_ERROR', `${path}.includeUnknown must be a boolean.`);
    }
    query.includeUnknown = obj.includeUnknown;
  }

  return query;
}

export function validateNodeKind(value: string, path: string): NodeKind {
  if (!NODE_KINDS.has(value as NodeKind)) {
    throw new CliError('VALIDATION_ERROR', `${path} must be "block" or "inline".`);
  }
  return value as NodeKind;
}

export function isNodeType(value: string): value is NodeType {
  return NODE_TYPES.has(value as NodeType);
}

export function isBlockNodeType(value: string): value is BlockNodeType {
  return BLOCK_NODE_TYPES.has(value as BlockNodeType);
}
