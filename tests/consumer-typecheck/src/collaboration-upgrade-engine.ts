import {
  COLLABORATION_UPGRADE_ENGINE_PROTOCOL_VERSION,
  buildV2CollaborationUpgradeArtifactFromBundle,
  getCollaborationUpgradeEngineInfo,
  validateV2CollaborationUpgradeTarget,
  type BuildV2CollaborationUpgradeArtifactFromBundleInput,
  type CompleteV2CollaborationUpgradeArtifact,
  type ValidateV2CollaborationUpgradeTargetInput,
  type V2CollaborationUpgradeTargetValidation,
} from 'superdoc/collaboration-upgrade-engine';

const info = getCollaborationUpgradeEngineInfo();
const protocol: 1 = COLLABORATION_UPGRADE_ENGINE_PROTOCOL_VERSION;
const schemaMajor: number = info.roomSchemaVersion.major;

declare const buildInput: BuildV2CollaborationUpgradeArtifactFromBundleInput;
declare const validateInput: ValidateV2CollaborationUpgradeTargetInput;

const artifact: Promise<CompleteV2CollaborationUpgradeArtifact> =
  buildV2CollaborationUpgradeArtifactFromBundle(buildInput);
const validation: Promise<V2CollaborationUpgradeTargetValidation> = validateV2CollaborationUpgradeTarget(validateInput);

void protocol;
void schemaMajor;
void artifact;
void validation;
