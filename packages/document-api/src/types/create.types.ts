import type { TextAddress } from './address.js';
import type { BlockNodeAddress } from './base.js';
import type { ReceiptFailure, ReceiptInsert } from './receipt.js';

export type ParagraphCreateLocation =
  | { kind: 'documentStart' }
  | { kind: 'documentEnd' }
  | { kind: 'before'; target: BlockNodeAddress }
  | { kind: 'after'; target: BlockNodeAddress };

export interface CreateParagraphInput {
  at?: ParagraphCreateLocation;
  text?: string;
}

export interface CreateParagraphSuccessResult {
  success: true;
  paragraph: BlockNodeAddress;
  insertionPoint: TextAddress;
  trackedChangeRefs?: ReceiptInsert[];
}

export interface CreateParagraphFailureResult {
  success: false;
  failure: ReceiptFailure;
}

export type CreateParagraphResult = CreateParagraphSuccessResult | CreateParagraphFailureResult;
