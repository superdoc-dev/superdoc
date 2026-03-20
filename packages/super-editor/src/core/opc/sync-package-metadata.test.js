import { describe, it, expect } from 'vitest';
import { syncPackageMetadata } from './sync-package-metadata.js';
import { getOverrides, getRelationships } from './test-helpers.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal [Content_Types].xml string with the given Override entries. */
function buildContentTypesXml(overrides = []) {
  const overrideElements = overrides
    .map(({ partName, contentType }) => `<Override PartName="${partName}" ContentType="${contentType}"/>`)
    .join('');

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    overrideElements +
    '</Types>'
  );
}

/** Build a minimal _rels/.rels string with the given Relationship entries. */
function buildRelsXml(relationships = []) {
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
// Relationship type constants (must match managed-parts-registry.js)
// ---------------------------------------------------------------------------

const REL_OFFICE_DOC = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument';
const REL_CORE = 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties';
const REL_EXTENDED = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties';
const REL_CUSTOM = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties';

const CT_DOCUMENT = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';
const CT_CORE = 'application/vnd.openxmlformats-package.core-properties+xml';
const CT_EXTENDED = 'application/vnd.openxmlformats-officedocument.extended-properties+xml';
const CT_CUSTOM = 'application/vnd.openxmlformats-officedocument.custom-properties+xml';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A typical _rels/.rels without custom-properties (like the real bug scenario). */
const RELS_WITHOUT_CUSTOM = buildRelsXml([
  { id: 'rId1', type: REL_OFFICE_DOC, target: 'word/document.xml' },
  { id: 'rId2', type: REL_CORE, target: 'docProps/core.xml' },
  { id: 'rId3', type: REL_EXTENDED, target: 'docProps/app.xml' },
]);

/** Content types without custom-properties override (the real bug scenario). */
const CT_WITHOUT_CUSTOM = buildContentTypesXml([
  { partName: '/word/document.xml', contentType: CT_DOCUMENT },
  { partName: '/docProps/core.xml', contentType: CT_CORE },
  { partName: '/docProps/app.xml', contentType: CT_EXTENDED },
]);

/** Full content types and rels with all four managed parts. */
const RELS_COMPLETE = buildRelsXml([
  { id: 'rId1', type: REL_OFFICE_DOC, target: 'word/document.xml' },
  { id: 'rId2', type: REL_CORE, target: 'docProps/core.xml' },
  { id: 'rId3', type: REL_EXTENDED, target: 'docProps/app.xml' },
  { id: 'rId4', type: REL_CUSTOM, target: 'docProps/custom.xml' },
]);

const CT_COMPLETE = buildContentTypesXml([
  { partName: '/word/document.xml', contentType: CT_DOCUMENT },
  { partName: '/docProps/core.xml', contentType: CT_CORE },
  { partName: '/docProps/app.xml', contentType: CT_EXTENDED },
  { partName: '/docProps/custom.xml', contentType: CT_CUSTOM },
]);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('syncPackageMetadata', () => {
  describe('adding missing registrations', () => {
    it('adds custom-properties override and root relationship when docProps/custom.xml exists', () => {
      const { contentTypesXml, relsXml } = syncPackageMetadata({
        baseFiles: {
          '[Content_Types].xml': CT_WITHOUT_CUSTOM,
          '_rels/.rels': RELS_WITHOUT_CUSTOM,
          'word/document.xml': '<w:document/>',
          'docProps/core.xml': '<cp:coreProperties/>',
          'docProps/app.xml': '<Properties/>',
        },
        updatedDocs: {
          'docProps/custom.xml':
            '<Properties><property name="SuperdocVersion"><vt:lpwstr>1.0</vt:lpwstr></property></Properties>',
        },
      });

      const overrides = getOverrides(contentTypesXml);
      const customOverride = overrides.find((o) => o.partName === '/docProps/custom.xml');
      expect(customOverride).toBeTruthy();
      expect(customOverride.contentType).toBe(CT_CUSTOM);

      const rels = getRelationships(relsXml);
      const customRel = rels.find((r) => r.type === REL_CUSTOM);
      expect(customRel).toBeTruthy();
      expect(customRel.target).toBe('docProps/custom.xml');
    });

    it('adds registrations for docProps/app.xml when missing', () => {
      const ctWithoutApp = buildContentTypesXml([
        { partName: '/word/document.xml', contentType: CT_DOCUMENT },
        { partName: '/docProps/core.xml', contentType: CT_CORE },
      ]);
      const relsWithoutApp = buildRelsXml([
        { id: 'rId1', type: REL_OFFICE_DOC, target: 'word/document.xml' },
        { id: 'rId2', type: REL_CORE, target: 'docProps/core.xml' },
      ]);

      const { contentTypesXml, relsXml } = syncPackageMetadata({
        baseFiles: {
          '[Content_Types].xml': ctWithoutApp,
          '_rels/.rels': relsWithoutApp,
          'word/document.xml': '<w:document/>',
          'docProps/core.xml': '<cp:coreProperties/>',
          'docProps/app.xml': '<Properties/>',
        },
        updatedDocs: {},
      });

      const overrides = getOverrides(contentTypesXml);
      expect(overrides.find((o) => o.partName === '/docProps/app.xml')).toBeTruthy();

      const rels = getRelationships(relsXml);
      expect(rels.find((r) => r.type === REL_EXTENDED)).toBeTruthy();
    });

    it('handles all four managed parts through the same registry', () => {
      const emptyCt = buildContentTypesXml([]);
      const emptyRels = buildRelsXml([]);

      const { contentTypesXml, relsXml } = syncPackageMetadata({
        baseFiles: {
          '[Content_Types].xml': emptyCt,
          '_rels/.rels': emptyRels,
          'word/document.xml': '<w:document/>',
          'docProps/core.xml': '<cp:coreProperties/>',
          'docProps/app.xml': '<Properties/>',
          'docProps/custom.xml': '<Properties/>',
        },
        updatedDocs: {},
      });

      const overrides = getOverrides(contentTypesXml);
      expect(overrides).toHaveLength(4);
      expect(overrides.find((o) => o.partName === '/word/document.xml')).toBeTruthy();
      expect(overrides.find((o) => o.partName === '/docProps/core.xml')).toBeTruthy();
      expect(overrides.find((o) => o.partName === '/docProps/app.xml')).toBeTruthy();
      expect(overrides.find((o) => o.partName === '/docProps/custom.xml')).toBeTruthy();

      const rels = getRelationships(relsXml);
      expect(rels).toHaveLength(4);
      expect(rels.find((r) => r.type === REL_OFFICE_DOC)).toBeTruthy();
      expect(rels.find((r) => r.type === REL_CORE)).toBeTruthy();
      expect(rels.find((r) => r.type === REL_EXTENDED)).toBeTruthy();
      expect(rels.find((r) => r.type === REL_CUSTOM)).toBeTruthy();
    });
  });

  describe('removing stale registrations', () => {
    it('removes custom-properties registrations when docProps/custom.xml is absent', () => {
      const { contentTypesXml, relsXml } = syncPackageMetadata({
        baseFiles: {
          '[Content_Types].xml': CT_COMPLETE,
          '_rels/.rels': RELS_COMPLETE,
          'word/document.xml': '<w:document/>',
          'docProps/core.xml': '<cp:coreProperties/>',
          'docProps/app.xml': '<Properties/>',
          // no docProps/custom.xml
        },
        updatedDocs: {},
      });

      const overrides = getOverrides(contentTypesXml);
      expect(overrides.find((o) => o.partName === '/docProps/custom.xml')).toBeUndefined();
      // Other overrides should remain
      expect(overrides.find((o) => o.partName === '/word/document.xml')).toBeTruthy();

      const rels = getRelationships(relsXml);
      expect(rels.find((r) => r.type === REL_CUSTOM)).toBeUndefined();
      expect(rels.find((r) => r.type === REL_OFFICE_DOC)).toBeTruthy();
    });

    it('removes registrations when updatedDocs explicitly deletes a part with null', () => {
      const { contentTypesXml, relsXml } = syncPackageMetadata({
        baseFiles: {
          '[Content_Types].xml': CT_COMPLETE,
          '_rels/.rels': RELS_COMPLETE,
          'word/document.xml': '<w:document/>',
          'docProps/core.xml': '<cp:coreProperties/>',
          'docProps/app.xml': '<Properties/>',
          'docProps/custom.xml': '<Properties/>',
        },
        updatedDocs: {
          'docProps/custom.xml': null, // explicitly deleted
        },
      });

      const overrides = getOverrides(contentTypesXml);
      expect(overrides.find((o) => o.partName === '/docProps/custom.xml')).toBeUndefined();

      const rels = getRelationships(relsXml);
      expect(rels.find((r) => r.type === REL_CUSTOM)).toBeUndefined();
    });
  });

  describe('preserving unrelated entries', () => {
    it('preserves unknown Override entries', () => {
      const ctWithExtra = buildContentTypesXml([
        { partName: '/word/document.xml', contentType: CT_DOCUMENT },
        {
          partName: '/word/numbering.xml',
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml',
        },
        {
          partName: '/word/styles.xml',
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml',
        },
      ]);

      const { contentTypesXml } = syncPackageMetadata({
        baseFiles: {
          '[Content_Types].xml': ctWithExtra,
          '_rels/.rels': RELS_WITHOUT_CUSTOM,
          'word/document.xml': '<w:document/>',
          'docProps/core.xml': '<cp:coreProperties/>',
          'docProps/app.xml': '<Properties/>',
        },
        updatedDocs: {},
      });

      const overrides = getOverrides(contentTypesXml);
      expect(overrides.find((o) => o.partName === '/word/numbering.xml')).toBeTruthy();
      expect(overrides.find((o) => o.partName === '/word/styles.xml')).toBeTruthy();
    });

    it('preserves unknown Relationship entries', () => {
      const relsWithUnknown = buildRelsXml([
        { id: 'rId1', type: REL_OFFICE_DOC, target: 'word/document.xml' },
        { id: 'rId2', type: REL_CORE, target: 'docProps/core.xml' },
        { id: 'rId3', type: REL_EXTENDED, target: 'docProps/app.xml' },
        {
          id: 'rId5',
          type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/something-custom',
          target: 'custom/thing.xml',
        },
      ]);

      const { relsXml } = syncPackageMetadata({
        baseFiles: {
          '[Content_Types].xml': CT_WITHOUT_CUSTOM,
          '_rels/.rels': relsWithUnknown,
          'word/document.xml': '<w:document/>',
          'docProps/core.xml': '<cp:coreProperties/>',
          'docProps/app.xml': '<Properties/>',
        },
        updatedDocs: {},
      });

      const rels = getRelationships(relsXml);
      const unknownRel = rels.find((r) => r.id === 'rId5');
      expect(unknownRel).toBeTruthy();
      expect(unknownRel.target).toBe('custom/thing.xml');
    });
  });

  describe('deduplication and correction', () => {
    it('deduplicates multiple Override entries for the same managed part', () => {
      const ctWithDupes = buildContentTypesXml([
        { partName: '/word/document.xml', contentType: CT_DOCUMENT },
        { partName: '/docProps/custom.xml', contentType: CT_CUSTOM },
        { partName: '/docProps/custom.xml', contentType: CT_CUSTOM },
        { partName: '/docProps/custom.xml', contentType: 'wrong/type' },
      ]);

      const { contentTypesXml } = syncPackageMetadata({
        baseFiles: {
          '[Content_Types].xml': ctWithDupes,
          '_rels/.rels': RELS_COMPLETE,
          'word/document.xml': '<w:document/>',
          'docProps/core.xml': '<cp:coreProperties/>',
          'docProps/app.xml': '<Properties/>',
          'docProps/custom.xml': '<Properties/>',
        },
        updatedDocs: {},
      });

      const overrides = getOverrides(contentTypesXml);
      const customOverrides = overrides.filter((o) => o.partName === '/docProps/custom.xml');
      expect(customOverrides).toHaveLength(1);
      expect(customOverrides[0].contentType).toBe(CT_CUSTOM);
    });

    it('deduplicates multiple Relationship entries for the same managed type', () => {
      const relsWithDupes = buildRelsXml([
        { id: 'rId1', type: REL_OFFICE_DOC, target: 'word/document.xml' },
        { id: 'rId2', type: REL_CUSTOM, target: 'docProps/custom.xml' },
        { id: 'rId3', type: REL_CUSTOM, target: 'docProps/custom.xml' },
      ]);

      const { relsXml } = syncPackageMetadata({
        baseFiles: {
          '[Content_Types].xml': CT_COMPLETE,
          '_rels/.rels': relsWithDupes,
          'word/document.xml': '<w:document/>',
          'docProps/core.xml': '<cp:coreProperties/>',
          'docProps/app.xml': '<Properties/>',
          'docProps/custom.xml': '<Properties/>',
        },
        updatedDocs: {},
      });

      const rels = getRelationships(relsXml);
      const customRels = rels.filter((r) => r.type === REL_CUSTOM);
      expect(customRels).toHaveLength(1);
      expect(customRels[0].id).toBe('rId2'); // reuses first existing rId
    });

    it('corrects wrong content type for a managed part', () => {
      const ctWithWrongType = buildContentTypesXml([
        { partName: '/word/document.xml', contentType: CT_DOCUMENT },
        { partName: '/docProps/custom.xml', contentType: 'application/wrong-type' },
      ]);

      const { contentTypesXml } = syncPackageMetadata({
        baseFiles: {
          '[Content_Types].xml': ctWithWrongType,
          '_rels/.rels': RELS_COMPLETE,
          'word/document.xml': '<w:document/>',
          'docProps/core.xml': '<cp:coreProperties/>',
          'docProps/app.xml': '<Properties/>',
          'docProps/custom.xml': '<Properties/>',
        },
        updatedDocs: {},
      });

      const overrides = getOverrides(contentTypesXml);
      const custom = overrides.find((o) => o.partName === '/docProps/custom.xml');
      expect(custom.contentType).toBe(CT_CUSTOM);
    });

    it('corrects wrong target for a managed relationship', () => {
      const relsWithWrongTarget = buildRelsXml([
        { id: 'rId1', type: REL_OFFICE_DOC, target: 'word/document.xml' },
        { id: 'rId4', type: REL_CUSTOM, target: 'wrong/path.xml' },
      ]);

      const { relsXml } = syncPackageMetadata({
        baseFiles: {
          '[Content_Types].xml': CT_COMPLETE,
          '_rels/.rels': relsWithWrongTarget,
          'word/document.xml': '<w:document/>',
          'docProps/core.xml': '<cp:coreProperties/>',
          'docProps/app.xml': '<Properties/>',
          'docProps/custom.xml': '<Properties/>',
        },
        updatedDocs: {},
      });

      const rels = getRelationships(relsXml);
      const custom = rels.find((r) => r.type === REL_CUSTOM);
      expect(custom.target).toBe('docProps/custom.xml');
      expect(custom.id).toBe('rId4'); // reuses existing rId
    });
  });

  describe('rId allocation', () => {
    it('reuses existing rIds when possible', () => {
      const { relsXml } = syncPackageMetadata({
        baseFiles: {
          '[Content_Types].xml': CT_COMPLETE,
          '_rels/.rels': RELS_COMPLETE,
          'word/document.xml': '<w:document/>',
          'docProps/core.xml': '<cp:coreProperties/>',
          'docProps/app.xml': '<Properties/>',
          'docProps/custom.xml': '<Properties/>',
        },
        updatedDocs: {},
      });

      const rels = getRelationships(relsXml);
      expect(rels.find((r) => r.type === REL_OFFICE_DOC).id).toBe('rId1');
      expect(rels.find((r) => r.type === REL_CORE).id).toBe('rId2');
      expect(rels.find((r) => r.type === REL_EXTENDED).id).toBe('rId3');
      expect(rels.find((r) => r.type === REL_CUSTOM).id).toBe('rId4');
    });

    it('allocates next rId when adding a new relationship', () => {
      const { relsXml } = syncPackageMetadata({
        baseFiles: {
          '[Content_Types].xml': CT_WITHOUT_CUSTOM,
          '_rels/.rels': RELS_WITHOUT_CUSTOM, // rId1..rId3 exist
          'word/document.xml': '<w:document/>',
          'docProps/core.xml': '<cp:coreProperties/>',
          'docProps/app.xml': '<Properties/>',
        },
        updatedDocs: {
          'docProps/custom.xml': '<Properties/>',
        },
      });

      const rels = getRelationships(relsXml);
      const custom = rels.find((r) => r.type === REL_CUSTOM);
      expect(custom.id).toBe('rId4');
    });

    it('handles gaps in rId numbering correctly', () => {
      const relsWithGap = buildRelsXml([
        { id: 'rId1', type: REL_OFFICE_DOC, target: 'word/document.xml' },
        { id: 'rId5', type: REL_CORE, target: 'docProps/core.xml' },
        { id: 'rId10', type: REL_EXTENDED, target: 'docProps/app.xml' },
      ]);

      const { relsXml } = syncPackageMetadata({
        baseFiles: {
          '[Content_Types].xml': CT_WITHOUT_CUSTOM,
          '_rels/.rels': relsWithGap,
          'word/document.xml': '<w:document/>',
          'docProps/core.xml': '<cp:coreProperties/>',
          'docProps/app.xml': '<Properties/>',
        },
        updatedDocs: {
          'docProps/custom.xml': '<Properties/>',
        },
      });

      const rels = getRelationships(relsXml);
      const custom = rels.find((r) => r.type === REL_CUSTOM);
      expect(custom.id).toBe('rId11'); // max existing is rId10
    });
  });

  describe('_rels/.rels synthesis', () => {
    it('creates _rels/.rels when absent', () => {
      const { relsXml } = syncPackageMetadata({
        baseFiles: {
          '[Content_Types].xml': CT_WITHOUT_CUSTOM,
          'word/document.xml': '<w:document/>',
          'docProps/core.xml': '<cp:coreProperties/>',
          // no _rels/.rels at all
        },
        updatedDocs: {},
      });

      const rels = getRelationships(relsXml);
      expect(rels.find((r) => r.type === REL_OFFICE_DOC)).toBeTruthy();
      expect(rels.find((r) => r.type === REL_CORE)).toBeTruthy();
    });
  });

  describe('idempotency', () => {
    it('produces identical output when run twice', () => {
      const input = {
        baseFiles: {
          '[Content_Types].xml': CT_WITHOUT_CUSTOM,
          '_rels/.rels': RELS_WITHOUT_CUSTOM,
          'word/document.xml': '<w:document/>',
          'docProps/core.xml': '<cp:coreProperties/>',
          'docProps/app.xml': '<Properties/>',
        },
        updatedDocs: {
          'docProps/custom.xml': '<Properties/>',
        },
      };

      const first = syncPackageMetadata(input);

      // Run again with the first pass output as base
      const second = syncPackageMetadata({
        baseFiles: {
          ...input.baseFiles,
          '[Content_Types].xml': first.contentTypesXml,
          '_rels/.rels': first.relsXml,
        },
        updatedDocs: input.updatedDocs,
      });

      expect(second.contentTypesXml).toBe(first.contentTypesXml);
      expect(second.relsXml).toBe(first.relsXml);
    });

    it('is idempotent when all registrations already exist', () => {
      const input = {
        baseFiles: {
          '[Content_Types].xml': CT_COMPLETE,
          '_rels/.rels': RELS_COMPLETE,
          'word/document.xml': '<w:document/>',
          'docProps/core.xml': '<cp:coreProperties/>',
          'docProps/app.xml': '<Properties/>',
          'docProps/custom.xml': '<Properties/>',
        },
        updatedDocs: {},
      };

      const first = syncPackageMetadata(input);
      const second = syncPackageMetadata({
        ...input,
        baseFiles: {
          ...input.baseFiles,
          '[Content_Types].xml': first.contentTypesXml,
          '_rels/.rels': first.relsXml,
        },
      });

      expect(second.contentTypesXml).toBe(first.contentTypesXml);
      expect(second.relsXml).toBe(first.relsXml);
    });
  });

  describe('error handling', () => {
    it('throws when [Content_Types].xml is missing', () => {
      expect(() =>
        syncPackageMetadata({
          baseFiles: { '_rels/.rels': RELS_WITHOUT_CUSTOM },
          updatedDocs: {},
        }),
      ).toThrow('[Content_Types].xml is missing');
    });

    it('throws when [Content_Types].xml is malformed', () => {
      expect(() =>
        syncPackageMetadata({
          baseFiles: {
            '[Content_Types].xml': 'not xml at all {{{',
            '_rels/.rels': RELS_WITHOUT_CUSTOM,
          },
          updatedDocs: {},
        }),
      ).toThrow('[Content_Types].xml could not be parsed');
    });

    it('throws when _rels/.rels is malformed', () => {
      expect(() =>
        syncPackageMetadata({
          baseFiles: {
            '[Content_Types].xml': CT_WITHOUT_CUSTOM,
            '_rels/.rels': 'not xml {{{',
          },
          updatedDocs: {},
        }),
      ).toThrow('_rels/.rels could not be parsed');
    });

    it('replaces _rels/.rels that parses but has no <Relationships> root', () => {
      const { relsXml } = syncPackageMetadata({
        baseFiles: {
          '[Content_Types].xml': CT_WITHOUT_CUSTOM,
          '_rels/.rels': '<?xml version="1.0"?><foo/>',
          'word/document.xml': '<w:document/>',
          'docProps/core.xml': '<cp:coreProperties/>',
          'docProps/app.xml': '<Properties/>',
        },
        updatedDocs: {},
      });

      // The malformed <foo/> must be gone — only a valid <Relationships> root should remain
      expect(relsXml).not.toContain('<foo');
      expect(relsXml).toContain('<Relationships');

      const rels = getRelationships(relsXml);
      expect(rels.find((r) => r.type === REL_OFFICE_DOC)).toBeTruthy();
      expect(rels.find((r) => r.type === REL_CORE)).toBeTruthy();
      expect(rels.find((r) => r.type === REL_EXTENDED)).toBeTruthy();
    });
  });

  describe('Default elements are preserved', () => {
    it('preserves Default extension entries in [Content_Types].xml', () => {
      const { contentTypesXml } = syncPackageMetadata({
        baseFiles: {
          '[Content_Types].xml': CT_WITHOUT_CUSTOM,
          '_rels/.rels': RELS_WITHOUT_CUSTOM,
          'word/document.xml': '<w:document/>',
          'docProps/core.xml': '<cp:coreProperties/>',
          'docProps/app.xml': '<Properties/>',
        },
        updatedDocs: {},
      });

      // The Default elements should still be present
      expect(contentTypesXml).toContain('Extension="rels"');
      expect(contentTypesXml).toContain('Extension="xml"');
    });
  });
});
