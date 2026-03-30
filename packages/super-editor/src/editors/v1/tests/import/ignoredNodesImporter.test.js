import { defaultNodeListHandler } from '@converter/v2/importer/docxImporter.js';
import { pruneIgnoredNodes } from '@converter/v2/importer/ignoredNodes.js';

describe('ignored nodes during import', () => {
  it('drops nodes defined in the ignore list', () => {
    const nodeListHandler = defaultNodeListHandler();
    const result = nodeListHandler.handler({
      nodes: [{ name: 'w:proofErr' }],
      docx: {},
      converter: {},
      editor: {},
      nodeListHandler,
      lists: {},
    });
    expect(result).toEqual([]);
  });

  it('recursively removes ignored nodes', () => {
    const tree = [
      {
        name: 'w:p',
        elements: [
          {
            name: 'w:r',
            elements: [
              { name: 'w:proofErr', elements: [{ name: 'w:t', elements: [] }] },
              { name: 'w:t', elements: [] },
            ],
          },
        ],
      },
    ];
    const pruned = pruneIgnoredNodes(tree);
    expect(pruned[0].elements[0].elements).toHaveLength(1);
    expect(pruned[0].elements[0].elements[0].name).toBe('w:t');
  });
});
