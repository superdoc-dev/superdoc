/**
 * SuperDoc public facade: `superdoc/collaboration-upgrade-engine`.
 *
 * This is a Node-only bridge used by the public v2 collaboration upgrade package.
 * It deliberately exposes data-only inputs and outputs: no live Y.Doc, editor,
 * provider, browser, UI, or private workspace type crosses this boundary.
 */

import {
  buildV2CollaborationUpgradeArtifactFromBundle as buildPrivateV2CollaborationUpgradeArtifactFromBundle,
  getCollaborationUpgradeEngineInfo as getPrivateCollaborationUpgradeEngineInfo,
  validateV2CollaborationUpgradeTarget as validatePrivateV2CollaborationUpgradeTarget,
} from '@superdoc/docx-engine/collaboration-upgrade-engine';

declare const __APP_VERSION__: string;

/** Compatibility protocol between the upgrade package and installed SuperDoc. */
export const COLLABORATION_UPGRADE_ENGINE_PROTOCOL_VERSION = 1 as const;

/** Recovery-bundle versions accepted by this engine. */
export const SUPPORTED_COLLABORATION_UPGRADE_BUNDLE_VERSIONS = Object.freeze([1] as const);

/** Frozen final-v1 reader contracts accepted by this engine. */
export const SUPPORTED_V1_READER_CONTRACT_VERSIONS = Object.freeze([1] as const);

/** Minimum supported Node.js major version. */
export const COLLABORATION_UPGRADE_ENGINE_MINIMUM_NODE_MAJOR = 20 as const;

/** Runtime compatibility metadata checked before any provider I/O. */
export interface CollaborationUpgradeEngineInfo {
  readonly engine: 'superdoc-v2-collaboration-upgrade';
  readonly protocolVersion: typeof COLLABORATION_UPGRADE_ENGINE_PROTOCOL_VERSION;
  readonly superdocVersion: string;
  readonly roomSchemaVersion: Readonly<{
    readonly major: number;
    readonly minor: number;
  }>;
  readonly artifactVersion: 1;
  readonly supportedBundleVersions: readonly [1];
  readonly supportedV1ReaderContractVersions: readonly [1];
  readonly minimumNodeMajor: typeof COLLABORATION_UPGRADE_ENGINE_MINIMUM_NODE_MAJOR;
}

/** Limits applied while inspecting a recovery bundle. */
export interface UpgradeBundleLimits {
  readonly maxBundleBytes?: number;
  readonly maxEntryCount?: number;
  readonly maxEntryBytes?: number;
  readonly maxTotalUncompressedBytes?: number;
  readonly maxCompressionRatio?: number;
  readonly maxManifestBytes?: number;
}

/** Limits applied while building a self-contained v2 update. */
export interface V2UpgradeArtifactLimits {
  readonly maxCarrierDocxBytes?: number;
  readonly maxEncodedUpdateBytes?: number;
  readonly maxContentUnits?: number;
}

/** Package-fidelity comparison produced by a fresh v2 reopen. */
export interface V2UpgradePackageComparison {
  readonly equal: boolean;
  readonly expectedPartCount: number;
  readonly actualPartCount: number;
  readonly missingParts: ReadonlyArray<string>;
  readonly unexpectedParts: ReadonlyArray<string>;
  readonly changedParts: ReadonlyArray<string>;
  readonly semanticChangedParts: ReadonlyArray<string>;
  readonly protectedChangedParts: ReadonlyArray<string>;
}

/** Offline proof generated together with a v2 target update. */
export interface V2UpgradeOfflineValidation {
  readonly ok: true;
  readonly binaryMode: 'inline';
  readonly classification: 'v2-committed';
  readonly contentDigest: string;
  readonly contentUnitCount: number;
  readonly rebuiltUpdateSha256: string;
  readonly builderExportSha256: string;
  readonly freshExportSha256: string;
  readonly carrierToFreshPackage: V2UpgradePackageComparison;
  readonly builderToFreshPackage: V2UpgradePackageComparison;
}

/** Complete provider-free v2 target produced from a validated recovery bundle. */
export interface CompleteV2CollaborationUpgradeArtifact {
  readonly schemaVersion: 1;
  readonly migrationId: string;
  readonly targetRootId: string;
  readonly providerRoomName: string;
  readonly sourceCarrierSha256: string;
  readonly normalizedCarrierSha256: string;
  readonly updateSha256: string;
  readonly updateByteLength: number;
  /** A defensive copy is returned by the underlying artifact. */
  readonly update: Uint8Array;
  readonly contentDigest: string;
  readonly contentUnitIds: ReadonlyArray<string>;
  readonly validation: V2UpgradeOfflineValidation;
}

