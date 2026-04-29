import { z } from 'zod';
import {
  CLUSTER_STATUSES,
  COMPARISON_CATEGORIES,
  EVIDENCE_LEVELS,
  EVIDENCE_STRENGTHS,
  OBSERVATION_MECHANISMS,
  RENDER_SUBJECT_ROLES,
  SIGNATURE_CONFIDENCE_LEVELS,
  SOURCE_CONFIDENCE_LEVELS,
  STORY_KINDS,
} from './vocabulary.js';
import type {
  ArtifactRef,
  ArtifactSetIdentity,
  DocumentIdentity,
  FragmentIdentity,
  NormalizedSourceIdentity,
  RenderSubject,
  RenderSubjectIdentity,
  RunIdentity,
  SchemaQNameEvidence,
  SourceAnchor,
  SourceRef,
  WeakObservationIdentity,
} from './identity.js';
import type { ClusterRecord, ComparisonObservation, SignatureRecord } from './observations.js';

const nonEmptyString = z.string().min(1);

export const artifactRefSchema: z.ZodType<ArtifactRef> = z
  .object({
    bucket: nonEmptyString.optional(),
    key: nonEmptyString.optional(),
    path: nonEmptyString.optional(),
    sha256: nonEmptyString.optional(),
  })
  .strict()
  .refine((value) => Boolean(value.bucket || value.key || value.path || value.sha256), {
    message: 'ArtifactRef requires at least one locator or sha256 field.',
  });

export const sourceRefSchema: z.ZodType<SourceRef> = z
  .object({
    partUri: nonEmptyString,
    xpathLikePath: nonEmptyString,
    line: z.number().int().positive().optional(),
    column: z.number().int().nonnegative().optional(),
    rawFactId: nonEmptyString.optional(),
    occurrenceId: nonEmptyString.optional(),
  })
  .strict();

export const documentIdentitySchema: z.ZodType<DocumentIdentity> = z
  .object({
    sourceKey: nonEmptyString.optional(),
    sourceRelativePath: nonEmptyString.optional(),
    originalSha256: nonEmptyString,
    normalizedSha256: nonEmptyString.optional(),
    sourceDocRev: nonEmptyString.optional(),
    documentRunId: nonEmptyString.optional(),
  })
  .strict();

export const normalizedSourceIdentitySchema: z.ZodType<NormalizedSourceIdentity> = z
  .object({
    sourceDocument: documentIdentitySchema,
    normalizedSha256: nonEmptyString,
    normalizationRunId: nonEmptyString.optional(),
    normalizationKind: z
      .enum(['superdoc-cleanup', 'ooxml-canonicalization', 'fragment-derivation', 'other'])
      .optional(),
  })
  .strict();

export const fragmentIdentitySchema: z.ZodType<FragmentIdentity> = z
  .object({
    parentDocument: documentIdentitySchema,
    fragmentRunId: nonEmptyString,
    fragmentPath: nonEmptyString,
    fragmentSha256: nonEmptyString,
    storyKind: z.enum(STORY_KINDS),
    parentSourceRef: sourceRefSchema.optional(),
    reliabilityRef: artifactRefSchema.optional(),
  })
  .strict();

const renderSubjectIdentityObjectSchema = z
  .object({
    role: z.enum(RENDER_SUBJECT_ROLES),
    rendererId: nonEmptyString,
    rendererVersion: nonEmptyString.optional(),
    runtimeId: nonEmptyString.optional(),
    platform: nonEmptyString.optional(),
    superdocVersion: nonEmptyString.optional(),
    superdocCommit: nonEmptyString.optional(),
  })
  .strict();

export const renderSubjectIdentitySchema: z.ZodType<RenderSubjectIdentity> = renderSubjectIdentityObjectSchema;

export const renderSubjectSchema: z.ZodType<RenderSubject> = renderSubjectIdentityObjectSchema
  .extend({
    subjectId: nonEmptyString,
    evidenceLevel: z.enum(EVIDENCE_LEVELS),
    artifactRefs: z.array(artifactRefSchema),
  })
  .strict();

