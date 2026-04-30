export const DOCX_EVIDENCE_SCHEMA_VERSION = 1;

export const EVIDENCE_LEVELS = ['document', 'fragment', 'mixed'] as const;
export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number];

export const EVIDENCE_STRENGTHS = ['weak', 'source-linked', 'oracle-backed'] as const;
export type EvidenceStrength = (typeof EVIDENCE_STRENGTHS)[number];

export const OBSERVATION_MECHANISMS = [
  'layout-json',
  'paint-snapshot',
  'pixel-diff',
  'pdf-text',
  'pdf-raster',
  'semantic-snapshot',
  'manual',
] as const;
export type ObservationMechanism = (typeof OBSERVATION_MECHANISMS)[number];

export const COMPARISON_CATEGORIES = [
  'geometry',
  'pagination',
  'presence',
  'text',
  'style',
  'table',
  'list',
  'drawing',
  'unknown',
] as const;
export type ComparisonCategory = (typeof COMPARISON_CATEGORIES)[number];

export const STORY_KINDS = ['body', 'header', 'footer', 'footnote', 'endnote'] as const;
export type StoryKind = (typeof STORY_KINDS)[number];

export const RENDER_SUBJECT_ROLES = ['word', 'superdoc-reference', 'superdoc-candidate'] as const;
export type RenderSubjectRole = (typeof RENDER_SUBJECT_ROLES)[number];

export const SOURCE_CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;
export type SourceConfidence = (typeof SOURCE_CONFIDENCE_LEVELS)[number];

export const CLUSTER_STATUSES = ['new', 'known', 'ignored', 'review-required'] as const;
export type ClusterStatus = (typeof CLUSTER_STATUSES)[number];

export const SIGNATURE_CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;
export type SignatureConfidence = (typeof SIGNATURE_CONFIDENCE_LEVELS)[number];
