import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  clusterRecordSchema,
  comparisonObservationSchema,
  createStableId,
  parseClusterRecord,
  parseComparisonObservation,
  parseSignatureRecord,
  renderSubjectSchema,
  sourceAnchorSchema,
  signatureRecordSchema,
} from './index.js';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(packageRoot, 'src');

const sourceDocument = {
  sourceKey: 'corpus/basic/table.docx',
  originalSha256: 'sha256-original',
  normalizedSha256: 'sha256-normalized',
};

const sourceAnchor = {
  sourceNodeId: 'node-table-1',
  occurrenceId: 'occurrence-table-1',
  rawFactIds: ['raw-w-tbl-1'],
  schemaQNames: [
    {
      qName: 'w:tbl',
      namespaceUri: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
      localName: 'tbl',
    },
  ],
  featureKey: 'tables',
  conceptKey: 'docx.table',
  sourceRef: {
    partUri: '/word/document.xml',
    xpathLikePath: '/w:document[1]/w:body[1]/w:tbl[1]',
    rawFactId: 'raw-w-tbl-1',
    occurrenceId: 'occurrence-table-1',
  },
  anchorConfidence: 'high',
  flowBlockId: 'flow-table-1',
};

const observation = {
  observationId: 'observation_1',
  schemaVersion: 1,
  evidenceLevel: 'document',
  evidenceStrength: 'source-linked',
  mechanism: 'layout-json',
  category: 'table',
  sourceDocument,
  sourcePath: 'basic/table.docx.layout.json',
  sourceOccurrenceId: 'occurrence-table-1',
  sourceAnchors: [sourceAnchor],
  pageNumbers: [1],
  jsonPath: '$.pages[0].blocks[3].width',
  normalizedPath: '$.pages[].blocks[].width',
  pathKind: 'table-width',
  diffKind: 'changed',
  deltaBucket: '+1px',
  rawDiffCount: 4,
  summary: 'Table width changed by about 1px.',
  metrics: { deltaPx: 1 },
  artifactRefs: [{ path: 'results/layout/basic/table.docx.layout.json.diff.json' }],
};

const signature = {
  signatureId: 'signature_table_width_1',
  signatureVersion: 'public.v1',
  familyId: 'table-width',
  observationIds: ['observation_1'],
  category: 'table',
  mechanism: 'layout-json',
  normalizedKey: 'table-width|changed|+1px',
  familyKey: 'table-width|changed',
  pathKind: 'table-width',
  normalizedPath: '$.pages[].blocks[].width',
  diffKind: 'changed',
  deltaBucket: '+1px',
  instanceCount: 1,
  documentCount: 1,
  pageCount: 1,
  exampleObservationId: 'observation_1',
  confidence: 'high',
};

const cluster = {
  clusterId: 'cluster_table_width_1',
  signatureIds: ['signature_table_width_1'],
  title: 'Table width changed by about 1px',
  instanceCount: 1,
  documentCount: 1,
  pageCount: 1,
  representativeObservationIds: ['observation_1'],
  evidenceStrength: 'source-linked',
  status: 'new',
  category: 'table',
  mechanism: 'layout-json',
  pathKind: 'table-width',
  allObservationIds: ['observation_1'],
  allInstances: [
    {
      observationId: 'observation_1',
      signatureId: 'signature_table_width_1',
      documentPath: 'basic/table.docx.layout.json',
      sourcePath: 'basic/table.docx.layout.json',
      sourceOccurrenceId: 'occurrence-table-1',
      sourceNodeIds: ['node-table-1'],
      schemaQNames: ['w:tbl'],
      pageNumbers: [1],
      jsonPath: '$.pages[0].blocks[3].width',
      normalizedPath: '$.pages[].blocks[].width',
      pathKind: 'table-width',
      summary: 'Table width changed by about 1px.',
    },
  ],
};

function stableObservationInput(value: ReturnType<typeof parseComparisonObservation>): unknown {
  const { observationId: _observationId, ...rest } = value;
  return rest;
}

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [entryPath] : [];
  });
}

describe('public DOCX evidence contracts', () => {
  it('validates minimal source-linked observations', () => {
    const parsed = parseComparisonObservation(observation);
    const reparsed = comparisonObservationSchema.parse(JSON.parse(JSON.stringify(parsed)));

    expect(reparsed).toEqual(parsed);
    expect(sourceAnchorSchema.parse(parsed.sourceAnchors?.[0])).toEqual(sourceAnchor);
  });

  it('validates minimal signature and cluster records', () => {
    const parsedSignature = parseSignatureRecord(signature);
    const parsedCluster = parseClusterRecord(cluster);

    expect(signatureRecordSchema.parse(JSON.parse(JSON.stringify(parsedSignature)))).toEqual(parsedSignature);
    expect(clusterRecordSchema.parse(JSON.parse(JSON.stringify(parsedCluster)))).toEqual(parsedCluster);
  });

  it('validates render subjects without exposing analysis policy', () => {
    const parsed = renderSubjectSchema.parse({
      subjectId: 'subject_candidate',
      role: 'superdoc-candidate',
      rendererId: 'superdoc',
      rendererVersion: '1.30.0-next.8',
      evidenceLevel: 'document',
      artifactRefs: [{ path: 'candidate/layout.json' }],
    });

    expect(parsed.role).toBe('superdoc-candidate');
  });

  it('produces stable IDs from public artifacts', () => {
    const parsed = parseComparisonObservation(observation);
    const first = createStableId('observation', stableObservationInput(parsed));
    const second = createStableId('observation', stableObservationInput(parsed));

    expect(first).toBe(second);
    expect(first.startsWith('observation_')).toBe(true);
  });

  it('rejects fragment observations without fragment identity', () => {
    expect(
      comparisonObservationSchema.safeParse({
        ...observation,
        evidenceLevel: 'fragment',
      }).success,
    ).toBe(false);
  });

  it('keeps public source Worker-safe and free of owner-runtime imports', () => {
    for (const sourceFile of listSourceFiles(sourceRoot)) {
      const text = readFileSync(sourceFile, 'utf8');

      expect(text).not.toMatch(/from ['"]node:/);
      expect(text).not.toMatch(/from ['"].*\.\.\/\.\.\/\.\.\/labs/);
      expect(text).not.toMatch(/from ['"]@superdoc\/(super-editor|painter-dom|layout-engine)/);
    }
  });
});
