import type { LayoutSourceIdentity } from '@superdoc/contracts';
import { DATASET_KEYS, encodeLayoutStoryDataset } from '@superdoc/dom-contract';

/**
 * Stamp the editor-neutral layout-identity dataset (prep-001).
 *
 * Additive only — runs alongside legacy `data-pm-*` / `data-block-id` writes.
 * v1 consumers still read PM-shaped datasets; future editor-neutral consumers
 * read `data-layout-fragment-id` / `data-layout-story` / `data-layout-block-ref`.
 */
export function applyLayoutIdentityDataset(element: HTMLElement, identity: LayoutSourceIdentity | undefined): void {
  if (!identity) {
    delete element.dataset[DATASET_KEYS.LAYOUT_FRAGMENT_ID];
    delete element.dataset[DATASET_KEYS.LAYOUT_BLOCK_REF];
    delete element.dataset[DATASET_KEYS.LAYOUT_STORY];
    return;
  }
  element.dataset[DATASET_KEYS.LAYOUT_FRAGMENT_ID] = identity.fragmentId;
  element.dataset[DATASET_KEYS.LAYOUT_BLOCK_REF] = identity.blockRef;
  element.dataset[DATASET_KEYS.LAYOUT_STORY] = encodeLayoutStoryDataset(identity.story);
}
