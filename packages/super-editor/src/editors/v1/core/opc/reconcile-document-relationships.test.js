import { describe, it, expect } from 'vitest';
import { reconcileDocumentRelationships, MANAGED_DOCUMENT_PARTS } from './reconcile-document-relationships.js';
import { getRelationships } from './test-helpers.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildDocRelsXml(relationships = []) {
  const relElements = relationships
    .map(({ id, type, target }) => `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`)
    .join('');

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    relElements +
    '</Relationships>'
  );
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REL_NUMBERING = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering';
const REL_IMAGE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
const REL_HYPERLINK = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MANAGED_DOCUMENT_PARTS registry', () => {
  it('contains numbering as a managed document part', () => {
    const numbering = MANAGED_DOCUMENT_PARTS.find((p) => p.zipPath === 'word/numbering.xml');
    expect(numbering).toBeTruthy();
    expect(numbering.relationshipType).toBe(REL_NUMBERING);
    expect(numbering.relTarget).toBe('numbering.xml');
  });
});

describe('reconcileDocumentRelationships', () => {
  describe('adding missing relationships', () => {
    it('adds numbering relationship when the part exists but the relationship is missing', () => {
      const relsXml = buildDocRelsXml([{ id: 'rId1', type: REL_IMAGE, target: 'media/image1.png' }]);

      const result = reconcileDocumentRelationships(relsXml, (path) => path === 'word/numbering.xml');

      const rels = getRelationships(result);
      const numbering = rels.find((r) => r.type === REL_NUMBERING);
      expect(numbering).toBeTruthy();
      expect(numbering.target).toBe('numbering.xml');
      expect(numbering.id).toBe('rId2');
    });

    it('adds relationship to empty rels document', () => {
      const relsXml = buildDocRelsXml([]);

      const result = reconcileDocumentRelationships(relsXml, (path) => path === 'word/numbering.xml');

      const rels = getRelationships(result);
      expect(rels).toHaveLength(1);
      expect(rels[0].type).toBe(REL_NUMBERING);
      expect(rels[0].id).toBe('rId1');
    });
  });

  describe('skipping existing relationships', () => {
    it('does not duplicate numbering relationship when it already exists', () => {
      const relsXml = buildDocRelsXml([{ id: 'rId1', type: REL_NUMBERING, target: 'numbering.xml' }]);

      const result = reconcileDocumentRelationships(relsXml, () => true);

      const rels = getRelationships(result);
      const numberingRels = rels.filter((r) => r.type === REL_NUMBERING);
      expect(numberingRels).toHaveLength(1);
    });

    it('returns input unchanged (reference-identical) when no reconciliation needed', () => {
      const relsXml = buildDocRelsXml([{ id: 'rId1', type: REL_NUMBERING, target: 'numbering.xml' }]);

      const result = reconcileDocumentRelationships(relsXml, () => true);
      expect(result).toBe(relsXml);
    });
  });

  describe('skipping absent parts', () => {
    it('does not add relationship when the part does not exist', () => {
      const relsXml = buildDocRelsXml([{ id: 'rId1', type: REL_IMAGE, target: 'media/image1.png' }]);

      const result = reconcileDocumentRelationships(relsXml, () => false);

      const rels = getRelationships(result);
      expect(rels.find((r) => r.type === REL_NUMBERING)).toBeUndefined();
    });

    it('returns input unchanged (reference-identical) when part is absent', () => {
      const relsXml = buildDocRelsXml([{ id: 'rId1', type: REL_IMAGE, target: 'media/image1.png' }]);

      const result = reconcileDocumentRelationships(relsXml, () => false);
      expect(result).toBe(relsXml);
    });
  });

  describe('rId allocation', () => {
    it('allocates rId after the highest existing rId', () => {
      const relsXml = buildDocRelsXml([
        { id: 'rId1', type: REL_IMAGE, target: 'media/image1.png' },
        { id: 'rId10', type: REL_HYPERLINK, target: 'http://example.com' },
      ]);

      const result = reconcileDocumentRelationships(relsXml, (path) => path === 'word/numbering.xml');

      const rels = getRelationships(result);
      const numbering = rels.find((r) => r.type === REL_NUMBERING);
      expect(numbering.id).toBe('rId11');
    });
  });

  describe('preserving existing relationships', () => {
    it('preserves all pre-existing relationships', () => {
      const relsXml = buildDocRelsXml([
        { id: 'rId1', type: REL_IMAGE, target: 'media/image1.png' },
        { id: 'rId2', type: REL_HYPERLINK, target: 'http://example.com' },
      ]);

      const result = reconcileDocumentRelationships(relsXml, (path) => path === 'word/numbering.xml');

      const rels = getRelationships(result);
      expect(rels.find((r) => r.id === 'rId1')).toBeTruthy();
      expect(rels.find((r) => r.id === 'rId2')).toBeTruthy();
      expect(rels).toHaveLength(3);
    });
  });

  describe('idempotency', () => {
    it('produces identical output when run twice', () => {
      const relsXml = buildDocRelsXml([{ id: 'rId1', type: REL_IMAGE, target: 'media/image1.png' }]);

      const fileExists = (path) => path === 'word/numbering.xml';
      const first = reconcileDocumentRelationships(relsXml, fileExists);
      const second = reconcileDocumentRelationships(first, fileExists);

      expect(second).toBe(first);
    });
  });

  describe('error handling', () => {
    it('returns null input unchanged', () => {
      expect(reconcileDocumentRelationships(null, () => true)).toBeNull();
    });

    it('returns undefined input unchanged', () => {
      expect(reconcileDocumentRelationships(undefined, () => true)).toBeUndefined();
    });

    it('returns malformed XML unchanged', () => {
      const bad = 'not xml {{{';
      expect(reconcileDocumentRelationships(bad, () => true)).toBe(bad);
    });

    it('returns XML without Relationships root unchanged', () => {
      const noRoot = '<?xml version="1.0"?><foo/>';
      expect(reconcileDocumentRelationships(noRoot, () => true)).toBe(noRoot);
    });
  });
});
