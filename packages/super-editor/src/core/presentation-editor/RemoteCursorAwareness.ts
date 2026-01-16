import type { EditorState } from 'prosemirror-state';
import { relativePositionToAbsolutePosition, ySyncPluginKey } from 'y-prosemirror';
import * as Y from 'yjs';

import { getFallbackCursorColor } from './RemoteCursorColors.js';
import type { RemoteCursorState } from './PresentationEditor.js';

/**
 * Minimal interface for Yjs awareness object.
 */
type AwarenessLike = {
  clientID?: number;
  getStates?: () => Map<number, unknown>;
};

/**
 * Minimal interface for collaboration provider with awareness.
 */
type CollaborationProviderLike = {
  awareness?: AwarenessLike | null;
} | null;

/**
 * Normalizes Yjs awareness states into typed RemoteCursorState objects.
 *
 * Converts relative Yjs positions to absolute ProseMirror positions, validates and clamps
 * positions to document bounds, assigns fallback colors, and manages stale state cleanup.
 * Preserves timestamps for unchanged cursor positions to enable stable sorting and limit
 * enforcement without flickering.
 *
 * @param options - Configuration object
 * @param options.provider - Collaboration provider with awareness capability
 * @param options.editorState - Current ProseMirror editor state
 * @param options.previousState - Previous cursor states for timestamp preservation
 * @param options.fallbackColors - Array of fallback colors for users without custom colors
 * @param options.staleTimeoutMs - Milliseconds after which inactive cursor states are removed
 * @returns Map of client IDs to normalized remote cursor states
 *
 * @remarks
 * - Skips the local client (matching awareness.clientID)
 * - Skips states without cursor data or failed position conversions
 * - Clamps positions to valid document range [0, docSize]
 * - Preserves updatedAt timestamp if cursor position hasn't changed
 * - Removes stale entries (inactive beyond staleTimeoutMs) from previousState map
 * - Returns empty map if provider, awareness, editorState, or ySync plugin is unavailable
 */
export function normalizeAwarenessStates(options: {
  provider: CollaborationProviderLike;
  editorState: EditorState | null;
  previousState: Map<number, RemoteCursorState>;
  fallbackColors: readonly string[];
  staleTimeoutMs: number;
}): Map<number, RemoteCursorState> {
  const provider = options.provider;
  if (!provider?.awareness) return new Map();

  const editorState = options.editorState;
  if (!editorState) return new Map();

  const ystate = ySyncPluginKey.getState(editorState);
  if (!ystate) return new Map(); // No ySync plugin

  const states = provider.awareness?.getStates?.();
  const normalized = new Map<number, RemoteCursorState>();

  states?.forEach((aw, clientId) => {
    // Skip local client
    if (clientId === provider.awareness?.clientID) return;

    // Type assertion for awareness state properties
    const awState = aw as {
      cursor?: { anchor: unknown; head: unknown };
      user?: { name?: string; email?: string; color?: string };
    };

    // Skip states without cursor data
    if (!awState.cursor) return;

    try {
      // Convert relative positions to absolute PM positions
      const anchor = relativePositionToAbsolutePosition(
        ystate.doc,
        ystate.type,
        Y.createRelativePositionFromJSON(awState.cursor.anchor),
        ystate.binding.mapping,
      );

      const head = relativePositionToAbsolutePosition(
        ystate.doc,
        ystate.type,
        Y.createRelativePositionFromJSON(awState.cursor.head),
        ystate.binding.mapping,
      );

      // Skip if conversion failed
      if (anchor === null || head === null) return;

      // Clamp to valid document range
      const docSize = editorState.doc.content.size;
      const clampedAnchor = Math.max(0, Math.min(anchor, docSize));
      const clampedHead = Math.max(0, Math.min(head, docSize));

      // Preserve timestamp if cursor position unchanged for stable recency-based sorting
      // This ensures maxVisible limit doesn't flicker when collaborators are idle
      const previousState = options.previousState.get(clientId);
      const positionChanged =
        !previousState || previousState.anchor !== clampedAnchor || previousState.head !== clampedHead;

      normalized.set(clientId, {
        clientId,
        user: {
          name: awState.user?.name,
          email: awState.user?.email,
          color: awState.user?.color || getFallbackCursorColor(clientId, options.fallbackColors),
        },
        anchor: clampedAnchor,
        head: clampedHead,
        updatedAt: positionChanged ? Date.now() : (previousState?.updatedAt ?? Date.now()),
      });
    } catch (error) {
      console.warn(`Failed to normalize cursor for client ${clientId}:`, error);
    }
  });

  // Memory management - clean up stale entries using configurable timeout
  // Prevents unbounded map growth in long-running sessions with many transient collaborators
  const staleThreshold = Date.now() - options.staleTimeoutMs;
  const staleClients: number[] = [];

  options.previousState.forEach((cursor, clientId) => {
    if (cursor.updatedAt < staleThreshold && !normalized.has(clientId)) {
      staleClients.push(clientId);
    }
  });

  staleClients.forEach((clientId) => {
    options.previousState.delete(clientId);
  });

  return normalized;
}
