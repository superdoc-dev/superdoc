/**
 * Maps partChanged events to UI/runtime invalidation effects.
 *
 * Rules:
 *   1. Mutation core emits `partChanged`.
 *   2. Invalidation layer subscribes and applies part-specific cache refreshes/rerenders.
 *   3. No invalidation logic in transport adapters or command helpers.
 */

import type { Editor } from '../../Editor.js';
import type { PartId, PartChangedEvent } from '../types.js';

type InvalidationHandler = (editor: Editor, event: PartChangedEvent) => void;

const handlers = new Map<PartId, InvalidationHandler>();

export function registerInvalidationHandler(partId: PartId, handler: InvalidationHandler): void {
  handlers.set(partId, handler);
}

export function removeInvalidationHandler(partId: PartId): void {
  handlers.delete(partId);
}

/**
 * Runs all registered invalidation handlers for the affected parts.
 * Called once per mutateParts transaction, after event emission.
 */
export function applyPartInvalidation(editor: Editor, event: PartChangedEvent): void {
  const invokedHandlers = new Set<InvalidationHandler>();

  for (const part of event.parts) {
    const handler = handlers.get(part.partId);
    if (handler && !invokedHandlers.has(handler)) {
      invokedHandlers.add(handler);
      try {
        handler(editor, event);
      } catch (err) {
        console.error(`[parts] Invalidation handler failed for "${part.partId}":`, err);
      }
    }
  }
}

/** Removes all registered handlers. Intended for testing only. */
export function clearInvalidationHandlers(): void {
  handlers.clear();
}
