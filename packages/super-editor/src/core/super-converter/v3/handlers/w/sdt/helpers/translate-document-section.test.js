import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { translateDocumentSection } from './translate-document-section';
import { translateChildNodes } from '@converter/v2/exporter/helpers/translateChildNodes';

// Mock dependencies
mock.module('@converter/v2/exporter/helpers/translateChildNodes', () => ({
  translateChildNodes: mock(),
}));

describe('translateDocumentSection', () => {
  beforeEach(() => {
    translateChildNodes.mockReturnValue([{ name: 'w:p', elements: [{ name: 'w:t', text: 'Section content' }] }]);
  });

  it('returns correct XML structure with generated sdtPr', () => {
    const node = {
      content: [{ type: 'paragraph', text: 'Content' }],
      attrs: {
        id: 'section-123',
        title: 'Test Section',
        description: 'Test description',
      },
    };
    const params = { node };

    const result = translateDocumentSection(params);

    expect(result).toEqual({
      name: 'w:sdt',
      elements: [
        {
          name: 'w:sdtPr',
          elements: [
            {
              name: 'w:id',
              attributes: { 'w:val': 'section-123' },
            },
            {
              name: 'w:alias',
              attributes: { 'w:val': 'Test Section' },
            },
            {
              name: 'w:tag',
              attributes: { 'w:val': '{"type":"documentSection","description":"Test description"}' },
            },
          ],
        },
        {
          name: 'w:sdtContent',
          elements: [{ name: 'w:p', elements: [{ name: 'w:t', text: 'Section content' }] }],
        },
      ],
    });
  });
});
