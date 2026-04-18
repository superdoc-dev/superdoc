/**
 * Registry for part descriptors.
 *
 * Descriptors are registered explicitly by partId. No pattern-based
 * registration (e.g., "word/header*.xml") in v1.
 */

import type { PartId, PartDescriptor } from '../types.js';

const descriptors = new Map<PartId, PartDescriptor>();

export function registerPartDescriptor<TPart>(descriptor: PartDescriptor<TPart>): void {
  descriptors.set(descriptor.id, descriptor as PartDescriptor);
}

export function getPartDescriptor(partId: PartId): PartDescriptor | undefined {
  return descriptors.get(partId);
}

export function hasPartDescriptor(partId: PartId): boolean {
  return descriptors.has(partId);
}

/** Removes all registered descriptors. Intended for testing only. */
export function clearPartDescriptors(): void {
  descriptors.clear();
}
