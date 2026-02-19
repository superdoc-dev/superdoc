import type { BlockNodeType, ReceiptFailure, ReceiptInsert, TextAddress } from '../types/index.js';

export type ListItemAddress = {
  kind: 'block';
  nodeType: 'listItem';
  nodeId: string;
};

export type ListWithinAddress = {
  kind: 'block';
  nodeType: BlockNodeType;
  nodeId: string;
};
export type ListKind = 'ordered' | 'bullet';
export type ListInsertPosition = 'before' | 'after';

export const LIST_KINDS = ['ordered', 'bullet'] as const satisfies readonly ListKind[];
export const LIST_INSERT_POSITIONS = ['before', 'after'] as const satisfies readonly ListInsertPosition[];

export interface ListsListQuery {
  within?: ListWithinAddress;
  limit?: number;
  offset?: number;
  kind?: ListKind;
  level?: number;
  ordinal?: number;
}

export interface ListsGetInput {
  address: ListItemAddress;
}

export interface ListItemInfo {
  address: ListItemAddress;
  marker?: string;
  ordinal?: number;
  path?: number[];
  level?: number;
  kind?: ListKind;
  text?: string;
}

export interface ListsListResult {
  matches: ListItemAddress[];
  total: number;
  items: ListItemInfo[];
}

export interface ListInsertInput {
  target: ListItemAddress;
  position: ListInsertPosition;
  text?: string;
}

export interface ListTargetInput {
  target: ListItemAddress;
}

export interface ListSetTypeInput extends ListTargetInput {
  kind: ListKind;
}

export interface ListsInsertSuccessResult {
  success: true;
  item: ListItemAddress;
  insertionPoint: TextAddress;
  trackedChangeRefs?: ReceiptInsert[];
}

export interface ListsMutateItemSuccessResult {
  success: true;
  item: ListItemAddress;
}

export interface ListsExitSuccessResult {
  success: true;
  paragraph: {
    kind: 'block';
    nodeType: 'paragraph';
    nodeId: string;
  };
}

export interface ListsFailureResult {
  success: false;
  failure: ReceiptFailure;
}

export type ListsInsertResult = ListsInsertSuccessResult | ListsFailureResult;
export type ListsMutateItemResult = ListsMutateItemSuccessResult | ListsFailureResult;
export type ListsExitResult = ListsExitSuccessResult | ListsFailureResult;
