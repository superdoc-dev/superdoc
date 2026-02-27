import type { DeletableBlockNodeAddress } from './base.js';

export interface BlocksDeleteInput {
  target: DeletableBlockNodeAddress;
}

export interface BlocksDeleteResult {
  success: true;
  deleted: DeletableBlockNodeAddress;
}
