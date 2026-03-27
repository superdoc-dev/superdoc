import { describe, expect, it } from 'vitest';
import { decodeProperties } from './utils.js';

describe('decodeProperties', () => {
  it('preserves explicit node name returned by translator.decode', () => {
    const translator = {
      xmlName: 'w:highlight',
      sdNodeOrKeyName: 'highlight',
      decode: () => ({
        name: 'w:shd',
        attributes: {
          'w:color': 'auto',
          'w:val': 'clear',
          'w:fill': 'E4668C',
        },
      }),
    };

    const elements = decodeProperties({ node: { attrs: {} } }, { highlight: translator }, { highlight: '#E4668C' });

    expect(elements).toEqual([
      {
        name: 'w:shd',
        attributes: {
          'w:color': 'auto',
          'w:val': 'clear',
          'w:fill': 'E4668C',
        },
      },
    ]);
  });

  it('falls back to translator xmlName when decode result has no name', () => {
    const translator = {
      xmlName: 'w:b',
      sdNodeOrKeyName: 'bold',
      decode: () => ({
        attributes: {},
      }),
    };

    const elements = decodeProperties({ node: { attrs: {} } }, { bold: translator }, { bold: true });

    expect(elements).toEqual([
      {
        name: 'w:b',
        attributes: {},
      },
    ]);
  });
});
