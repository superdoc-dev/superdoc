// @ts-check
import { describe, it, expect } from 'vitest';
import { preProcessPageFieldsOnly } from './preProcessPageFieldsOnly.js';

describe('preProcessPageFieldsOnly', () => {
  function complexFieldNodes(instruction, cachedText = '1') {
    return [
      {
        name: 'w:r',
        elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' } }],
      },
      {
        name: 'w:r',
        elements: [{ name: 'w:instrText', elements: [{ type: 'text', text: instruction }] }],
      },
      {
        name: 'w:r',
        elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' } }],
      },
      {
        name: 'w:r',
        elements: [{ name: 'w:t', elements: [{ type: 'text', text: cachedText }] }],
      },
      {
        name: 'w:r',
        elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'end' } }],
      },
    ];
  }

  function complexFieldNodesFromInstructionFragments(instructionFragments, cachedText = '1') {
    return [
      {
        name: 'w:r',
        elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' } }],
      },
      ...instructionFragments.map((text) => ({
        name: 'w:r',
        elements: [{ name: 'w:instrText', elements: [{ type: 'text', text }] }],
      })),
      {
        name: 'w:r',
        elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' } }],
      },
      {
        name: 'w:r',
        elements: [{ name: 'w:t', elements: [{ type: 'text', text: cachedText }] }],
      },
      {
        name: 'w:r',
        elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'end' } }],
      },
    ];
  }

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

    it.each([' page \\* arabic ', ' Page ', ' PAGE '])(
      'should process PAGE field case-insensitively with fldChar syntax: %s',
      (instruction) => {
        const result = preProcessPageFieldsOnly(complexFieldNodes(instruction));

        expect(result.processedNodes).toHaveLength(1);
        expect(result.processedNodes[0].name).toBe('sd:autoPageNumber');
      },
    );

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

    it('should process NUMPAGES switches when field instruction uses newline whitespace', () => {
      const nodes = [
        {
          name: 'w:r',
          elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' } }],
        },
        {
          name: 'w:r',
          elements: [{ name: 'w:instrText', elements: [{ type: 'text', text: 'NUMPAGES\n\\# "00"' }] }],
        },
        {
          name: 'w:r',
          elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' } }],
        },
        {
          name: 'w:r',
          elements: [{ name: 'w:t', elements: [{ type: 'text', text: '05' }] }],
        },
        {
          name: 'w:r',
          elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'end' } }],
        },
      ];

      const result = preProcessPageFieldsOnly(nodes);

      expect(result.processedNodes).toHaveLength(1);
      expect(result.processedNodes[0]).toMatchObject({
        name: 'sd:totalPageNumber',
        attributes: {
          instruction: 'NUMPAGES \\# "00"',
          pageNumberFormat: 'decimal',
          pageNumberZeroPadding: 2,
          importedCachedText: '05',
        },
      });
    });

    it('should preserve NUMPAGES quoted numeric picture whitespace across split instrText runs', () => {
      const nodes = [
        {
          name: 'w:r',
          elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' } }],
        },
        {
          name: 'w:r',
          elements: [{ name: 'w:instrText', elements: [{ type: 'text', text: 'NUMPAGES \\# "#' }] }],
        },
        {
          name: 'w:r',
          elements: [{ name: 'w:instrText', elements: [{ type: 'text', text: '   pages"' }] }],
        },
        {
          name: 'w:r',
          elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' } }],
        },
        {
          name: 'w:r',
          elements: [{ name: 'w:t', elements: [{ type: 'text', text: '1   pages' }] }],
        },
        {
          name: 'w:r',
          elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'end' } }],
        },
      ];

      const result = preProcessPageFieldsOnly(nodes);

      expect(result.processedNodes).toHaveLength(1);
      expect(result.processedNodes[0]).toMatchObject({
        name: 'sd:totalPageNumber',
        attributes: {
          instruction: 'NUMPAGES \\# "#   pages"',
          pageNumberNumericPicture: '#   pages',
          importedCachedText: '1   pages',
        },
      });
    });

    it('should process NUMPAGES switches split at a run boundary without whitespace', () => {
      const nodes = [
        {
          name: 'w:r',
          elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' } }],
        },
        {
          name: 'w:r',
          elements: [{ name: 'w:instrText', elements: [{ type: 'text', text: 'NUMPAGES' }] }],
        },
        {
          name: 'w:r',
          elements: [{ name: 'w:instrText', elements: [{ type: 'text', text: '\\# "000"' }] }],
        },
        {
          name: 'w:r',
          elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' } }],
        },
        {
          name: 'w:r',
          elements: [{ name: 'w:t', elements: [{ type: 'text', text: '007' }] }],
        },
        {
          name: 'w:r',
          elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'end' } }],
        },
      ];

      const result = preProcessPageFieldsOnly(nodes);

      expect(result.processedNodes).toHaveLength(1);
      expect(result.processedNodes[0]).toMatchObject({
        name: 'sd:totalPageNumber',
        attributes: {
          instruction: 'NUMPAGES \\# "000"',
          pageNumberFormat: 'decimal',
          pageNumberZeroPadding: 3,
          importedCachedText: '007',
        },
      });
    });

    it('should process NUMPAGES numeric switches split between operator and argument', () => {
      const result = preProcessPageFieldsOnly(
        complexFieldNodesFromInstructionFragments(['NUMPAGES', '\\#', '"000"'], '007'),
      );

      expect(result.processedNodes).toHaveLength(1);
      expect(result.processedNodes[0]).toMatchObject({
        name: 'sd:totalPageNumber',
        attributes: {
          instruction: 'NUMPAGES \\# "000"',
          pageNumberFormat: 'decimal',
          pageNumberZeroPadding: 3,
          importedCachedText: '007',
        },
      });
    });

    it('should process PAGE general-format switches split between operator and argument', () => {
      const result = preProcessPageFieldsOnly(complexFieldNodesFromInstructionFragments(['PAGE', '\\*', 'Roman']));

      expect(result.processedNodes).toHaveLength(1);
      expect(result.processedNodes[0]).toMatchObject({
        name: 'sd:autoPageNumber',
        attributes: {
          instruction: 'PAGE \\* Roman',
          pageNumberFormat: 'upperRoman',
        },
      });
    });

    it.each([' numpages ', ' NumPages ', ' NUMPAGES '])(
      'should process NUMPAGES field case-insensitively with fldChar syntax: %s',
      (instruction) => {
        const result = preProcessPageFieldsOnly(complexFieldNodes(instruction, '5'));

        expect(result.processedNodes).toHaveLength(1);
        expect(result.processedNodes[0].name).toBe('sd:totalPageNumber');
      },
    );

    it.each([' sectionpages ', ' SectionPages ', ' SECTIONPAGES \\* roman '])(
      'should process SECTIONPAGES field case-insensitively with fldChar syntax: %s',
      (instruction) => {
        const result = preProcessPageFieldsOnly(complexFieldNodes(instruction, '4'));

        expect(result.processedNodes).toHaveLength(1);
        expect(result.processedNodes[0].name).toBe('sd:sectionPageCount');
        expect(result.processedNodes[0].attributes.importedCachedText).toBe('4');
      },
    );

    it('should preserve SECTIONPAGES field sequence styling when cached result has no rPr', () => {
      const fieldRunRPr = { name: 'w:rPr', elements: [{ name: 'w:i' }] };
      const nodes = [
        {
          name: 'w:r',
          elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' } }],
        },
        {
          name: 'w:r',
          elements: [fieldRunRPr, { name: 'w:instrText', elements: [{ type: 'text', text: ' SECTIONPAGES ' }] }],
        },
        {
          name: 'w:r',
          elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' } }],
        },
        {
          name: 'w:r',
          elements: [{ name: 'w:t', elements: [{ type: 'text', text: '4' }] }],
        },
        {
          name: 'w:r',
          elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'end' } }],
        },
      ];

      const result = preProcessPageFieldsOnly(nodes);

      expect(result.processedNodes).toHaveLength(1);
      expect(result.processedNodes[0]).toMatchObject({
        name: 'sd:sectionPageCount',
        attributes: { importedCachedText: '4' },
        elements: [fieldRunRPr],
      });
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

    it.each(['page \\* arabic', 'Page', 'PAGE'])(
      'should process PAGE field case-insensitively with fldSimple syntax: %s',
      (instruction) => {
        const nodes = [
          {
            name: 'w:fldSimple',
            attributes: { 'w:instr': instruction },
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
      },
    );

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

    it.each(['numpages', 'NumPages', 'NUMPAGES'])(
      'should process NUMPAGES field case-insensitively with fldSimple syntax: %s',
      (instruction) => {
        const nodes = [
          {
            name: 'w:fldSimple',
            attributes: { 'w:instr': instruction },
            elements: [
              {
                name: 'w:r',
                elements: [{ name: 'w:t', elements: [{ type: 'text', text: '5' }] }],
              },
            ],
          },
        ];

        const result = preProcessPageFieldsOnly(nodes);

        expect(result.processedNodes).toHaveLength(1);
        expect(result.processedNodes[0].name).toBe('sd:totalPageNumber');
      },
    );

    it('should process SECTIONPAGES field with fldSimple syntax and preserve parsed format', () => {
      const instruction = ' SECTIONPAGES  \\* roman \\* MERGEFORMAT ';
      const nodes = [
        {
          name: 'w:fldSimple',
          attributes: { 'w:instr': instruction },
          elements: [
            {
              name: 'w:r',
              elements: [
                { name: 'w:rPr', elements: [{ name: 'w:noProof' }] },
                { name: 'w:t', elements: [{ type: 'text', text: 'iv' }] },
              ],
            },
          ],
        },
      ];

      const result = preProcessPageFieldsOnly(nodes);

      expect(result.processedNodes).toHaveLength(1);
      expect(result.processedNodes[0].name).toBe('sd:sectionPageCount');
      expect(result.processedNodes[0].attributes).toMatchObject({
        instruction: instruction.trim().replace(/\s+/g, ' '),
        pageNumberFormat: 'lowerRoman',
        importedCachedText: 'iv',
      });
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

      // Unhandled fldSimple should unwrap to its child content (w:r elements)
      // so the cached display text is rendered instead of being lost in a passthrough node
      expect(result.processedNodes).toHaveLength(1);
      expect(result.processedNodes[0].name).toBe('w:r');
      expect(result.processedNodes[0].elements[0].elements[0].text).toBe('John Doe');
    });
  });

  describe('legacy w:pgNum element', () => {
    it('should convert w:pgNum to sd:autoPageNumber', () => {
      const nodes = [
        {
          name: 'w:r',
          elements: [{ name: 'w:pgNum', type: 'element' }],
        },
      ];

      const result = preProcessPageFieldsOnly(nodes);

      expect(result.processedNodes).toHaveLength(1);
      expect(result.processedNodes[0].name).toBe('sd:autoPageNumber');
    });

    it('should preserve rPr from w:pgNum run', () => {
      const nodes = [
        {
          name: 'w:r',
          elements: [
            { name: 'w:rPr', elements: [{ name: 'w:sz', attributes: { 'w:val': '20' } }] },
            { name: 'w:pgNum', type: 'element' },
          ],
        },
      ];

      const result = preProcessPageFieldsOnly(nodes);

      expect(result.processedNodes).toHaveLength(1);
      expect(result.processedNodes[0].name).toBe('sd:autoPageNumber');
      expect(result.processedNodes[0].elements).toBeDefined();
      expect(result.processedNodes[0].elements[0].name).toBe('w:rPr');
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
