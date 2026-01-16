// @ts-check
import { describe, it, expect } from 'vitest';
import { preProcessPageFieldsOnly } from './preProcessPageFieldsOnly.js';

describe('preProcessPageFieldsOnly', () => {
  describe('complex field syntax (w:fldChar)', () => {
    it('should process PAGE field with fldChar syntax', () => {
      const nodes = [
        {
          name: 'w:r',
          elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' } }],
        },
        {
          name: 'w:r',
          elements: [{ name: 'w:instrText', elements: [{ type: 'text', text: ' PAGE ' }] }],
        },
        {
          name: 'w:r',
          elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' } }],
        },
        {
          name: 'w:r',
          elements: [{ name: 'w:t', elements: [{ type: 'text', text: '1' }] }],
        },
        {
          name: 'w:r',
          elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'end' } }],
        },
      ];

      const result = preProcessPageFieldsOnly(nodes);

      expect(result.processedNodes).toHaveLength(1);
      expect(result.processedNodes[0].name).toBe('sd:autoPageNumber');
    });

    it('should process NUMPAGES field with fldChar syntax', () => {
      const nodes = [
        {
          name: 'w:r',
          elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' } }],
        },
        {
          name: 'w:r',
          elements: [{ name: 'w:instrText', elements: [{ type: 'text', text: ' NUMPAGES ' }] }],
        },
        {
          name: 'w:r',
          elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' } }],
        },
        {
          name: 'w:r',
          elements: [{ name: 'w:t', elements: [{ type: 'text', text: '5' }] }],
        },
        {
          name: 'w:r',
          elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'end' } }],
        },
      ];

      const result = preProcessPageFieldsOnly(nodes);

      expect(result.processedNodes).toHaveLength(1);
      expect(result.processedNodes[0].name).toBe('sd:totalPageNumber');
    });
  });

  describe('simple field syntax (w:fldSimple)', () => {
    it('should process PAGE field with fldSimple syntax', () => {
      const nodes = [
        {
          name: 'w:fldSimple',
          attributes: { 'w:instr': ' PAGE ' },
          elements: [
            {
              name: 'w:r',
              elements: [{ name: 'w:t', elements: [{ type: 'text', text: '1' }] }],
            },
          ],
        },
      ];

      const result = preProcessPageFieldsOnly(nodes);

      expect(result.processedNodes).toHaveLength(1);
      expect(result.processedNodes[0].name).toBe('sd:autoPageNumber');
    });

    it('should process NUMPAGES field with fldSimple syntax', () => {
      const nodes = [
        {
          name: 'w:fldSimple',
          attributes: { 'w:instr': ' NUMPAGES  \\* MERGEFORMAT ' },
          elements: [
            {
              name: 'w:r',
              elements: [
                { name: 'w:rPr', elements: [{ name: 'w:noProof' }] },
                { name: 'w:t', elements: [{ type: 'text', text: '2' }] },
              ],
            },
          ],
        },
      ];

      const result = preProcessPageFieldsOnly(nodes);

      expect(result.processedNodes).toHaveLength(1);
      expect(result.processedNodes[0].name).toBe('sd:totalPageNumber');
    });

    it('should preserve rPr styling from fldSimple content', () => {
      const nodes = [
        {
          name: 'w:fldSimple',
          attributes: { 'w:instr': 'NUMPAGES' },
          elements: [
            {
              name: 'w:r',
              elements: [
                { name: 'w:rPr', elements: [{ name: 'w:b' }, { name: 'w:sz', attributes: { 'w:val': '24' } }] },
                { name: 'w:t', elements: [{ type: 'text', text: '10' }] },
              ],
            },
          ],
        },
      ];

      const result = preProcessPageFieldsOnly(nodes);

      expect(result.processedNodes).toHaveLength(1);
      expect(result.processedNodes[0].name).toBe('sd:totalPageNumber');
      expect(result.processedNodes[0].elements).toBeDefined();
      expect(result.processedNodes[0].elements[0].name).toBe('w:rPr');
    });

    it('should pass through fldSimple with non-page field types', () => {
      const nodes = [
        {
          name: 'w:fldSimple',
          attributes: { 'w:instr': ' AUTHOR ' },
          elements: [
            {
              name: 'w:r',
              elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'John Doe' }] }],
            },
          ],
        },
      ];

      const result = preProcessPageFieldsOnly(nodes);

      // Should pass through unchanged (processed recursively)
      expect(result.processedNodes).toHaveLength(1);
      expect(result.processedNodes[0].name).toBe('w:fldSimple');
    });
  });

  describe('nested content', () => {
    it('should recursively process fldSimple inside table cells', () => {
      const nodes = [
        {
          name: 'w:tc',
          elements: [
            {
              name: 'w:p',
              elements: [
                {
                  name: 'w:fldSimple',
                  attributes: { 'w:instr': 'NUMPAGES' },
                  elements: [
                    {
                      name: 'w:r',
                      elements: [{ name: 'w:t', elements: [{ type: 'text', text: '5' }] }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ];

      const result = preProcessPageFieldsOnly(nodes);

      // Navigate to the processed field
      const tc = result.processedNodes[0];
      const p = tc.elements[0];
      expect(p.elements).toHaveLength(1);
      expect(p.elements[0].name).toBe('sd:totalPageNumber');
    });
  });
});
