import { describe, it, expect, mock, beforeEach } from 'bun:test';
// @ts-check
const { createNumberingPlugin } = await import('./numberingPlugin.js');
import { createNumberingManager } from './NumberingManager.js';
import { ListHelpers } from '@helpers/list-numbering-helpers.js';
import { generateOrderedListIndex } from '@helpers/orderedListUtils.js';
import { docxNumberingHelpers } from '@core/super-converter/v2/importer/listImporter.js';

mock.module('prosemirror-state', () => ({
  Plugin: class {
    constructor(spec) {
      this.spec = spec;
    }
  },
  PluginKey: class {
    constructor(name) {
      this.key = name;
    }
  },
}));

mock.module('./NumberingManager.js', () => ({
  createNumberingManager: mock(),
}));

mock.module('@helpers/list-numbering-helpers.js', () => ({
  ListHelpers: {
    getAllListDefinitions: mock(),
    getListDefinitionDetails: mock(),
  },
}));

mock.module('@helpers/orderedListUtils.js', () => ({
  generateOrderedListIndex: mock(),
}));

mock.module('@core/super-converter/v2/importer/listImporter.js', () => ({
  docxNumberingHelpers: {
    normalizeLvlTextChar: mock(),
  },
}));

describe('numberingPlugin', () => {
  /** @type {{ setStartSettings: ReturnType<typeof mock>, enableCache: ReturnType<typeof mock>, disableCache: ReturnType<typeof mock>, calculateCounter: ReturnType<typeof mock>, setCounter: ReturnType<typeof mock>, calculatePath: ReturnType<typeof mock> }} */
  let numberingManager;

  const createEditor = () => ({
    converter: {
      numbering: {
        definitions: {},
        abstracts: {},
      },
      convertedXml: {
        'word/styles.xml': {
          elements: [{ elements: [] }],
        },
      },
    },
    on: mock(),
    off: mock(),
  });

  const createTransaction = () => {
    const tr = {
      docChanged: false,
      setMeta: mock(),
      setNodeAttribute: mock(() => {
        tr.docChanged = true;
        return tr;
      }),
    };
    return tr;
  };

  const makeDoc = (nodes) => ({
    descendants: (cb) => {
      nodes.forEach(({ node, pos }) => {
        cb(node, pos);
      });
    },
    resolve: mock((pos) => {
      const match = nodes.find((entry) => entry.pos === pos);
      const targetNode = match?.node || { type: { name: 'paragraph' }, attrs: { paragraphProperties: {} } };
      return {
        depth: 1,
        node: () => targetNode,
        before: () => pos,
        start: () => pos,
      };
    }),
  });

  beforeEach(() => {
    numberingManager = {
      setStartSettings: mock(),
      enableCache: mock(),
      disableCache: mock(),
      calculateCounter: mock().mockReturnValue(1),
      setCounter: mock(),
      calculatePath: mock().mockReturnValue([1]),
    };
    createNumberingManager.mockReturnValue(numberingManager);
    ListHelpers.getAllListDefinitions.mockReturnValue({});
  });

  it('initializes start settings for every list definition', () => {
    ListHelpers.getAllListDefinitions.mockReturnValue({
      12: {
        0: { start: '3' },
        1: { start: '2' },
      },
      20: {
        0: {},
      },
    });

    createNumberingPlugin(createEditor());

    expect(numberingManager.setStartSettings).toHaveBeenCalledWith('12', 0, 3, undefined, undefined);
    expect(numberingManager.setStartSettings).toHaveBeenCalledWith('12', 1, 2, undefined, undefined);
    expect(numberingManager.setStartSettings).toHaveBeenCalledWith('20', 0, 1, undefined, undefined);
  });

  it('refreshes start settings when list definitions change', () => {
    ListHelpers.getAllListDefinitions.mockReturnValueOnce({});
    ListHelpers.getAllListDefinitions.mockReturnValueOnce({
      42: {
        0: { start: '5' },
      },
    });

    const editor = createEditor();
    createNumberingPlugin(editor);
    const listChangeHandler = editor.on.mock.calls.find(([event]) => event === 'list-definitions-change')[1];

    expect(typeof listChangeHandler).toBe('function');
    numberingManager.setStartSettings.mockClear();

    listChangeHandler();

    expect(numberingManager.setStartSettings).toHaveBeenCalledWith('42', 0, 5, undefined, undefined);
  });

  it('unsubscribes the list definition listener on destroy', () => {
    const editor = createEditor();
    createNumberingPlugin(editor);

    const listChangeHandler = editor.on.mock.calls.find(([event]) => event === 'list-definitions-change')[1];
    const destroyHandler = editor.on.mock.calls.find(([event]) => event === 'destroy')[1];

    expect(typeof listChangeHandler).toBe('function');
    expect(typeof destroyHandler).toBe('function');

    destroyHandler();

    expect(editor.off).toHaveBeenCalledWith('list-definitions-change', listChangeHandler);
    expect(editor.off).toHaveBeenCalledWith('destroy', destroyHandler);
  });

  it('updates list rendering data for ordered lists when the doc changes', () => {
    const editor = createEditor();
    const plugin = createNumberingPlugin(editor);
    const { appendTransaction } = plugin.spec;

    const targetParagraph = {
      type: { name: 'paragraph' },
      attrs: {
        paragraphProperties: {
          numberingProperties: { numId: 1, ilvl: 0 },
        },
      },
    };
    const doc = makeDoc([
      { node: targetParagraph, pos: 5 },
      { node: { type: { name: 'text' }, attrs: {} }, pos: 10 },
    ]);

    const tr = createTransaction();
    const transactions = [{ docChanged: true, getMeta: mock().mockReturnValue(false) }];
    const newState = { doc, tr };

    numberingManager.calculateCounter.mockReturnValue(4);
    numberingManager.calculatePath.mockReturnValue([2, 4]);
    generateOrderedListIndex.mockReturnValue('IV.');
    ListHelpers.getListDefinitionDetails.mockReturnValue({
      lvlText: '%1.',
      customFormat: null,
      listNumberingType: 'decimal',
      suffix: '.',
      justification: 'left',
      abstractId: 'abstract1',
    });

    const result = appendTransaction(transactions, {}, newState);

    expect(numberingManager.enableCache).toHaveBeenCalled();
    expect(numberingManager.disableCache).toHaveBeenCalled();
    expect(tr.setMeta).toHaveBeenCalledWith('orderedListSync', true);
    expect(numberingManager.calculateCounter).toHaveBeenCalledWith(1, 0, 5, 'abstract1');
    expect(numberingManager.setCounter).toHaveBeenCalledWith(1, 0, 5, 4, 'abstract1');
    expect(numberingManager.calculatePath).toHaveBeenCalledWith(1, 0, 5);
    expect(generateOrderedListIndex).toHaveBeenCalledWith({
      listLevel: [2, 4],
      lvlText: '%1.',
      listNumberingType: 'decimal',
      customFormat: null,
    });
    expect(tr.setNodeAttribute).toHaveBeenCalledWith(5, 'listRendering', {
      markerText: 'IV.',
      suffix: '.',
      justification: 'left',
      path: [2, 4],
      numberingType: 'decimal',
    });
    expect(result).toBe(tr);
  });

  it('uses the bullet marker helper for bullet lists', () => {
    const editor = createEditor();
    const plugin = createNumberingPlugin(editor);
    const { appendTransaction } = plugin.spec;

    const bulletParagraph = {
      type: { name: 'paragraph' },
      attrs: {
        paragraphProperties: {
          numberingProperties: { numId: 9, ilvl: 2 },
        },
      },
    };

    const doc = makeDoc([{ node: bulletParagraph, pos: 12 }]);
    const tr = createTransaction();
    const transactions = [{ docChanged: true, getMeta: mock().mockReturnValue(false) }];

    numberingManager.calculateCounter.mockReturnValue(1);
    numberingManager.calculatePath.mockReturnValue([1, 1, 1]);
    docxNumberingHelpers.normalizeLvlTextChar.mockReturnValue('•');
    ListHelpers.getListDefinitionDetails.mockReturnValue({
      lvlText: 'o',
      customFormat: null,
      listNumberingType: 'bullet',
      suffix: '\t',
      justification: 'center',
    });

    const result = appendTransaction(transactions, {}, { doc, tr });

    expect(generateOrderedListIndex).not.toHaveBeenCalled();
    expect(docxNumberingHelpers.normalizeLvlTextChar).toHaveBeenCalledWith('o');
    expect(tr.setNodeAttribute).toHaveBeenCalledWith(12, 'listRendering', {
      markerText: '•',
      suffix: '\t',
      justification: 'center',
      path: [1, 1, 1],
      numberingType: 'bullet',
    });
    expect(result).toBe(tr);
  });

  it('clears list rendering when the definition details are missing', () => {
    const editor = createEditor();
    const plugin = createNumberingPlugin(editor);
    const { appendTransaction } = plugin.spec;

    const paragraph = {
      type: { name: 'paragraph' },
      attrs: {
        paragraphProperties: {
          numberingProperties: { numId: 2, ilvl: 0 },
        },
      },
    };

    const doc = makeDoc([{ node: paragraph, pos: 7 }]);
    const tr = createTransaction();
    const transactions = [{ docChanged: true, getMeta: mock().mockReturnValue(false) }];

    ListHelpers.getListDefinitionDetails.mockReturnValue(null);

    const result = appendTransaction(transactions, {}, { doc, tr });

    expect(tr.setNodeAttribute).toHaveBeenCalledWith(7, 'listRendering', null);
    expect(generateOrderedListIndex).not.toHaveBeenCalled();
    expect(docxNumberingHelpers.normalizeLvlTextChar).not.toHaveBeenCalled();
    expect(numberingManager.calculateCounter).not.toHaveBeenCalled();
    expect(result).toBe(tr);
  });

  it('returns null when the change originated from the plugin itself', () => {
    const editor = createEditor();
    const plugin = createNumberingPlugin(editor);
    const { appendTransaction } = plugin.spec;

    const transactions = [{ docChanged: true, getMeta: mock().mockReturnValue(true) }];
    const doc = makeDoc([]);
    const tr = createTransaction();

    const result = appendTransaction(transactions, {}, { doc, tr });

    expect(result).toBeNull();
    expect(tr.setMeta).not.toHaveBeenCalled();
  });

  describe('bumpBlockRev', () => {
    it('increments numeric sdBlockRev when listRendering is updated', () => {
      const editor = createEditor();
      const plugin = createNumberingPlugin(editor);
      const { appendTransaction } = plugin.spec;

      const paragraph = {
        type: { name: 'paragraph' },
        attrs: {
          sdBlockRev: 5,
          listRendering: { markerText: 'old' },
          paragraphProperties: {
            numberingProperties: { numId: 1, ilvl: 0 },
          },
        },
      };

      const doc = makeDoc([{ node: paragraph, pos: 3 }]);
      const tr = createTransaction();
      const transactions = [{ docChanged: true, getMeta: mock().mockReturnValue(false) }];

      numberingManager.calculateCounter.mockReturnValue(1);
      numberingManager.calculatePath.mockReturnValue([1]);
      generateOrderedListIndex.mockReturnValue('1.');
      ListHelpers.getListDefinitionDetails.mockReturnValue({
        lvlText: '%1.',
        listNumberingType: 'decimal',
        suffix: '.',
        justification: 'left',
        abstractId: 'a1',
      });

      appendTransaction(transactions, {}, { doc, tr });

      expect(tr.setNodeAttribute).toHaveBeenCalledWith(3, 'listRendering', expect.any(Object));
      expect(tr.setNodeAttribute).toHaveBeenCalledWith(3, 'sdBlockRev', 6);
    });

    it('increments sdBlockRev when listRendering is cleared due to missing definition', () => {
      const editor = createEditor();
      const plugin = createNumberingPlugin(editor);
      const { appendTransaction } = plugin.spec;

      const paragraph = {
        type: { name: 'paragraph' },
        attrs: {
          sdBlockRev: 10,
          paragraphProperties: {
            numberingProperties: { numId: 2, ilvl: 0 },
          },
        },
      };

      const doc = makeDoc([{ node: paragraph, pos: 5 }]);
      const tr = createTransaction();
      const transactions = [{ docChanged: true, getMeta: mock().mockReturnValue(false) }];

      ListHelpers.getListDefinitionDetails.mockReturnValue(null);

      appendTransaction(transactions, {}, { doc, tr });

      expect(tr.setNodeAttribute).toHaveBeenCalledWith(5, 'listRendering', null);
      expect(tr.setNodeAttribute).toHaveBeenCalledWith(5, 'sdBlockRev', 11);
    });

    it('parses string sdBlockRev values and increments correctly', () => {
      const editor = createEditor();
      const plugin = createNumberingPlugin(editor);
      const { appendTransaction } = plugin.spec;

      const paragraph = {
        type: { name: 'paragraph' },
        attrs: {
          sdBlockRev: '7',
          listRendering: null,
          paragraphProperties: {
            numberingProperties: { numId: 1, ilvl: 0 },
          },
        },
      };

      const doc = makeDoc([{ node: paragraph, pos: 2 }]);
      const tr = createTransaction();
      const transactions = [{ docChanged: true, getMeta: mock().mockReturnValue(false) }];

      numberingManager.calculateCounter.mockReturnValue(1);
      numberingManager.calculatePath.mockReturnValue([1]);
      generateOrderedListIndex.mockReturnValue('1.');
      ListHelpers.getListDefinitionDetails.mockReturnValue({
        lvlText: '%1.',
        listNumberingType: 'decimal',
        suffix: '.',
        justification: 'left',
        abstractId: 'a1',
      });

      appendTransaction(transactions, {}, { doc, tr });

      expect(tr.setNodeAttribute).toHaveBeenCalledWith(2, 'sdBlockRev', 8);
    });

    it('does not bump sdBlockRev when listRendering has not changed', () => {
      const editor = createEditor();
      const plugin = createNumberingPlugin(editor);
      const { appendTransaction } = plugin.spec;

      const existingRendering = {
        markerText: '1.',
        suffix: '.',
        justification: 'left',
        path: [1],
        numberingType: 'decimal',
      };

      const paragraph = {
        type: { name: 'paragraph' },
        attrs: {
          sdBlockRev: 3,
          listRendering: existingRendering,
          paragraphProperties: {
            numberingProperties: { numId: 1, ilvl: 0 },
          },
        },
      };

      const doc = makeDoc([{ node: paragraph, pos: 4 }]);
      const tr = createTransaction();
      const transactions = [{ docChanged: true, getMeta: mock().mockReturnValue(false) }];

      numberingManager.calculateCounter.mockReturnValue(1);
      numberingManager.calculatePath.mockReturnValue([1]);
      generateOrderedListIndex.mockReturnValue('1.');
      ListHelpers.getListDefinitionDetails.mockReturnValue({
        lvlText: '%1.',
        listNumberingType: 'decimal',
        suffix: '.',
        justification: 'left',
        abstractId: 'a1',
      });

      appendTransaction(transactions, {}, { doc, tr });

      // setNodeAttribute should not be called at all since listRendering is unchanged
      expect(tr.setNodeAttribute).not.toHaveBeenCalled();
    });

    it('does not bump sdBlockRev when it is undefined', () => {
      const editor = createEditor();
      const plugin = createNumberingPlugin(editor);
      const { appendTransaction } = plugin.spec;

      const paragraph = {
        type: { name: 'paragraph' },
        attrs: {
          // no sdBlockRev
          listRendering: null,
          paragraphProperties: {
            numberingProperties: { numId: 1, ilvl: 0 },
          },
        },
      };

      const doc = makeDoc([{ node: paragraph, pos: 6 }]);
      const tr = createTransaction();
      const transactions = [{ docChanged: true, getMeta: mock().mockReturnValue(false) }];

      numberingManager.calculateCounter.mockReturnValue(1);
      numberingManager.calculatePath.mockReturnValue([1]);
      generateOrderedListIndex.mockReturnValue('1.');
      ListHelpers.getListDefinitionDetails.mockReturnValue({
        lvlText: '%1.',
        listNumberingType: 'decimal',
        suffix: '.',
        justification: 'left',
        abstractId: 'a1',
      });

      appendTransaction(transactions, {}, { doc, tr });

      // Should set listRendering but not sdBlockRev since it was undefined
      expect(tr.setNodeAttribute).toHaveBeenCalledWith(6, 'listRendering', expect.any(Object));
      expect(tr.setNodeAttribute).not.toHaveBeenCalledWith(6, 'sdBlockRev', expect.anything());
    });
  });

  describe('null lvlText crash prevention', () => {
    it('does not crash when ordered list has null lvlText', () => {
      const editor = createEditor();
      const plugin = createNumberingPlugin(editor);
      const { appendTransaction } = plugin.spec;

      const paragraph = {
        type: { name: 'paragraph' },
        attrs: {
          listRendering: null,
          paragraphProperties: {
            numberingProperties: { numId: 1, ilvl: 0 },
          },
        },
      };

      const doc = makeDoc([{ node: paragraph, pos: 5 }]);
      const tr = createTransaction();
      const transactions = [{ docChanged: true, getMeta: mock().mockReturnValue(false) }];

      numberingManager.calculateCounter.mockReturnValue(1);
      numberingManager.calculatePath.mockReturnValue([1]);
      generateOrderedListIndex.mockReturnValue(null);
      ListHelpers.getListDefinitionDetails.mockReturnValue({
        lvlText: null,
        customFormat: null,
        listNumberingType: 'decimal',
        suffix: '.',
        justification: 'left',
        abstractId: 'a1',
      });

      const result = appendTransaction(transactions, {}, { doc, tr });

      expect(tr.setNodeAttribute).toHaveBeenCalledWith(5, 'listRendering', {
        markerText: '',
        suffix: '.',
        justification: 'left',
        path: [1],
        numberingType: 'decimal',
      });
      expect(result).toBe(tr);
    });

    it('produces empty marker for bullet list with null lvlText', () => {
      const editor = createEditor();
      const plugin = createNumberingPlugin(editor);
      const { appendTransaction } = plugin.spec;

      const paragraph = {
        type: { name: 'paragraph' },
        attrs: {
          listRendering: null,
          paragraphProperties: {
            numberingProperties: { numId: 1, ilvl: 0 },
          },
        },
      };

      const doc = makeDoc([{ node: paragraph, pos: 5 }]);
      const tr = createTransaction();
      const transactions = [{ docChanged: true, getMeta: mock().mockReturnValue(false) }];

      numberingManager.calculateCounter.mockReturnValue(1);
      numberingManager.calculatePath.mockReturnValue([1]);
      docxNumberingHelpers.normalizeLvlTextChar.mockReturnValue(undefined);
      ListHelpers.getListDefinitionDetails.mockReturnValue({
        lvlText: null,
        customFormat: null,
        listNumberingType: 'bullet',
        suffix: '\t',
        justification: 'left',
        abstractId: 'a1',
      });

      const result = appendTransaction(transactions, {}, { doc, tr });

      expect(tr.setNodeAttribute).toHaveBeenCalledWith(5, 'listRendering', {
        markerText: '',
        suffix: '\t',
        justification: 'left',
        path: [1],
        numberingType: 'bullet',
      });
      expect(result).toBe(tr);
    });

    it('ensures disableCache runs even if descendants scan throws', () => {
      const editor = createEditor();
      const plugin = createNumberingPlugin(editor);
      const { appendTransaction } = plugin.spec;

      const doc = {
        descendants: mock(() => {
          throw new Error('simulated crash');
        }),
        resolve: mock(),
      };
      const tr = createTransaction();
      const transactions = [{ docChanged: true, getMeta: mock().mockReturnValue(false) }];

      expect(() => appendTransaction(transactions, {}, { doc, tr })).toThrow('simulated crash');
      expect(numberingManager.enableCache).toHaveBeenCalled();
      expect(numberingManager.disableCache).toHaveBeenCalled();
    });
  });
});
