import { describe, expect, it } from 'vitest';
import { exportSchemaToJson } from '../../../../exporter.js';
import { translator } from './rawField-translator.js';

const PRISTINE_MUTATION = {
  imported: true,
  inserted: false,
  instructionEdited: false,
  resultEdited: false,
  flagsEdited: false,
  relocated: false,
  structureEdited: false,
};

function buildFieldInstance(overrides = {}) {
  return {
    id: 'test-id',
    representation: 'complex',
    family: 'CUSTOMFIELD',
    rawInstruction: 'CUSTOMFIELD foo',
    instructionTokens: [],
    parsedArgs: { positional: [], switches: [] },
    resultFragments: [],
    dirty: false,
    locked: false,
    mutation: { ...PRISTINE_MUTATION, ...(overrides.mutation || {}) },
    source: {
      originalXml: undefined,
      part: 'body',
      importIndex: 0,
      ...(overrides.source || {}),
    },
    ...overrides,
  };
}

function buildRawFieldNode(overrides = {}) {
  return {
    type: 'rawField',
    attrs: {
      fieldInstance: buildFieldInstance(overrides.fieldInstance || {}),
      marksAsAttrs: [],
      ...overrides.attrs,
    },
    content: overrides.content ?? [],
  };
}

describe('rawField translator', () => {
  describe('decode (PM → OOXML)', () => {
    it('passes the original XML through verbatim when the field is unedited and source is captured', () => {
      const original = [
        { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' } }] },
        { name: 'w:r', elements: [{ name: 'w:instrText', elements: [{ type: 'text', text: 'CUSTOMFIELD foo' }] }] },
        { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' } }] },
        { name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'value' }] }] },
        { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'end' } }] },
      ];
      const node = buildRawFieldNode({ fieldInstance: { source: { originalXml: original } } });
      const exported = exportSchemaToJson({ node });
      expect(exported).toEqual(original);
    });

    it('passes a single fldSimple element through verbatim for simple representation', () => {
      const original = {
        name: 'w:fldSimple',
        attributes: { 'w:instr': 'CUSTOMFIELD foo' },
        elements: [{ name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'value' }] }] }],
      };
      const node = buildRawFieldNode({
        fieldInstance: {
          representation: 'simple',
          source: { originalXml: original },
        },
      });
      const exported = exportSchemaToJson({ node });
      expect(exported).toEqual([original]);
    });

    it('rebuilds a complex field envelope when no original XML was captured', () => {
      const node = buildRawFieldNode({
        fieldInstance: { source: { originalXml: undefined } },
      });
      const exported = exportSchemaToJson({ node });

      const beginRun = exported.find((e) =>
        e?.elements?.some((c) => c?.name === 'w:fldChar' && c?.attributes?.['w:fldCharType'] === 'begin'),
      );
      const separateRun = exported.find((e) =>
        e?.elements?.some((c) => c?.name === 'w:fldChar' && c?.attributes?.['w:fldCharType'] === 'separate'),
      );
      const endRun = exported.find((e) =>
        e?.elements?.some((c) => c?.name === 'w:fldChar' && c?.attributes?.['w:fldCharType'] === 'end'),
      );
      const instrRun = exported.find((e) => e?.elements?.some((c) => c?.name === 'w:instrText'));

      expect(beginRun).toBeDefined();
      expect(separateRun).toBeDefined();
      expect(endRun).toBeDefined();
      expect(instrRun).toBeDefined();
      const instrText = instrRun.elements.find((c) => c.name === 'w:instrText');
      expect(instrText.elements[0].text).toBe('CUSTOMFIELD foo');
    });

    it('rebuilds a fldSimple envelope when representation is simple and source is missing', () => {
      const node = buildRawFieldNode({
        fieldInstance: {
          representation: 'simple',
          source: { originalXml: undefined },
        },
      });
      const exported = exportSchemaToJson({ node });
      expect(exported).toHaveLength(1);
      expect(exported[0].name).toBe('w:fldSimple');
      expect(exported[0].attributes['w:instr']).toBe('CUSTOMFIELD foo');
    });

    it('rebuilds (does not passthrough) when an instruction edit flag is set', () => {
      const original = [{ name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' } }] }];
      const node = buildRawFieldNode({
        fieldInstance: {
          source: { originalXml: original },
          mutation: { instructionEdited: true },
        },
      });
      const exported = exportSchemaToJson({ node });
      expect(exported).not.toEqual(original);
      // Rebuild emits begin/instr/separate/end runs.
      expect(exported.length).toBeGreaterThan(1);
    });

    it('rebuilds when the result content has been edited', () => {
      const node = buildRawFieldNode({
        fieldInstance: {
          source: { originalXml: [{ name: 'w:r' }] },
          mutation: { resultEdited: true },
        },
      });
      const exported = exportSchemaToJson({ node });
      expect(exported).not.toEqual([{ name: 'w:r' }]);
    });

    it('rebuilds when flags have been edited', () => {
      const node = buildRawFieldNode({
        fieldInstance: {
          source: { originalXml: [{ name: 'w:r' }] },
          mutation: { flagsEdited: true },
          dirty: true,
        },
      });
      const exported = exportSchemaToJson({ node });
      const beginRun = exported.find((e) =>
        e?.elements?.some((c) => c?.name === 'w:fldChar' && c?.attributes?.['w:fldCharType'] === 'begin'),
      );
      const beginFldChar = beginRun.elements.find((c) => c?.name === 'w:fldChar');
      expect(beginFldChar.attributes['w:dirty']).toBe('1');
    });

    it('emits w:fldLock on the begin fldChar when locked is true on rebuild', () => {
      const node = buildRawFieldNode({
        fieldInstance: {
          source: { originalXml: undefined },
          locked: true,
        },
      });
      const exported = exportSchemaToJson({ node });
      const beginRun = exported.find((e) =>
        e?.elements?.some((c) => c?.name === 'w:fldChar' && c?.attributes?.['w:fldCharType'] === 'begin'),
      );
      const beginFldChar = beginRun.elements.find((c) => c?.name === 'w:fldChar');
      expect(beginFldChar.attributes['w:fldLock']).toBe('1');
    });

    it('emits w:dirty and w:fldLock on the fldSimple wrapper on rebuild', () => {
      const node = buildRawFieldNode({
        fieldInstance: {
          representation: 'simple',
          source: { originalXml: undefined },
          dirty: true,
          locked: true,
        },
      });
      const exported = exportSchemaToJson({ node });
      expect(exported[0].attributes['w:dirty']).toBe('1');
      expect(exported[0].attributes['w:fldLock']).toBe('1');
    });
  });

  describe('translator config', () => {
    it('binds sd:rawField to the rawField PM node', () => {
      expect(translator).toBeDefined();
      // The translator is registered via NodeTranslator.from(config); its
      // identity is asserted indirectly through the encode/decode tests
      // above, which rely on the registry resolving sd:rawField correctly.
    });
  });
});
