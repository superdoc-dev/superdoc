import type {
  EvidenceLevel,
  ObservationMechanism,
  RenderSubjectRole,
  SourceConfidence,
  StoryKind,
} from './vocabulary.js';

export interface ArtifactRef {
  bucket?: string;
  key?: string;
  path?: string;
  sha256?: string;
}

export interface SourceRef {
  partUri: string;
  xpathLikePath: string;
  line?: number;
  column?: number;
  rawFactId?: string;
  occurrenceId?: string;
}

export interface DocumentIdentity {
  sourceKey?: string;
  sourceRelativePath?: string;
  originalSha256: string;
  normalizedSha256?: string;
  sourceDocRev?: string;
  documentRunId?: string;
}

export interface NormalizedSourceIdentity {
  sourceDocument: DocumentIdentity;
  normalizedSha256: string;
  normalizationRunId?: string;
  normalizationKind?: 'superdoc-cleanup' | 'ooxml-canonicalization' | 'fragment-derivation' | 'other';
}

export interface FragmentIdentity {
  parentDocument: DocumentIdentity;
  fragmentRunId: string;
  fragmentPath: string;
  fragmentSha256: string;
  storyKind: StoryKind;
  parentSourceRef?: SourceRef;
  reliabilityRef?: ArtifactRef;
}

export interface RenderSubjectIdentity {
  role: RenderSubjectRole;
  rendererId: string;
  rendererVersion?: string;
  runtimeId?: string;
  platform?: string;
  superdocVersion?: string;
  superdocCommit?: string;
}

export interface RenderSubject extends RenderSubjectIdentity {
  subjectId: string;
  evidenceLevel: EvidenceLevel;
  artifactRefs: ArtifactRef[];
}

export interface RunIdentity {
  runId: string;
  documentRunId?: string;
  sourceDocument?: DocumentIdentity;
  owner?: string;
  stage?: string;
  startedAt?: string;
  parentRunId?: string;
}

export interface ArtifactSetIdentity {
  artifactSetId: string;
  artifactKind: string;
  run: RunIdentity;
  rootRef: ArtifactRef;
  generatedAt?: string;
}

export interface SchemaQNameEvidence {
  qName: string;
  namespaceUri?: string;
  prefix?: string;
  localName?: string;
  ownerElementQName?: string;
  schemaSource?: string;
  provenance?: string;
  classification?: 'strict' | 'transitional' | 'microsoft-extension' | 'w3c' | 'opc' | 'unknown';
}

export interface SourceAnchor {
  sourceNodeId?: string;
  occurrenceId?: string;
  rawFactIds?: string[];
  schemaQNames?: SchemaQNameEvidence[];
  featureKey?: string;
  conceptKey?: string;
  sourceRef?: SourceRef;
  anchorConfidence?: SourceConfidence;
  pmNodeId?: string;
  pmRange?: {
    from: number;
    to: number;
  };
  flowBlockId?: string;
  layoutFragmentId?: string;
  paintItemId?: string;
}

export interface WeakObservationIdentity {
  observationId: string;
  sourceDocument: DocumentIdentity;
  evidenceLevel: EvidenceLevel;
  mechanism: ObservationMechanism;
  sourcePath?: string;
  pageNumbers?: number[];
  jsonPath?: string;
}
