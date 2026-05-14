import { describe, it, expect } from 'vitest';
import { normalizePgMarTwipsInTree, processOutputMarks } from './exporter.js';

// SD-2912: <w:pgMar> attributes must be integer twips per ECMA-376 §17.6.11
// (ST_TwipsMeasure). Some documents carry float-valued twips like
// `w:top="168.160400390625"` that pass through the import → export pipeline
// verbatim on paragraph-level sectPr passthrough; strict consumers reject the
// result. This helper is the single normalization point: it walks the export
// XML JSON tree and rounds every numeric pgMar attribute to an integer.

describe('normalizePgMarTwipsInTree', () => {
  it('does not throw on undefined input', () => {
    expect(() => normalizePgMarTwipsInTree(undefined)).not.toThrow();
  });

  it('does not throw on null input', () => {
    expect(() => normalizePgMarTwipsInTree(null)).not.toThrow();
  });

  it('leaves a tree without any w:pgMar element unchanged', () => {
    const tree = {
      name: 'w:document',
      elements: [{ name: 'w:body', elements: [{ name: 'w:p', elements: [] }] }],
    };
    const before = JSON.stringify(tree);
    normalizePgMarTwipsInTree(tree);
    expect(JSON.stringify(tree)).toBe(before);
  });

  it('rounds a single float pgMar attribute to an integer twips value', () => {
    const tree = { name: 'w:pgMar', attributes: { 'w:top': '168.160400390625' } };
    normalizePgMarTwipsInTree(tree);
    expect(tree.attributes['w:top']).toBe('168');
  });

  it('rounds every numeric pgMar attribute, leaves already-integer values exact', () => {
    const tree = {
      name: 'w:pgMar',
      attributes: {
        'w:top': '168.160400390625',
        'w:bottom': '146.0200023651123',
        'w:left': '352.31998443603516',
        'w:right': '663.9990234375',
        'w:gutter': '0',
        'w:header': '720',
      },
    };
    normalizePgMarTwipsInTree(tree);
    expect(tree.attributes).toEqual({
      'w:top': '168',
      'w:bottom': '146',
      'w:left': '352',
      'w:right': '664',
      'w:gutter': '0',
      'w:header': '720',
    });
  });

  it('canonicalizes decimal pgMar tokens even when the numeric value is integral', () => {
    const tree = {
      name: 'w:pgMar',
      attributes: {
        'w:top': '168.0',
        'w:left': '352.000000',
        'w:right': '663.9990234375',
        'w:header': '720',
      },
    };

    normalizePgMarTwipsInTree(tree);

    expect(tree.attributes).toEqual({
      'w:top': '168',
      'w:left': '352',
      'w:right': '664',
      'w:header': '720',
    });
  });

  it('walks into nested elements and normalizes pgMar attrs at any depth', () => {
    const tree = {
      name: 'w:document',
      elements: [
        {
          name: 'w:body',
          elements: [
            {
              name: 'w:p',
              elements: [
                {
                  name: 'w:pPr',
                  elements: [
                    {
                      name: 'w:sectPr',
                      elements: [{ name: 'w:pgMar', attributes: { 'w:top': '146.0200023651123' } }],
                    },
                  ],
                },
              ],
            },
            { name: 'w:sectPr', elements: [{ name: 'w:pgMar', attributes: { 'w:bottom': '352.31998443603516' } }] },
          ],
        },
      ],
    };
    normalizePgMarTwipsInTree(tree);
    const firstPgMar = tree.elements[0].elements[0].elements[0].elements[0].elements[0];
    const secondPgMar = tree.elements[0].elements[1].elements[0];
    expect(firstPgMar.attributes['w:top']).toBe('146');
    expect(secondPgMar.attributes['w:bottom']).toBe('352');
  });

  it('is idempotent — re-running on already-normalized values is a no-op', () => {
    const tree = { name: 'w:pgMar', attributes: { 'w:top': '168.5' } };
    normalizePgMarTwipsInTree(tree);
    const afterFirst = { ...tree.attributes };
    normalizePgMarTwipsInTree(tree);
    expect(tree.attributes).toEqual(afterFirst);
    expect(tree.attributes['w:top']).toBe('169');
  });

  it('ignores non-numeric attribute values (defensive against future OOXML extensions)', () => {
    const tree = { name: 'w:pgMar', attributes: { 'w:top': '168', 'w:custom': 'auto' } };
    normalizePgMarTwipsInTree(tree);
    expect(tree.attributes['w:custom']).toBe('auto');
  });

  it('does not affect attributes on elements other than w:pgMar', () => {
    const tree = {
      name: 'w:document',
      elements: [
        { name: 'w:pgSz', attributes: { 'w:w': '12240.5', 'w:h': '15840.7' } },
        { name: 'w:pgMar', attributes: { 'w:top': '168.5' } },
      ],
    };
    normalizePgMarTwipsInTree(tree);
    expect(tree.elements[0].attributes).toEqual({ 'w:w': '12240.5', 'w:h': '15840.7' });
    expect(tree.elements[1].attributes['w:top']).toBe('169');
  });
});

describe('processOutputMarks highlight clear export', () => {
  it('does not emit highlight XML for plain transparent highlight marks', () => {
    const outputMarks = processOutputMarks([{ type: 'highlight', attrs: { color: 'transparent' } }]);

    expect(outputMarks).toEqual([{}]);
  });

  it('emits highlight none only for imported explicit highlight clears', () => {
    const outputMarks = processOutputMarks([
      { type: 'highlight', attrs: { color: 'transparent', ooxmlHighlightClear: true } },
    ]);

    expect(outputMarks).toEqual([{ name: 'w:highlight', attributes: { 'w:val': 'none' } }]);
  });
});
