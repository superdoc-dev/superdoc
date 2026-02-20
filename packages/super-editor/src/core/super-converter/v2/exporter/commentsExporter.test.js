import {
  updateCommentsExtendedXml,
  updateCommentsIdsAndExtensible,
  updateCommentsXml,
  prepareCommentsXmlFilesForExport,
  removeCommentsFilesFromConvertedXml,
  toIsoNoFractional,
} from './commentsExporter.js';

// --- Shared fixtures ---

const makeComment = (overrides = {}) => ({
  commentId: 'test-comment-1',
  creatorName: 'Mary Jones',
  createdTime: 1764111660000,
  importedAuthor: { name: 'Mary Jones (imported)' },
  isInternal: false,
  commentText: '<span style="font-size: 10pt;">Here is a comment</span>',
  commentParaId: '126B0C7F',
  ...overrides,
});

const makeCommentsIds = () => ({
  declaration: {},
  elements: [
    {
      type: 'element',
      name: 'w16cid:commentsIds',
      attributes: {},
      elements: [],
    },
  ],
});

const makeExtensible = () => ({
  declaration: {},
  elements: [
    {
      type: 'element',
      name: 'w16cex:commentsExtensible',
      attributes: {},
      elements: [],
    },
  ],
});

/**
 * Build a minimal convertedXml structure for testing prepareCommentsXmlFilesForExport.
 * The function generates fresh skeletons internally, so we only need document.xml
 * and the comment-related entries that match the fileSet profile.
 */
const makeConvertedXml = () => ({
  'word/document.xml': { elements: [{ elements: [] }] },
  'word/_rels/document.xml.rels': {
    elements: [
      {
        name: 'Relationships',
        attributes: { xmlns: 'http://schemas.openxmlformats.org/package/2006/relationships' },
        elements: [],
      },
    ],
  },
});

/** Minimal comment def that updateCommentsXml expects (post-getCommentDefinition) */
const makeCommentDef = (id = '0', paraId = '126B0C7F') => ({
  type: 'element',
  name: 'w:comment',
  attributes: {
    'w:id': id,
    'w:author': 'Author',
    'w:date': '2025-01-01T00:00:00Z',
    'w:initials': 'A',
    'w15:paraId': paraId,
  },
  elements: [{ type: 'element', name: 'w:p', attributes: {}, elements: [] }],
});

// =============================================================================
// updateCommentsIdsAndExtensible
// =============================================================================

describe('updateCommentsIdsAndExtensible', () => {
  const comments = [makeComment()];
  const commentsIds = makeCommentsIds();
  const extensible = makeExtensible();

  it('populates both parts when both are provided', () => {
    const result = updateCommentsIdsAndExtensible(comments, commentsIds, extensible);
    expect(result.documentIdsUpdated.elements[0].elements).toHaveLength(1);
    expect(result.extensibleUpdated.elements[0].elements).toHaveLength(1);

    // Durable IDs must match between the two parts
    const idsId = result.documentIdsUpdated.elements[0].elements[0].attributes['w16cid:durableId'];
    const extId = result.extensibleUpdated.elements[0].elements[0].attributes['w16cex:durableId'];
    expect(idsId).toBe(extId);
  });

  it('populates only commentsIds when extensible is null', () => {
    const result = updateCommentsIdsAndExtensible(comments, commentsIds, null);
    expect(result.documentIdsUpdated.elements[0].elements).toHaveLength(1);
    expect(result.extensibleUpdated).toBeNull();
  });

  it('populates only extensible when commentsIds is null', () => {
    const result = updateCommentsIdsAndExtensible(comments, null, extensible);
    expect(result.documentIdsUpdated).toBeNull();
    expect(result.extensibleUpdated.elements[0].elements).toHaveLength(1);
  });

  it('returns both null when both inputs are null', () => {
    const result = updateCommentsIdsAndExtensible(comments, null, null);
    expect(result.documentIdsUpdated).toBeNull();
    expect(result.extensibleUpdated).toBeNull();
  });

  it('formats dateUtc correctly when createdTime is provided', () => {
    const result = updateCommentsIdsAndExtensible(comments, commentsIds, extensible);
    const el = result.extensibleUpdated.elements[0].elements[0];
    expect(el.attributes['w16cex:dateUtc']).toEqual(toIsoNoFractional(comments[0].createdTime));
  });

  it('formats dateUtc with current time when createdTime is undefined', () => {
    const before = Date.now();
    const commentsNoTime = comments.map((c) => ({ ...c, createdTime: undefined }));
    const result = updateCommentsIdsAndExtensible(commentsNoTime, commentsIds, extensible);
    const after = Date.now();
    const el = result.extensibleUpdated.elements[0].elements[0];
    const actual = el.attributes['w16cex:dateUtc'];
    // Allow either second in case of boundary crossing
    const valid = [toIsoNoFractional(before), toIsoNoFractional(after)];
    expect(valid).toContain(actual);
  });
});

