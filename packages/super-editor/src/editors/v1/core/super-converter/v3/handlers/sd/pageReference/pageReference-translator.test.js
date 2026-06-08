import { describe, expect, it } from 'vitest';
import { exportSchemaToJson } from '../../../../exporter.js';
import { translator as pageReferenceTranslator } from './pageReference-translator.js';

describe('pageReference translator', () => {
  it('encodes runtime attrs from sd:pageReference attributes', () => {
    const encoded = pageReferenceTranslator.encode({
      nodes: [
        {
          name: 'sd:pageReference',
          attributes: {
            instruction: 'PAGEREF target \\h',
            bookmarkId: 'target',
            hasHyperlinkSwitch: true,
            hasRelativePositionSwitch: true,
            pageNumberFieldFormat: { format: 'upperRoman' },
            numericPictureFormat: { picture: '00' },
            fieldResultFormat: 'mergeformat',
          },
          elements: [],
        },
      ],
      nodeListHandler: { handler: () => [] },
    });

    expect(encoded.attrs).toMatchObject({
      instruction: 'PAGEREF target \\h',
      bookmarkId: 'target',
      hasHyperlinkSwitch: true,
      hasRelativePositionSwitch: true,
      pageNumberFieldFormat: { format: 'upperRoman' },
      numericPictureFormat: { picture: '00' },
      fieldResultFormat: 'mergeformat',
    });
  });

  it('decodes instruction tokens and does not serialize runtime-only attrs', () => {
    const exported = exportSchemaToJson({
      node: {
        type: 'pageReference',
        attrs: {
          instruction: 'PAGEREF target \\h',
          instructionTokens: [
            { type: 'text', text: 'PAGEREF target ' },
            { type: 'tab' },
            { type: 'text', text: '\\h' },
          ],
          bookmarkId: 'target',
          hasHyperlinkSwitch: true,
          pageNumberFieldFormat: { format: 'upperRoman' },
          numericPictureFormat: { picture: '00' },
        },
        content: [{ type: 'text', text: '7' }],
      },
    });

    const instructionRun = exported.find((node) =>
      node?.elements?.some((element) => element?.name === 'w:instrText' || element?.name === 'w:tab'),
    );
    expect(instructionRun?.elements?.some((element) => element?.name === 'w:tab')).toBe(true);
    expect(JSON.stringify(exported)).not.toContain('bookmarkId');
    expect(JSON.stringify(exported)).not.toContain('pageNumberFieldFormat');
  });

  it('serializes CHARFORMAT fieldRunProperties on the instruction run', () => {
    const exported = exportSchemaToJson({
      node: {
        type: 'pageReference',
        attrs: {
          instruction: 'PAGEREF target \\* CHARFORMAT',
          fieldResultFormat: 'charformat',
          fieldRunProperties: { bold: true, color: { val: '00FF00' } },
          marksAsAttrs: [{ type: 'italic', attrs: {} }],
        },
        content: [{ type: 'text', text: '7' }],
      },
    });

    const instructionRun = exported.find((node) => node?.elements?.some((element) => element?.name === 'w:instrText'));
    const instructionRunProperties = instructionRun?.elements?.find((element) => element?.name === 'w:rPr');
    expect(instructionRunProperties?.elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'w:b' }),
        expect.objectContaining({ name: 'w:color', attributes: { 'w:val': '00FF00' } }),
      ]),
    );
    expect(instructionRunProperties?.elements).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'w:i' })]),
    );
  });
});