/** Input for constructing a self-contained v2 target from a v1 recovery bundle. */
export interface BuildV2CollaborationUpgradeArtifactFromBundleInput {
  readonly bundle: Uint8Array;
  readonly expectedBundleSha256?: string;
  readonly targetRootId: string;
  readonly migrationToolVersion: string;
  readonly filename?: string | null;
  readonly bundleLimits?: UpgradeBundleLimits;
  readonly artifactLimits?: V2UpgradeArtifactLimits;
}

/** Input for validating target bytes read back through a fresh provider client. */
export interface ValidateV2CollaborationUpgradeTargetInput {
  readonly bundle: Uint8Array;
  readonly expectedBundleSha256?: string;
  readonly bundleLimits?: UpgradeBundleLimits;
  readonly update: Uint8Array;
  readonly targetRootId: string;
  readonly expectedUpdateSha256: string;
  readonly expectedContentDigest: string;
  readonly migrationToolVersion: string;
  /** Optional unrelated DOCX shell proving the update is self-contained. */
  readonly reopenBuffer?: Uint8Array;
}

/** Fresh-client validation result for bytes read back from target persistence. */
export interface V2CollaborationUpgradeTargetValidation {
  readonly ok: true;
  readonly updateSha256: string;
  readonly contentDigest: string;
  readonly freshExportSha256: string;
  readonly carrierToFreshPackage: V2UpgradePackageComparison;
}

const PRIVATE_ENGINE_INFO = getPrivateCollaborationUpgradeEngineInfo();
const ENGINE_INFO: CollaborationUpgradeEngineInfo = Object.freeze({
  ...PRIVATE_ENGINE_INFO,
  superdocVersion: __APP_VERSION__,
  roomSchemaVersion: Object.freeze({ ...PRIVATE_ENGINE_INFO.roomSchemaVersion }),
  supportedBundleVersions: SUPPORTED_COLLABORATION_UPGRADE_BUNDLE_VERSIONS,
  supportedV1ReaderContractVersions: SUPPORTED_V1_READER_CONTRACT_VERSIONS,
});

/** Return immutable metadata used to reject incompatible engines preflight. */
export function getCollaborationUpgradeEngineInfo(): CollaborationUpgradeEngineInfo {
  return ENGINE_INFO;
}

/**
 * Build and offline-validate one self-contained v2 collaboration update.
 *
 * This function performs no provider I/O and never mutates the v1 source room.
 */
export async function buildV2CollaborationUpgradeArtifactFromBundle(
  input: BuildV2CollaborationUpgradeArtifactFromBundleInput,
): Promise<CompleteV2CollaborationUpgradeArtifact> {
  assertSupportedNodeRuntime();
  return buildPrivateV2CollaborationUpgradeArtifactFromBundle(input);
}

/**
 * Validate target bytes after a provider reads them through a fresh client.
 *
 * Provenance and carrier bytes are derived from the authenticated recovery
 * bundle rather than accepted as independent caller assertions.
 */
export async function validateV2CollaborationUpgradeTarget(
  input: ValidateV2CollaborationUpgradeTargetInput,
): Promise<V2CollaborationUpgradeTargetValidation> {
  assertSupportedNodeRuntime();
  return validatePrivateV2CollaborationUpgradeTarget(input);
}

function assertSupportedNodeRuntime(): void {
  const processValue = (
    globalThis as {
      readonly process?: { readonly versions?: { readonly node?: string } };
    }
  ).process;
  const nodeVersion = processValue?.versions?.node;
  const nodeMajor = nodeVersion ? Number.parseInt(nodeVersion.split('.')[0] ?? '', 10) : Number.NaN;
  if (!Number.isInteger(nodeMajor) || nodeMajor < COLLABORATION_UPGRADE_ENGINE_MINIMUM_NODE_MAJOR) {
    throw new Error(
      `superdoc/collaboration-upgrade-engine requires Node.js ${COLLABORATION_UPGRADE_ENGINE_MINIMUM_NODE_MAJOR} or newer`,
    );
  }
}
