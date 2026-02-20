import type { OperationId } from '../contract/types.js';

export const CAPABILITY_REASON_CODES = [
  'COMMAND_UNAVAILABLE',
  'OPERATION_UNAVAILABLE',
  'TRACKED_MODE_UNAVAILABLE',
  'DRY_RUN_UNAVAILABLE',
  'NAMESPACE_UNAVAILABLE',
] as const;

export type CapabilityReasonCode = (typeof CAPABILITY_REASON_CODES)[number];

/**
 * A boolean flag indicating whether a capability is active, with optional
 * machine-readable reason codes explaining why it is disabled.
 */
export type CapabilityFlag = {
  enabled: boolean;
  reasons?: CapabilityReasonCode[];
};

/** Per-operation runtime capability describing availability, tracked-mode, and dry-run support. */
export interface OperationRuntimeCapability {
  available: boolean;
  tracked: boolean;
  dryRun: boolean;
  reasons?: CapabilityReasonCode[];
}

export type OperationCapabilities = Record<OperationId, OperationRuntimeCapability>;

/**
 * Complete runtime capability snapshot for a Document API editor instance.
 *
 * `global` contains namespace-level flags (track changes, comments, lists, dry-run).
 * `operations` contains per-operation availability details keyed by {@link OperationId}.
 */
export interface DocumentApiCapabilities {
  global: {
    trackChanges: CapabilityFlag;
    comments: CapabilityFlag;
    lists: CapabilityFlag;
    dryRun: CapabilityFlag;
  };
  operations: OperationCapabilities;
}

/** Engine-specific adapter that resolves runtime capabilities for the current editor instance. */
export interface CapabilitiesAdapter {
  get(): DocumentApiCapabilities;
}

/**
 * Delegates to the capabilities adapter to retrieve the current capability snapshot.
 *
 * @param adapter - The engine-specific capabilities adapter.
 * @returns The resolved capabilities for this editor instance.
 */
export function executeCapabilities(adapter: CapabilitiesAdapter): DocumentApiCapabilities {
  return adapter.get();
}
