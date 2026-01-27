import { updateCommentsExtendedXml, updateCommentsIdsAndExtensible, toIsoNoFractional } from './commentsExporter.js';

describe('updateCommentsIdsAndExtensible', () => {
  const comments = [
    {
      commentId: '4cfaa5f7-252f-4e4a-be19-14dc6157e84d',
      creatorName: 'Mary Jones',
      createdTime: 1764111660000,
      importedAuthor: {
        name: 'Mary Jones (imported)',
      },
      isInternal: false,
      commentText: '<span style="font-size: 10pt;">Here is a comment</span>',
      commentParaId: '126B0C7F',
    },
  ];

  const commentsIds = {
    declaration: {}, // Omitting for readability
    elements: [
      {
        type: 'element',
        name: 'w16cid:commentsIds',
        attributes: {}, // Omitting for readability
        elements: [],
      },
    ],
  };

  const extensible = {
    declaration: {}, // Omitting for readability
    elements: [
      {
        type: 'element',
        name: 'w16cex:commentsExtensible',
        attributes: {}, // Omitting for readability
        elements: [],
      },
    ],
  };

  it('should update the comments ids and extensible when created time is provided', () => {
    const result = updateCommentsIdsAndExtensible(comments, commentsIds, extensible);
    const elements = result.extensibleUpdated.elements[0].elements;
    expect(elements.length).toEqual(1);
    expect(elements[0].type).toEqual('element');
    expect(elements[0].name).toEqual('w16cex:commentExtensible');
    expect(elements[0].attributes['w16cex:durableId']).toEqual(expect.any(String));
    expect(elements[0].attributes['w16cex:dateUtc']).toEqual(toIsoNoFractional(comments[0].createdTime));
  });

  it('should update the comments ids and extensible when created time is not provided', () => {
    const commentsWithoutCreatedTime = comments.map((comment) => {
      return {
        ...comment,
        createdTime: undefined,
      };
    });
    const result = updateCommentsIdsAndExtensible(commentsWithoutCreatedTime, commentsIds, extensible);
    const elements = result.extensibleUpdated.elements[0].elements;
    expect(elements.length).toEqual(1);
    expect(elements[0].type).toEqual('element');
    expect(elements[0].name).toEqual('w16cex:commentExtensible');
    expect(elements[0].attributes['w16cex:durableId']).toEqual(expect.any(String));
    expect(elements[0].attributes['w16cex:dateUtc']).toEqual(toIsoNoFractional(Date.now()));
  });
});

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