export const sourceConfidenceSchema = z.enum(SOURCE_CONFIDENCE_LEVELS);

export const runIdentitySchema: z.ZodType<RunIdentity> = z
  .object({
    runId: nonEmptyString,
    documentRunId: nonEmptyString.optional(),
    sourceDocument: documentIdentitySchema.optional(),
    owner: nonEmptyString.optional(),
    stage: nonEmptyString.optional(),
    startedAt: nonEmptyString.optional(),
    parentRunId: nonEmptyString.optional(),
  })
  .strict();

export const artifactSetIdentitySchema: z.ZodType<ArtifactSetIdentity> = z
  .object({
    artifactSetId: nonEmptyString,
    artifactKind: nonEmptyString,
    run: runIdentitySchema,
    rootRef: artifactRefSchema,
    generatedAt: nonEmptyString.optional(),
  })
  .strict();

export const schemaQNameEvidenceSchema: z.ZodType<SchemaQNameEvidence> = z
  .object({
    qName: nonEmptyString,
    namespaceUri: nonEmptyString.optional(),
    prefix: z.string().optional(),
    localName: nonEmptyString.optional(),
    ownerElementQName: nonEmptyString.optional(),
    schemaSource: nonEmptyString.optional(),
    provenance: nonEmptyString.optional(),
    classification: z.enum(['strict', 'transitional', 'microsoft-extension', 'w3c', 'opc', 'unknown']).optional(),
  })
  .strict();