// =============================================================================
// prepareCommentsXmlFilesForExport
// =============================================================================

describe('prepareCommentsXmlFilesForExport', () => {
  const commentsWithParaIds = [makeComment()];
  const defs = [makeCommentDef()];

  describe('partial file-set handling', () => {
    it('populates commentsIds.xml even when commentsExtensible.xml is absent', () => {
      const threadingProfile = {
        defaultStyle: 'commentsExtended',
        mixed: false,
        fileSet: {
          hasCommentsExtended: true,
          hasCommentsExtensible: false,
          hasCommentsIds: true,
        },
      };

      const result = prepareCommentsXmlFilesForExport({
        convertedXml: makeConvertedXml(),
        defs,
        commentsWithParaIds,
        exportType: 'external',
        threadingProfile,
      });

      // commentsIds.xml should be populated
      const idsXml = result.documentXml['word/commentsIds.xml'];
      expect(idsXml).toBeDefined();
      expect(idsXml.elements[0].elements).toHaveLength(1);
      expect(idsXml.elements[0].elements[0].name).toBe('w16cid:commentId');

      // commentsExtensible.xml should NOT exist
      expect(result.documentXml['word/commentsExtensible.xml']).toBeUndefined();

      // Relationship for commentsIds should be present
      const idsRel = result.relationships.find((r) => r.attributes.Target === 'commentsIds.xml');
      expect(idsRel).toBeDefined();

      // Relationship for commentsExtensible should NOT be present
      const extRel = result.relationships.find((r) => r.attributes.Target === 'commentsExtensible.xml');
      expect(extRel).toBeUndefined();
    });

    it('populates commentsExtensible.xml even when commentsIds.xml is absent', () => {
      const threadingProfile = {
        defaultStyle: 'commentsExtended',
        mixed: false,
        fileSet: {
          hasCommentsExtended: true,
          hasCommentsExtensible: true,
          hasCommentsIds: false,
        },
      };

      const result = prepareCommentsXmlFilesForExport({
        convertedXml: makeConvertedXml(),
        defs,
        commentsWithParaIds,
        exportType: 'external',
        threadingProfile,
      });

      // commentsExtensible.xml should be populated
      const extXml = result.documentXml['word/commentsExtensible.xml'];
      expect(extXml).toBeDefined();
      expect(extXml.elements[0].elements).toHaveLength(1);

      // commentsIds.xml should NOT exist
      expect(result.documentXml['word/commentsIds.xml']).toBeUndefined();
    });
  });

  describe('removedTargets tracking', () => {
    it('returns removedTargets for parts not emitted', () => {
      const threadingProfile = {
        defaultStyle: 'commentsExtended',
        mixed: false,
        fileSet: {
          hasCommentsExtended: true,
          hasCommentsExtensible: false,
          hasCommentsIds: true,
        },
      };

      const result = prepareCommentsXmlFilesForExport({
        convertedXml: makeConvertedXml(),
        defs,
        commentsWithParaIds,
        exportType: 'external',
        threadingProfile,
      });

      expect(result.removedTargets).toContain('commentsExtensible.xml');
      expect(result.removedTargets).not.toContain('comments.xml');
      expect(result.removedTargets).not.toContain('commentsIds.xml');
      expect(result.removedTargets).not.toContain('commentsExtended.xml');
    });

    it('returns all targets as removed for clean export', () => {
      const result = prepareCommentsXmlFilesForExport({
        convertedXml: makeConvertedXml(),
        defs,
        commentsWithParaIds,
        exportType: 'clean',
        threadingProfile: null,
      });

      expect(result.removedTargets).toHaveLength(4);
      expect(result.removedTargets).toContain('comments.xml');
      expect(result.removedTargets).toContain('commentsExtended.xml');
      expect(result.removedTargets).toContain('commentsIds.xml');
      expect(result.removedTargets).toContain('commentsExtensible.xml');
    });
  });

  describe('zero-comments cleanup', () => {
    it('removes all comment files when there are no comments', () => {
      const threadingProfile = {
        defaultStyle: 'commentsExtended',
        mixed: false,
        fileSet: {
          hasCommentsExtended: true,
          hasCommentsExtensible: true,
          hasCommentsIds: true,
        },
      };

      const result = prepareCommentsXmlFilesForExport({
        convertedXml: makeConvertedXml(),
        defs: [],
        commentsWithParaIds: [],
        exportType: 'external',
        threadingProfile,
      });

      expect(result.documentXml['word/comments.xml']).toBeUndefined();
      expect(result.documentXml['word/commentsExtended.xml']).toBeUndefined();
      expect(result.documentXml['word/commentsIds.xml']).toBeUndefined();
      expect(result.documentXml['word/commentsExtensible.xml']).toBeUndefined();
      expect(result.removedTargets).toHaveLength(4);
      expect(result.relationships).toHaveLength(0);
    });
  });

  describe('warnings', () => {
    it('warns about partial file-set', () => {
      const threadingProfile = {
        defaultStyle: 'commentsExtended',
        mixed: false,
        fileSet: {
          hasCommentsExtended: true,
          hasCommentsExtensible: false,
          hasCommentsIds: true,
        },
      };

      const result = prepareCommentsXmlFilesForExport({
        convertedXml: makeConvertedXml(),
        defs,
        commentsWithParaIds,
        exportType: 'external',
        threadingProfile,
      });

      expect(result.warnings.some((w) => w.includes('Partial comment file-set'))).toBe(true);
    });

    it('does not warn on clean export', () => {
      const result = prepareCommentsXmlFilesForExport({
        convertedXml: makeConvertedXml(),
        defs,
        commentsWithParaIds,
        exportType: 'clean',
        threadingProfile: null,
      });

      expect(result.warnings).toHaveLength(0);
    });

    it('warns when all comments are removed and profile had files', () => {
      const threadingProfile = {
        defaultStyle: 'commentsExtended',
        mixed: false,
        fileSet: {
          hasCommentsExtended: true,
          hasCommentsExtensible: true,
          hasCommentsIds: true,
        },
      };

      const result = prepareCommentsXmlFilesForExport({
        convertedXml: makeConvertedXml(),
        defs: [],
        commentsWithParaIds: [],
        exportType: 'external',
        threadingProfile,
      });

      expect(result.warnings.some((w) => w.includes('All comments removed'))).toBe(true);
    });

    it('warns when comments exist but no threading profile', () => {
      const result = prepareCommentsXmlFilesForExport({
        convertedXml: makeConvertedXml(),
        defs,
        commentsWithParaIds,
        exportType: 'external',
        threadingProfile: null,
      });

      expect(result.warnings.some((w) => w.includes('no threading profile'))).toBe(true);
    });
  });

  describe('full file-set', () => {
    it('populates all four files when all are present', () => {
      const threadingProfile = {
        defaultStyle: 'commentsExtended',
        mixed: false,
        fileSet: {
          hasCommentsExtended: true,
          hasCommentsExtensible: true,
          hasCommentsIds: true,
        },
      };

      const result = prepareCommentsXmlFilesForExport({
        convertedXml: makeConvertedXml(),
        defs,
        commentsWithParaIds,
        exportType: 'external',
        threadingProfile,
      });

      expect(result.documentXml['word/comments.xml']).toBeDefined();
      expect(result.documentXml['word/commentsExtended.xml']).toBeDefined();
      expect(result.documentXml['word/commentsIds.xml']).toBeDefined();
      expect(result.documentXml['word/commentsExtensible.xml']).toBeDefined();

      // All four relationships should be present
      expect(result.relationships).toHaveLength(4);
      expect(result.removedTargets).toHaveLength(0);
    });
  });
});

