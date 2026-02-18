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

export type HeadingCreateLocation = ParagraphCreateLocation;

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface CreateHeadingInput {
  level: HeadingLevel;
  at?: HeadingCreateLocation;
  text?: string;
}

export interface CreateHeadingSuccessResult {
  success: true;
  heading: BlockNodeAddress;
  insertionPoint: TextAddress;
  trackedChangeRefs?: ReceiptInsert[];
}

export interface CreateHeadingFailureResult {
  success: false;
  failure: ReceiptFailure;
}

export type CreateHeadingResult = CreateHeadingSuccessResult | CreateHeadingFailureResult;
