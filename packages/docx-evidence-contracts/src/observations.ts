import type {
  ArtifactRef,
  DocumentIdentity,
  FragmentIdentity,
  RenderSubjectIdentity,
  SourceAnchor,
} from './identity.js';
import type {
  ClusterStatus,
  ComparisonCategory,
  EvidenceLevel,
  EvidenceStrength,
  ObservationMechanism,
  SignatureConfidence,
} from './vocabulary.js';

export type ObservationMetricValue = number | string | boolean | null;

export interface ClusterInstanceRecord {
  observationId: string;
  signatureId: string;
  documentPath: string;
  sourcePath?: string;
  sourceOccurrenceId?: string;
  sourceNodeIds?: string[];
  schemaQNames?: string[];
  pageNumbers?: number[];
  jsonPath?: string;
  normalizedPath?: string;
  pathKind?: string;
  summary: string;
}

export interface ComparisonObservation {
  observationId: string;
  schemaVersion: number;
  evidenceLevel: EvidenceLevel;
  evidenceStrength: EvidenceStrength;
  mechanism: ObservationMechanism;
  category: ComparisonCategory;
  sourceDocument: DocumentIdentity;
  sourcePath?: string;
  sourceOccurrenceId?: string;
  sourceAnchors?: SourceAnchor[];
  fragmentIdentity?: FragmentIdentity;
  renderSubjects?: RenderSubjectIdentity[];
  pageNumbers?: number[];
  jsonPath?: string;
  normalizedPath?: string;
  pathKind?: string;
  diffKind?: string;
  deltaBucket?: string;
  rawDiffCount?: number;
  summary: string;
  metrics?: Record<string, ObservationMetricValue>;
  artifactRefs: ArtifactRef[];
}

export interface SignatureRecord {
  signatureId: string;
  signatureVersion: string;
  familyId: string;
  observationIds: string[];
  category: ComparisonObservation['category'];
  mechanism: ComparisonObservation['mechanism'];
  normalizedKey: string;
  familyKey?: string;
  pathKind?: string;
  normalizedPath?: string;
  diffKind?: string;
  deltaBucket?: string;
  instanceCount?: number;
  documentCount?: number;
  pageCount?: number;
  exampleObservationId?: string;
  confidence: SignatureConfidence;
}

export interface ClusterRecord {
  clusterId: string;
  signatureIds: string[];
  title: string;
  instanceCount: number;
  documentCount: number;
  pageCount: number;
  representativeObservationIds: string[];
  evidenceStrength: EvidenceStrength;
  status: ClusterStatus;
  category?: ComparisonObservation['category'];
  mechanism?: ComparisonObservation['mechanism'];
  pathKind?: string;
  allObservationIds?: string[];
  allInstances?: ClusterInstanceRecord[];
  knownLimitations?: string[];
  stableJoinKeys?: string[];
  highConfidence?: boolean;
}
