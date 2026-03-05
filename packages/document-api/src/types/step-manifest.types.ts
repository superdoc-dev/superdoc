/**
 * Step manifest types — public, engine-agnostic metadata for step ops.
 *
 * These types describe a rich manifest model for mutation step operations.
 * The current catalog used by docs and capabilities lives in
 * `contract/step-op-catalog.ts`; this type remains available for future
 * expansion to schema-level per-step metadata.
 */

export interface IdentityStrategy {
  refType: string;
  stableAcrossUndoRedo: boolean;
  stableAcrossConcurrentEdits: boolean;
  usableInWhere: boolean;
}

export interface StepCapabilities {
  idempotency: 'idempotent' | 'non-idempotent';
  supportsDryRun: boolean;
  supportsTrackedMode: boolean;
  possibleFailureCodes: string[];
  deterministicTargetResolution: boolean;
  identityStrategy: IdentityStrategy;
}

export interface StepManifest {
  opId: string;
  domain: string;
  argsSchema: Record<string, unknown>;
  outcomeSchema: Record<string, unknown>;
  capabilities: StepCapabilities;
  compatibleDomains?: string[];
}
