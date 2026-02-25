/**
 * Step manifest types — public, engine-agnostic metadata for step ops.
 *
 * `StepManifest` is the single source of truth for schema generation,
 * docs, tool catalogs, capabilities, and wrapper generation.
 * It lives in document-api (engine-agnostic) and is consumed by
 * super-editor executor registration at runtime.
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