// =============================================================================
// removeCommentsFilesFromConvertedXml
// =============================================================================

describe('removeCommentsFilesFromConvertedXml', () => {
  it('does not mutate the original object', () => {
    const original = {
      'word/comments.xml': { elements: [] },
      'word/commentsExtended.xml': { elements: [] },
      'word/commentsExtensible.xml': { elements: [] },
      'word/commentsIds.xml': { elements: [] },
      'word/document.xml': { elements: [] },
    };
    const result = removeCommentsFilesFromConvertedXml(original);

    // Original still has the keys
    expect(original['word/comments.xml']).toBeDefined();

    // Result does not
    expect(result['word/comments.xml']).toBeUndefined();
    expect(result['word/commentsExtended.xml']).toBeUndefined();
    expect(result['word/commentsExtensible.xml']).toBeUndefined();
    expect(result['word/commentsIds.xml']).toBeUndefined();

    // Non-comment files preserved
    expect(result['word/document.xml']).toBeDefined();
  });
});

// =============================================================================
// updateCommentsExtendedXml (existing tests)
// =============================================================================

describe('updateCommentsExtendedXml', () => {
  it('uses threadingParentCommentId for threaded replies when parent is tracked', () => {
    const comments = [
      {
        commentId: 'parent-comment',
        commentParaId: 'PARENT-PARA',
        trackedChange: true,
        resolvedTime: null,
      },
      {
        commentId: 'child-comment',
        commentParaId: 'CHILD-PARA',
        parentCommentId: 'tracked-change-id',
        threadingParentCommentId: 'parent-comment',
        resolvedTime: null,
      },
    ];

    const commentsExtendedXml = {
      elements: [{ elements: [] }],
    };

    const profile = {
      defaultStyle: 'commentsExtended',
      fileSet: {
        hasCommentsExtended: true,
        hasCommentsExtensible: true,
        hasCommentsIds: true,
      },
    };

    const result = updateCommentsExtendedXml(comments, commentsExtendedXml, profile);
    const entries = result.elements[0].elements;
    const childEntry = entries.find((entry) => entry.attributes['w15:paraId'] === 'CHILD-PARA');

    expect(childEntry.attributes['w15:paraIdParent']).toBe('PARENT-PARA');
  });

  it('sets paraIdParent for range-based threads to preserve Word threading', () => {
    const comments = [
      {
        commentId: 'parent-comment',
        commentParaId: 'PARENT-PARA',
        resolvedTime: null,
        threadingMethod: 'range-based',
        originalXmlStructure: { hasCommentsExtended: false },
      },
      {
        commentId: 'child-comment',
        commentParaId: 'CHILD-PARA',
        parentCommentId: 'parent-comment',
        resolvedTime: null,
        threadingMethod: 'range-based',
        originalXmlStructure: { hasCommentsExtended: false },
      },
    ];

    const commentsExtendedXml = {
      elements: [{ elements: [] }],
    };

    const profile = {
      defaultStyle: 'range-based',
      mixed: false,
      fileSet: {
        hasCommentsExtended: false,
        hasCommentsExtensible: false,
        hasCommentsIds: false,
      },
    };

    const result = updateCommentsExtendedXml(comments, commentsExtendedXml, profile);
    const entries = result.elements[0].elements;
    const childEntry = entries.find((entry) => entry.attributes['w15:paraId'] === 'CHILD-PARA');

    expect(childEntry.attributes['w15:paraIdParent']).toBe('PARENT-PARA');
  });
});

// =============================================================================
// updateCommentsXml (existing tests)
// =============================================================================

describe('updateCommentsXml', () => {
  it('stamps w14:paraId on the final paragraph for multi-paragraph comments', () => {
    const commentDef = {
      type: 'element',
      name: 'w:comment',
      attributes: {
        'w:id': '0',
        'w:author': 'Author',
        'w:date': '2025-01-01T00:00:00Z',
        'w:initials': 'A',
        'w15:paraId': 'ABC12345',
      },
      elements: [
        { type: 'element', name: 'w:p', attributes: {}, elements: [] },
        { type: 'element', name: 'w:p', attributes: {}, elements: [] },
      ],
    };
    const commentsXml = {
      elements: [{ elements: [] }],
    };

    const result = updateCommentsXml([commentDef], commentsXml);
    const updatedComment = result.elements[0].elements[0];
    const lastParagraph = updatedComment.elements[updatedComment.elements.length - 1];

    expect(lastParagraph.attributes['w14:paraId']).toBe('ABC12345');
  });
});