export const sourceAnchorSchema: z.ZodType<SourceAnchor> = z
  .object({
    sourceNodeId: nonEmptyString.optional(),
    occurrenceId: nonEmptyString.optional(),
    rawFactIds: z.array(nonEmptyString).optional(),
    schemaQNames: z.array(schemaQNameEvidenceSchema).optional(),
    featureKey: nonEmptyString.optional(),
    conceptKey: nonEmptyString.optional(),
    sourceRef: sourceRefSchema.optional(),
    anchorConfidence: sourceConfidenceSchema.optional(),
    pmNodeId: nonEmptyString.optional(),
    pmRange: z
      .object({
        from: z.number().int().nonnegative(),
        to: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
    flowBlockId: nonEmptyString.optional(),
    layoutFragmentId: nonEmptyString.optional(),
    paintItemId: nonEmptyString.optional(),
  })
  .strict()
  .refine(
    (value) =>
      Boolean(
        value.sourceNodeId ||
          value.occurrenceId ||
          value.rawFactIds?.length ||
          value.sourceRef ||
          value.pmNodeId ||
          value.flowBlockId ||
          value.layoutFragmentId ||
          value.paintItemId,
      ),
    {
      message: 'SourceAnchor requires at least one source or runtime locator.',
    },
  );

export const weakObservationIdentitySchema: z.ZodType<WeakObservationIdentity> = z
  .object({
    observationId: nonEmptyString,
    sourceDocument: documentIdentitySchema,
    evidenceLevel: z.enum(EVIDENCE_LEVELS),
    mechanism: z.enum(OBSERVATION_MECHANISMS),
    sourcePath: nonEmptyString.optional(),
    pageNumbers: z.array(z.number().int().positive()).optional(),
    jsonPath: nonEmptyString.optional(),
  })
  .strict();

export const observationMetricValueSchema = z.union([z.number(), z.string(), z.boolean(), z.null()]);

export const clusterInstanceRecordSchema = z
  .object({
    observationId: nonEmptyString,
    signatureId: nonEmptyString,
    documentPath: nonEmptyString,
    sourcePath: nonEmptyString.optional(),
    sourceOccurrenceId: nonEmptyString.optional(),
    sourceNodeIds: z.array(nonEmptyString).optional(),
    schemaQNames: z.array(nonEmptyString).optional(),
    pageNumbers: z.array(z.number().int().positive()).optional(),
    jsonPath: nonEmptyString.optional(),
    normalizedPath: nonEmptyString.optional(),
    pathKind: nonEmptyString.optional(),
    summary: nonEmptyString,
  })
  .strict();

export const comparisonObservationSchema: z.ZodType<ComparisonObservation> = z
  .object({
    observationId: nonEmptyString,
    schemaVersion: z.number().int().positive(),
    evidenceLevel: z.enum(EVIDENCE_LEVELS),
    evidenceStrength: z.enum(EVIDENCE_STRENGTHS),
    mechanism: z.enum(OBSERVATION_MECHANISMS),
    category: z.enum(COMPARISON_CATEGORIES),
    sourceDocument: documentIdentitySchema,
    sourcePath: nonEmptyString.optional(),
    sourceOccurrenceId: nonEmptyString.optional(),
    sourceAnchors: z.array(sourceAnchorSchema).optional(),
    fragmentIdentity: fragmentIdentitySchema.optional(),
    renderSubjects: z.array(renderSubjectIdentitySchema).optional(),
    pageNumbers: z.array(z.number().int().positive()).optional(),
    jsonPath: nonEmptyString.optional(),
    normalizedPath: nonEmptyString.optional(),
    pathKind: nonEmptyString.optional(),
    diffKind: nonEmptyString.optional(),
    deltaBucket: nonEmptyString.optional(),
    rawDiffCount: z.number().int().nonnegative().optional(),
    summary: nonEmptyString,
    metrics: z.record(z.string(), observationMetricValueSchema).optional(),
    artifactRefs: z.array(artifactRefSchema),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.evidenceLevel === 'fragment' && !value.fragmentIdentity) {
      context.addIssue({
        code: 'custom',
        path: ['fragmentIdentity'],
        message: 'Fragment-level observations must include fragmentIdentity.',
      });
    }
  });

export const signatureRecordSchema: z.ZodType<SignatureRecord> = z
  .object({
    signatureId: nonEmptyString,
    signatureVersion: nonEmptyString,
    familyId: nonEmptyString,
    observationIds: z.array(nonEmptyString).min(1),
    category: z.enum(COMPARISON_CATEGORIES),
    mechanism: z.enum(OBSERVATION_MECHANISMS),
    normalizedKey: nonEmptyString,
    familyKey: nonEmptyString.optional(),
    pathKind: nonEmptyString.optional(),
    normalizedPath: nonEmptyString.optional(),
    diffKind: nonEmptyString.optional(),
    deltaBucket: nonEmptyString.optional(),
    instanceCount: z.number().int().nonnegative().optional(),
    documentCount: z.number().int().nonnegative().optional(),
    pageCount: z.number().int().nonnegative().optional(),
    exampleObservationId: nonEmptyString.optional(),
    confidence: z.enum(SIGNATURE_CONFIDENCE_LEVELS),
  })
  .strict();

export const clusterRecordSchema: z.ZodType<ClusterRecord> = z
  .object({
    clusterId: nonEmptyString,
    signatureIds: z.array(nonEmptyString).min(1),
    title: nonEmptyString,
    instanceCount: z.number().int().nonnegative(),
    documentCount: z.number().int().nonnegative(),
    pageCount: z.number().int().nonnegative(),
    representativeObservationIds: z.array(nonEmptyString),
    evidenceStrength: z.enum(EVIDENCE_STRENGTHS),
    status: z.enum(CLUSTER_STATUSES),
    category: z.enum(COMPARISON_CATEGORIES).optional(),
    mechanism: z.enum(OBSERVATION_MECHANISMS).optional(),
    pathKind: nonEmptyString.optional(),
    allObservationIds: z.array(nonEmptyString).optional(),
    allInstances: z.array(clusterInstanceRecordSchema).optional(),
    knownLimitations: z.array(nonEmptyString).optional(),
    stableJoinKeys: z.array(nonEmptyString).optional(),
    highConfidence: z.boolean().optional(),
  })
  .strict();

export function parseComparisonObservation(value: unknown): ComparisonObservation {
  return comparisonObservationSchema.parse(value);
}

export function parseSignatureRecord(value: unknown): SignatureRecord {
  return signatureRecordSchema.parse(value);
}

export function parseClusterRecord(value: unknown): ClusterRecord {
  return clusterRecordSchema.parse(value);
}
