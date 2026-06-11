import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleStructuredContentNode } from './handle-structured-content-node';
import { parseAnnotationMarks } from './handle-annotation-node';
import { defaultNodeListHandler } from '../../../../../v2/importer/docxImporter.js';
import { initTestEditor } from '@tests/helpers/helpers.js';

// Mock dependencies
vi.mock('./handle-annotation-node', () => ({
  parseAnnotationMarks: vi.fn(),
}));

describe('handleStructuredContentNode', () => {
  const mockNodeListHandler = {
    handler: vi.fn(() => [{ type: 'text', text: 'translated content' }]),
  };

  const createNode = (sdtPrElements = [], sdtContentElements = []) => ({
    name: 'w:sdt',
    elements: [
      {
        name: 'w:sdtPr',
        elements: sdtPrElements,
      },
      {
        name: 'w:sdtContent',
        elements: sdtContentElements,
      },
    ],
  });

  beforeEach(() => {
    vi.clearAllMocks();
    parseAnnotationMarks.mockReturnValue({ marks: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when nodes array is empty', () => {
    const params = { nodes: [], nodeListHandler: mockNodeListHandler };
    const result = handleStructuredContentNode(params);

    expect(result).toBeNull();
  });

  it('returns null when first node is not w:sdt', () => {
    const params = {
      nodes: [{ name: 'w:p' }],
      nodeListHandler: mockNodeListHandler,
    };
    const result = handleStructuredContentNode(params);

    expect(result).toBeNull();
  });

  it('returns null when sdtContent is missing', () => {
    const node = {
      name: 'w:sdt',
      elements: [
        {
          name: 'w:sdtPr',
          elements: [],
        },
      ],
    };

    const params = {
      nodes: [node],
      nodeListHandler: mockNodeListHandler,
    };

    const result = handleStructuredContentNode(params);

    expect(result).toBeNull();
  });

  it('returns structuredContent type when no paragraph found', () => {
    const sdtContentElements = [
      { name: 'w:r', text: 'some text' },
      { name: 'w:t', text: 'more text' },
    ];
    const node = createNode([], sdtContentElements);

    const params = {
      nodes: [node],
      nodeListHandler: mockNodeListHandler,
      path: [{ name: 'w:p' }],
    };

    parseAnnotationMarks.mockReturnValue({ marks: [{ type: 'bold' }] });

    const result = handleStructuredContentNode(params);

    expect(result.type).toBe('structuredContent');
    expect(result.content).toEqual([{ type: 'text', text: 'translated content' }]);
    expect(result.marks).toEqual([{ type: 'bold' }]);
  });

  it('returns structuredContentBlock type when paragraph found', () => {
    const sdtContentElements = [
      { name: 'w:p', elements: [{ name: 'w:t', text: 'paragraph text' }] },
      { name: 'w:r', text: 'some text' },
    ];
    const node = createNode([], sdtContentElements);

    const params = {
      nodes: [node],
      nodeListHandler: mockNodeListHandler,
    };

    parseAnnotationMarks.mockReturnValue({ marks: [] });

    const result = handleStructuredContentNode(params);

    expect(result.type).toBe('structuredContentBlock');
  });

  it('returns structuredContentBlock when content is a block field node (SD-3005)', () => {
    // A content control wrapping a block field (e.g. BIBLIOGRAPHY) has no
    // direct w:p — after field preprocessing its only child is an sd:bibliography
    // block node. Classifying it inline (structuredContent) puts a block node
    // inside an inline node and crashes the editor; it must be block.
    const sdtContentElements = [{ name: 'sd:bibliography', attributes: { instruction: 'BIBLIOGRAPHY' }, elements: [] }];
    const node = createNode([], sdtContentElements);

    parseAnnotationMarks.mockReturnValue({ marks: [] });
    const result = handleStructuredContentNode({ nodes: [node], nodeListHandler: mockNodeListHandler });

    expect(result.type).toBe('structuredContentBlock');
  });

  it('includes sdtPr in result attrs', () => {
    const sdtPrElements = [{ name: 'w:tag', attributes: { 'w:val': 'test' } }];
    const node = createNode(sdtPrElements, [{ name: 'w:r', text: 'content' }]);
    const sdtPr = node.elements.find((el) => el.name === 'w:sdtPr');

    const params = {
      nodes: [node],
      nodeListHandler: mockNodeListHandler,
    };

    parseAnnotationMarks.mockReturnValue({ marks: [] });

    const result = handleStructuredContentNode(params);

    expect(result.attrs.sdtPr).toEqual(sdtPr);
  });

  describe('w:lock parsing', () => {
    it('parses sdtLocked lock mode', () => {
      const sdtPrElements = [{ name: 'w:lock', attributes: { 'w:val': 'sdtLocked' } }];
      const node = createNode(sdtPrElements, [{ name: 'w:r', text: 'content' }]);

      const params = {
        nodes: [node],
        nodeListHandler: mockNodeListHandler,
      };

      parseAnnotationMarks.mockReturnValue({ marks: [] });

      const result = handleStructuredContentNode(params);

      expect(result.attrs.lockMode).toBe('sdtLocked');
    });

    it('parses contentLocked lock mode', () => {
      const sdtPrElements = [{ name: 'w:lock', attributes: { 'w:val': 'contentLocked' } }];
      const node = createNode(sdtPrElements, [{ name: 'w:r', text: 'content' }]);

      const params = {
        nodes: [node],
        nodeListHandler: mockNodeListHandler,
      };

      parseAnnotationMarks.mockReturnValue({ marks: [] });

      const result = handleStructuredContentNode(params);

      expect(result.attrs.lockMode).toBe('contentLocked');
    });

    it('parses sdtContentLocked lock mode', () => {
      const sdtPrElements = [{ name: 'w:lock', attributes: { 'w:val': 'sdtContentLocked' } }];
      const node = createNode(sdtPrElements, [{ name: 'w:r', text: 'content' }]);

      const params = {
        nodes: [node],
        nodeListHandler: mockNodeListHandler,
      };

      parseAnnotationMarks.mockReturnValue({ marks: [] });

      const result = handleStructuredContentNode(params);

      expect(result.attrs.lockMode).toBe('sdtContentLocked');
    });

    it('defaults to unlocked when w:lock element is missing', () => {
      const sdtPrElements = [{ name: 'w:tag', attributes: { 'w:val': 'test' } }];
      const node = createNode(sdtPrElements, [{ name: 'w:r', text: 'content' }]);

      const params = {
        nodes: [node],
        nodeListHandler: mockNodeListHandler,
      };

      parseAnnotationMarks.mockReturnValue({ marks: [] });

      const result = handleStructuredContentNode(params);

      expect(result.attrs.lockMode).toBe('unlocked');
    });

    it('defaults to unlocked for invalid lock mode values', () => {
      const sdtPrElements = [{ name: 'w:lock', attributes: { 'w:val': 'invalidMode' } }];
      const node = createNode(sdtPrElements, [{ name: 'w:r', text: 'content' }]);

      const params = {
        nodes: [node],
        nodeListHandler: mockNodeListHandler,
      };

      parseAnnotationMarks.mockReturnValue({ marks: [] });

      const result = handleStructuredContentNode(params);

      expect(result.attrs.lockMode).toBe('unlocked');
    });

    it('parses unlocked lock mode explicitly', () => {
      const sdtPrElements = [{ name: 'w:lock', attributes: { 'w:val': 'unlocked' } }];
      const node = createNode(sdtPrElements, [{ name: 'w:r', text: 'content' }]);

      const params = {
        nodes: [node],
        nodeListHandler: mockNodeListHandler,
      };

      parseAnnotationMarks.mockReturnValue({ marks: [] });

      const result = handleStructuredContentNode(params);

      expect(result.attrs.lockMode).toBe('unlocked');
    });
  });

  describe('w:temporary parsing (SD-3111)', () => {
    const parseTemporary = (sdtPrElements) => {
      const node = createNode(sdtPrElements, [{ name: 'w:r', text: 'content' }]);
      const params = { nodes: [node], nodeListHandler: mockNodeListHandler };
      parseAnnotationMarks.mockReturnValue({ marks: [] });
      return handleStructuredContentNode(params).attrs.temporary;
    };

    it('reads <w:temporary/> as true (empty toggle)', () => {
      expect(parseTemporary([{ name: 'w:temporary' }])).toBe(true);
    });

    it('reads <w:temporary w:val="true"/> as true', () => {
      expect(parseTemporary([{ name: 'w:temporary', attributes: { 'w:val': 'true' } }])).toBe(true);
    });

    it('reads <w:temporary w:val="1"/> as true', () => {
      expect(parseTemporary([{ name: 'w:temporary', attributes: { 'w:val': '1' } }])).toBe(true);
    });

    it('reads <w:temporary w:val="false"/> as false', () => {
      expect(parseTemporary([{ name: 'w:temporary', attributes: { 'w:val': 'false' } }])).toBe(false);
    });

    it('reads <w:temporary w:val="0"/> as false', () => {
      expect(parseTemporary([{ name: 'w:temporary', attributes: { 'w:val': '0' } }])).toBe(false);
    });

    it('reads <w:temporary w:val="on"/> as true (ST_OnOff alias)', () => {
      expect(parseTemporary([{ name: 'w:temporary', attributes: { 'w:val': 'on' } }])).toBe(true);
    });

    it('reads <w:temporary w:val="off"/> as false (ST_OnOff alias)', () => {
      // Without going through the shared ST_OnOff set this would
      // incorrectly fall through to true. See utils.js parseStrictStOnOff.
      expect(parseTemporary([{ name: 'w:temporary', attributes: { 'w:val': 'off' } }])).toBe(false);
    });

    it('returns undefined for invalid w:val tokens (parser rejects unknown tokens)', () => {
      expect(parseTemporary([{ name: 'w:temporary', attributes: { 'w:val': 'banana' } }])).toBeUndefined();
    });

    it('returns undefined (not false) when <w:temporary> is absent', () => {
      // Spec contract: absent in source XML stays undefined so consumers
      // can distinguish "Word's effective default" from "explicit false".
      expect(parseTemporary([])).toBeUndefined();
      expect(parseTemporary([{ name: 'w:tag', attributes: { 'w:val': 'unrelated' } }])).toBeUndefined();
    });

    it('does not stamp temporary on attrs when absent (preserves "undefined" semantics)', () => {
      const node = createNode([], [{ name: 'w:r', text: 'content' }]);
      const params = { nodes: [node], nodeListHandler: mockNodeListHandler };
      parseAnnotationMarks.mockReturnValue({ marks: [] });
      const result = handleStructuredContentNode(params);
      expect('temporary' in result.attrs).toBe(false);
    });
  });

  describe('controlType detection', () => {
    const detectFrom = (sdtPrElements) => {
      const node = createNode(sdtPrElements, [{ name: 'w:r', text: 'content' }]);
      const params = { nodes: [node], nodeListHandler: mockNodeListHandler };
      parseAnnotationMarks.mockReturnValue({ marks: [] });
      return handleStructuredContentNode(params).attrs.controlType;
    };

    it('detects explicit <w:text/> as "text"', () => {
      expect(detectFrom([{ name: 'w:text' }])).toBe('text');
    });

    it('detects explicit <w:richText/> as "richText"', () => {
      expect(detectFrom([{ name: 'w:richText' }])).toBe('richText');
    });

    it('resolves typeless sdtPr (only property children) as "richText" per ECMA-376 §17.5.2.26', () => {
      // Real-world case: Word emits this for ContentControls.Add(0, range) and
      // ContentControls.Add($null, range). The sdtPr carries only properties
      // (alias/tag/id/placeholder), no type-axis child.
      const propsOnly = [
        { name: 'w:alias', attributes: { 'w:val': 'Field' } },
        { name: 'w:tag', attributes: { 'w:val': 'x' } },
        { name: 'w:id', attributes: { 'w:val': '123' } },
        { name: 'w:placeholder', elements: [{ name: 'w:docPart', attributes: { 'w:val': 'default' } }] },
      ];
      expect(detectFrom(propsOnly)).toBe('richText');
    });

    it('detects <w:date/> as "date"', () => {
      expect(detectFrom([{ name: 'w:date' }])).toBe('date');
    });

    it('detects <w14:checkbox/> as "checkbox"', () => {
      expect(detectFrom([{ name: 'w14:checkbox' }])).toBe('checkbox');
    });

    it('detects <w:comboBox/> as "comboBox"', () => {
      expect(detectFrom([{ name: 'w:comboBox' }])).toBe('comboBox');
    });

    it('detects <w:dropDownList/> as "dropDownList"', () => {
      expect(detectFrom([{ name: 'w:dropDownList' }])).toBe('dropDownList');
    });

    it('detects <w15:repeatingSection/> as "repeatingSection"', () => {
      expect(detectFrom([{ name: 'w15:repeatingSection' }])).toBe('repeatingSection');
    });

    it('detects <w:group/> as "group"', () => {
      expect(detectFrom([{ name: 'w:group' }])).toBe('group');
    });

    it('returns null for unmodeled type children so resolveControlType coerces to "unknown"', () => {
      // detectControlType returns null for unmodeled type elements; resolveControlType
      // (in sdt-info-builder.ts) coerces null → 'unknown' downstream. Verifies that
      // 'unknown' keeps its semantics: "unsupported or unrecognized type child",
      // not "typeless rich-text control".
      expect(detectFrom([{ name: 'w:bibliography' }])).toBeNull();
      expect(detectFrom([{ name: 'w:citation' }])).toBeNull();
      expect(detectFrom([{ name: 'w:equation' }])).toBeNull();
      expect(detectFrom([{ name: 'w:picture' }])).toBeNull();
      expect(detectFrom([{ name: 'w:docPartList' }])).toBeNull();
    });
  });
});

describe('handleStructuredContentNode nested SDT import regression', () => {
  let editor;

  const textRun = (text) => ({
    name: 'w:r',
    elements: [{ name: 'w:t', elements: [{ type: 'text', text }] }],
  });

  const paragraph = (text) => ({
    name: 'w:p',
    elements: [textRun(text)],
  });

  const sdtPr = ({ id, tag, alias, lockMode = 'unlocked', controlType = 'w:richText' }) => ({
    name: 'w:sdtPr',
    elements: [
      { name: 'w:id', attributes: { 'w:val': id } },
      { name: 'w:tag', attributes: { 'w:val': tag } },
      { name: 'w:alias', attributes: { 'w:val': alias } },
      { name: 'w:lock', attributes: { 'w:val': lockMode } },
      { name: controlType },
    ],
  });

  const sdt = (props, contentElements) => ({
    name: 'w:sdt',
    elements: [sdtPr(props), { name: 'w:sdtContent', elements: contentElements }],
  });

  const table = (text) => ({
    name: 'w:tbl',
    elements: [
      {
        name: 'w:tblPr',
        elements: [{ name: 'w:tblW', attributes: { 'w:w': '2400', 'w:type': 'dxa' } }],
      },
      {
        name: 'w:tblGrid',
        elements: [{ name: 'w:gridCol', attributes: { 'w:w': '2400' } }],
      },
      {
        name: 'w:tr',
        elements: [
          {
            name: 'w:tc',
            elements: [
              {
                name: 'w:tcPr',
                elements: [{ name: 'w:tcW', attributes: { 'w:w': '2400', 'w:type': 'dxa' } }],
              },
              paragraph(text),
            ],
          },
        ],
      },
    ],
  });

  const importNodes = (nodes) => {
    const nodeListHandler = defaultNodeListHandler();
    return nodeListHandler.handler({
      nodes,
      nodeListHandler,
      docx: {},
      editor,
      path: [],
    });
  };

  const expectSchemaValid = (content) => {
    let pmDoc;
    expect(() => {
      pmDoc = editor.schema.nodeFromJSON({ type: 'doc', content });
      pmDoc.check();
    }).not.toThrow();
    return pmDoc;
  };

  const findFirstJson = (node, predicate) => {
    if (!node) return null;
    if (predicate(node)) return node;
    for (const child of node.content || []) {
      const found = findFirstJson(child, predicate);
      if (found) return found;
    }
    return null;
  };

  beforeEach(() => {
    ({ editor } = initTestEditor({
      isHeadless: true,
      loadFromSchema: true,
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    }));
    parseAnnotationMarks.mockReturnValue({ marks: [] });
  });

  afterEach(() => {
    editor?.destroy();
    editor = null;
    vi.restoreAllMocks();
  });

  it('imports nested block SDT when outer sdtContent directly contains w:sdt wrapping a paragraph', () => {
    const inner = sdt({ id: 'inner-block', tag: 'inner-tag', alias: 'Inner Alias', lockMode: 'contentLocked' }, [
      paragraph('Nested paragraph'),
    ]);
    const outer = sdt({ id: 'outer-block', tag: 'outer-tag', alias: 'Outer Alias', lockMode: 'sdtLocked' }, [inner]);

    const result = importNodes([outer]);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('structuredContentBlock');
    expect(result[0].attrs).toMatchObject({
      id: 'outer-block',
      tag: 'outer-tag',
      alias: 'Outer Alias',
      lockMode: 'sdtLocked',
      controlType: 'richText',
    });

    const nested = result[0].content?.[0];
    expect(nested?.type).toBe('structuredContentBlock');
    expect(nested.attrs).toMatchObject({
      id: 'inner-block',
      tag: 'inner-tag',
      alias: 'Inner Alias',
      lockMode: 'contentLocked',
      controlType: 'richText',
    });
    expect(nested.attrs.sdtPr?.elements?.find((el) => el.name === 'w:alias')?.attributes?.['w:val']).toBe(
      'Inner Alias',
    );

    expectSchemaValid(result);
  });

  it('wraps nested inline SDT safely when an outer block SDT also contains paragraph and table content', () => {
    const inlineNested = sdt(
      { id: 'inner-inline', tag: 'inline-tag', alias: 'Inline Alias', lockMode: 'sdtContentLocked' },
      [textRun('Inline value')],
    );
    const outer = sdt({ id: 'outer-mixed', tag: 'outer-mixed-tag', alias: 'Outer Mixed', lockMode: 'sdtLocked' }, [
      inlineNested,
      paragraph('Outer paragraph'),
      table('Cell text'),
    ]);

    const result = importNodes([outer]);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('structuredContentBlock');
    expect(result[0].content?.map((node) => node.type)).toEqual(['paragraph', 'paragraph', 'table']);

    const nested = findFirstJson(
      result[0],
      (node) => node.type === 'structuredContent' && node.attrs?.id === 'inner-inline',
    );
    expect(nested).toBeTruthy();
    expect(nested.attrs).toMatchObject({
      id: 'inner-inline',
      tag: 'inline-tag',
      alias: 'Inline Alias',
      lockMode: 'sdtContentLocked',
      controlType: 'richText',
    });
    expect(nested.attrs.sdtPr?.elements?.find((el) => el.name === 'w:lock')?.attributes?.['w:val']).toBe(
      'sdtContentLocked',
    );

    expectSchemaValid(result);
  });
});
