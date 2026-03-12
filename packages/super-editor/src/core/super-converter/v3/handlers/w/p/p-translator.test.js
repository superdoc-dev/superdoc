import { describe, it, expect, vi, afterEach } from 'vitest';
import { translateParagraphNode } from './helpers/translate-paragraph-node.js';

// Mock attribute handlers before importing the SUT so the config captures them.
// Define everything inside the factory to avoid hoisting issues.
vi.mock('./attributes/index.js', () => ({
  default: [
    {
      xmlName: 'w14:paraId',
      xmlns: undefined,
      sdName: 'paraId',
      encode: () => 'ENC_PARAID',
      decode: () => 'DEC_PARAID',
    },
    {
      xmlName: 'w14:textId',
      xmlns: undefined,
      sdName: 'textId',
      encode: () => 'ENC_TEXTID',
      decode: () => 'DEC_TEXTID',
    },
    { xmlName: 'w:rsidR', xmlns: undefined, sdName: 'rsidR', encode: () => 'ENC_RSIDR', decode: () => 'DEC_RSIDR' },
    {
      xmlName: 'w:rsidRDefault',
      xmlns: undefined,
      sdName: 'rsidRDefault',
      encode: () => 'ENC_RSIDRDEF',
      decode: () => 'DEC_RSIDRDEF',
    },
    { xmlName: 'w:rsidP', xmlns: undefined, sdName: 'rsidP', encode: () => 'ENC_RSIDP', decode: () => 'DEC_RSIDP' },
    {
      xmlName: 'w:rsidRPr',
      xmlns: undefined,
      sdName: 'rsidRPr',
      encode: () => 'ENC_RSIDRPR',
      decode: () => 'DEC_RSIDRPR',
    },
    {
      xmlName: 'w:rsidDel',
      xmlns: undefined,
      sdName: 'rsidDel',
      encode: () => 'ENC_RSIDDEL',
      decode: () => 'DEC_RSIDDEL',
    },
  ],
}));

// Mock legacy paragraph handler used by encode
vi.mock('./helpers/legacy-handle-paragraph-node.js', () => ({
  handleParagraphNode: vi.fn(() => ({
    type: 'paragraph',
    attrs: { fromLegacy: true },
    content: [],
  })),
}));

// Mock exporter decode function used by decode
vi.mock('./helpers/translate-paragraph-node.js', () => ({
  translateParagraphNode: vi.fn(() => ({
    name: 'w:p',
    elements: [],
    attributes: { existing: 'keep' },
  })),
}));

// Import after mocks
import { translator, config } from './p-translator.js';
import { NodeTranslator } from '@translator';
import { handleParagraphNode } from './helpers/legacy-handle-paragraph-node.js';

describe('w/p p-translator', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('exposes correct config', () => {
    expect(config.xmlName).toBe('w:p');
    expect(config.sdNodeOrKeyName).toBe('paragraph');
    expect(config.type).toBe(NodeTranslator.translatorTypes.NODE);
    expect(config.attributes).toHaveLength(7);
  });

  it('encode() delegates to legacy handler and merges encoded attributes', () => {
    const params = {
      nodes: [{ name: 'w:p', attributes: { 'w14:paraId': 'X' } }],
      docx: {},
      nodeListHandler: { handlerEntities: [] },
    };

    const result = translator.encode(params);
    expect(handleParagraphNode).toHaveBeenCalled();
    expect(result.type).toBe('paragraph');
    expect(result.attrs.fromLegacy).toBe(true);
    // Encoded attrs from mocked attrConfig encoders
    expect(result.attrs).toMatchObject({
      paraId: 'ENC_PARAID',
      textId: 'ENC_TEXTID',
      rsidR: 'ENC_RSIDR',
      rsidRDefault: 'ENC_RSIDRDEF',
      rsidP: 'ENC_RSIDP',
      rsidRPr: 'ENC_RSIDRPR',
      rsidDel: 'ENC_RSIDDEL',
    });
  });

  it('encode() applies identity attrs only to the first paragraph fragment in split results', () => {
    handleParagraphNode.mockReturnValueOnce([
      { type: 'paragraph', attrs: { fromLegacy: true }, content: [] },
      { type: 'documentPartObject', attrs: { id: '123' }, content: [] },
      { type: 'paragraph', attrs: { trailing: true }, content: [] },
    ]);

    const result = translator.encode({
      nodes: [{ name: 'w:p', attributes: { 'w14:paraId': 'X' } }],
      docx: {},
      nodeListHandler: { handlerEntities: [] },
    });

    expect(result).toEqual([
      expect.objectContaining({
        type: 'paragraph',
        attrs: expect.objectContaining({
          fromLegacy: true,
          paraId: 'ENC_PARAID',
          textId: 'ENC_TEXTID',
          rsidR: 'ENC_RSIDR',
          rsidRDefault: 'ENC_RSIDRDEF',
          rsidP: 'ENC_RSIDP',
          rsidRPr: 'ENC_RSIDRPR',
          rsidDel: 'ENC_RSIDDEL',
        }),
      }),
      { type: 'documentPartObject', attrs: { id: '123' }, content: [] },
      expect.objectContaining({
        type: 'paragraph',
        attrs: expect.objectContaining({
          trailing: true,
          rsidR: 'ENC_RSIDR',
          rsidRDefault: 'ENC_RSIDRDEF',
          rsidP: 'ENC_RSIDP',
          rsidRPr: 'ENC_RSIDRPR',
          rsidDel: 'ENC_RSIDDEL',
        }),
      }),
    ]);
    expect(result[2].attrs.paraId).toBeUndefined();
    expect(result[2].attrs.textId).toBeUndefined();
  });

  it('encode() does not stamp paragraph identity attrs onto block-only results', () => {
    handleParagraphNode.mockReturnValueOnce([{ type: 'documentPartObject', attrs: { id: '123' }, content: [] }]);

    const result = translator.encode({
      nodes: [{ name: 'w:p', attributes: { 'w14:paraId': 'X' } }],
      docx: {},
      nodeListHandler: { handlerEntities: [] },
    });

    expect(result).toEqual([{ type: 'documentPartObject', attrs: { id: '123' }, content: [] }]);
  });

  it('decode() delegates to exporter and merges decoded attributes', () => {
    const params = {
      node: { type: 'paragraph', attrs: { any: 'thing' } },
      children: [],
    };
    const result = translator.decode(params);
    expect(translateParagraphNode).toHaveBeenCalled();
    expect(result.name).toBe('w:p');
    // existing attribute remains
    expect(result.attributes.existing).toBe('keep');
    // Decoded attrs from mocked attribute decoders; keys are xml names
    expect(result.attributes).toMatchObject({
      'w14:paraId': 'DEC_PARAID',
      'w14:textId': 'DEC_TEXTID',
      'w:rsidR': 'DEC_RSIDR',
      'w:rsidRDefault': 'DEC_RSIDRDEF',
      'w:rsidP': 'DEC_RSIDP',
      'w:rsidRPr': 'DEC_RSIDRPR',
      'w:rsidDel': 'DEC_RSIDDEL',
    });
  });

  // The previous test that checked invocation of all attr handlers
  // was fragile if the NodeTranslator clones handler objects. The
  // two tests above already verify merge of encoded/decoded attrs.
});
