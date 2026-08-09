import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { version as packageVersion } from '../../package.json';

const privateEngine = vi.hoisted(() => ({
  build: vi.fn(),
  validate: vi.fn(),
  getInfo: vi.fn(() =>
    Object.freeze({
      engine: 'superdoc-v2-collaboration-upgrade' as const,
      protocolVersion: 1 as const,
      superdocVersion: '2.0.0-beta.21',
      roomSchemaVersion: Object.freeze({ major: 2, minor: 0 }),
      artifactVersion: 1 as const,
      supportedBundleVersions: Object.freeze([1] as const),
      supportedV1ReaderContractVersions: Object.freeze([1] as const),
      minimumNodeMajor: 20 as const,
    }),
  ),
}));

vi.mock('@superdoc/docx-engine/collaboration-upgrade-engine', () => ({
  buildV2CollaborationUpgradeArtifactFromBundle: privateEngine.build,
  getCollaborationUpgradeEngineInfo: privateEngine.getInfo,
  validateV2CollaborationUpgradeTarget: privateEngine.validate,
}));

import {
  COLLABORATION_UPGRADE_ENGINE_MINIMUM_NODE_MAJOR,
  COLLABORATION_UPGRADE_ENGINE_PROTOCOL_VERSION,
  buildV2CollaborationUpgradeArtifactFromBundle,
  getCollaborationUpgradeEngineInfo,
  validateV2CollaborationUpgradeTarget,
  type CompleteV2CollaborationUpgradeArtifact,
  type V2CollaborationUpgradeTargetValidation,
} from './collaboration-upgrade-engine.js';

const packageComparison = Object.freeze({
  equal: true,
  expectedPartCount: 1,
  actualPartCount: 1,
  missingParts: Object.freeze([]),
  unexpectedParts: Object.freeze([]),
  changedParts: Object.freeze([]),
  semanticChangedParts: Object.freeze([]),
  protectedChangedParts: Object.freeze([]),
});

describe('collaboration-upgrade engine public facade', () => {
  beforeEach(() => {
    privateEngine.build.mockReset();
    privateEngine.validate.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('publishes immutable compatibility metadata for fail-closed preflight', () => {
    const info = getCollaborationUpgradeEngineInfo();

    expect(info).toEqual({
      engine: 'superdoc-v2-collaboration-upgrade',
      protocolVersion: 1,
      superdocVersion: packageVersion,
      roomSchemaVersion: { major: 2, minor: 0 },
      artifactVersion: 1,
      supportedBundleVersions: [1],
      supportedV1ReaderContractVersions: [1],
      minimumNodeMajor: 20,
    });
    expect(info.protocolVersion).toBe(COLLABORATION_UPGRADE_ENGINE_PROTOCOL_VERSION);
    expect(info.minimumNodeMajor).toBe(COLLABORATION_UPGRADE_ENGINE_MINIMUM_NODE_MAJOR);
    expect(Object.isFrozen(info)).toBe(true);
    expect(Object.isFrozen(info.roomSchemaVersion)).toBe(true);
    expect(Object.isFrozen(info.supportedBundleVersions)).toBe(true);
  });

  it('delegates provider-free target construction without changing its bytes', async () => {
    const input = {
      bundle: new Uint8Array([1, 2, 3]),
      expectedBundleSha256: 'a'.repeat(64),
      targetRootId: 'target-root',
      migrationToolVersion: 'upgrade-test',
    };
    const artifact = {
      schemaVersion: 1,
      migrationId: 'migration-1',
      targetRootId: 'target-root',
      providerRoomName: 'sd2/v2.1/target-root',
      sourceCarrierSha256: 'b'.repeat(64),
      normalizedCarrierSha256: 'c'.repeat(64),
      updateSha256: 'd'.repeat(64),
      updateByteLength: 3,
      update: new Uint8Array([4, 5, 6]),
      contentDigest: 'e'.repeat(64),
      contentUnitIds: Object.freeze(['main']),
      validation: {
        ok: true,
        binaryMode: 'inline',
        classification: 'v2-committed',
        contentDigest: 'e'.repeat(64),
        contentUnitCount: 1,
        rebuiltUpdateSha256: 'd'.repeat(64),
        builderExportSha256: 'f'.repeat(64),
        freshExportSha256: '1'.repeat(64),
        carrierToFreshPackage: packageComparison,
        builderToFreshPackage: packageComparison,
      },
    } satisfies CompleteV2CollaborationUpgradeArtifact;
    privateEngine.build.mockResolvedValue(artifact);

    await expect(buildV2CollaborationUpgradeArtifactFromBundle(input)).resolves.toBe(artifact);
    expect(privateEngine.build).toHaveBeenCalledWith(input);
  });

  it('rejects an unsupported runtime before invoking the private builder', async () => {
    vi.stubGlobal('process', { versions: { node: '19.9.0' } });

    await expect(
      buildV2CollaborationUpgradeArtifactFromBundle({
        bundle: new Uint8Array([1]),
        targetRootId: 'target-root',
        migrationToolVersion: 'upgrade-test',
      }),
    ).rejects.toThrow('requires Node.js 20 or newer');
    expect(privateEngine.build).not.toHaveBeenCalled();
  });

  it('delegates target validation to the installed v2 build input', async () => {
    const bundle = new Uint8Array([7, 8]);
    const update = new Uint8Array([9, 10]);
    const validation = {
      ok: true,
      updateSha256: 'd'.repeat(64),
      contentDigest: 'e'.repeat(64),
      freshExportSha256: 'f'.repeat(64),
      carrierToFreshPackage: packageComparison,
    } satisfies V2CollaborationUpgradeTargetValidation;
    privateEngine.validate.mockResolvedValue(validation);

    const input = {
      bundle,
      expectedBundleSha256: 'a'.repeat(64),
      bundleLimits: { maxBundleBytes: 1024 },
      update,
      targetRootId: 'target-root',
      expectedUpdateSha256: 'd'.repeat(64),
      expectedContentDigest: 'e'.repeat(64),
      migrationToolVersion: 'upgrade-test',
    };
    const result = await validateV2CollaborationUpgradeTarget(input);

    expect(result).toBe(validation);
    expect(privateEngine.validate).toHaveBeenCalledWith(input);
  });
});
