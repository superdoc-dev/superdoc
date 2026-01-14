import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleImageNode } from './encode-image-node-helpers.js';
import { emuToPixels } from '@converter/helpers.js';

vi.mock('@converter/helpers.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    emuToPixels: vi.fn(),
    polygonToObj: vi.fn(),
    rotToDegrees: vi.fn(),
  };
});

vi.mock('./vector-shape-helpers.js', () => ({
  extractFillColor: vi.fn(),
  extractStrokeColor: vi.fn(),
  extractStrokeWidth: vi.fn(),
}));

/**
 * Test suite for header/footer image handling.
 *
 * This test verifies that images in headers/footers correctly resolve their
 * relationship references from the appropriate .rels file (e.g., header2.xml.rels)
 * rather than incorrectly falling back to document.xml.rels.
 */
describe('handleImageNode - Header/Footer Images', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emuToPixels.mockImplementation((emu) => (emu ? parseInt(emu, 10) / 1000 : 0));
  });

  /**
   * Helper to create a minimal wp:anchor or wp:inline node for testing
   */
  const makeImageNode = () => ({
    name: 'wp:anchor',
    attributes: {
      distT: '0',
      distB: '0',
      distL: '114300',
      distR: '114300',
    },
    elements: [
      {
        name: 'wp:extent',
        attributes: { cx: '1861200', cy: '648000' },
      },
      {
        name: 'a:graphic',
        elements: [
          {
            name: 'a:graphicData',
            attributes: { uri: 'http://schemas.openxmlformats.org/drawingml/2006/picture' },
            elements: [
              {
                name: 'pic:pic',
                elements: [
                  {
                    name: 'pic:blipFill',
                    elements: [
                      {
                        name: 'a:blip',
                        attributes: { 'r:embed': 'rId1' },
                      },
                    ],
                  },
                  {
                    name: 'pic:spPr',
                    elements: [],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        name: 'wp:docPr',
        attributes: { id: '3', name: 'Picture 3', descr: 'Header logo' },
      },
    ],
  });

  it('should resolve image from header2.xml.rels when filename is header2.xml', () => {
    const node = makeImageNode();

    const params = {
      filename: 'header2.xml',
      docx: {
        // Header relationship file with image reference
        'word/_rels/header2.xml.rels': {
          elements: [
            {
              name: 'Relationships',
              elements: [
                {
                  name: 'Relationship',
                  attributes: {
                    Id: 'rId1',
                    Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
                    Target: 'media/image1.png',
                  },
                },
              ],
            },
          ],
        },
        // Document relationship file WITHOUT this image (to verify fallback doesn't occur incorrectly)
        'word/_rels/document.xml.rels': {
          elements: [
            {
              name: 'Relationships',
              elements: [
                {
                  name: 'Relationship',
                  attributes: {
                    Id: 'rId1',
                    Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
                    Target: 'media/different-image.png', // Different target to detect wrong lookup
                  },
                },
              ],
            },
          ],
        },
      },
    };

    const result = handleImageNode(node, params, true);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('image');
    expect(result?.attrs?.src).toBe('word/media/image1.png');
    expect(result?.attrs?.rId).toBe('rId1');
  });

  it('should resolve image from footer1.xml.rels when filename is footer1.xml', () => {
    const node = makeImageNode();

    const params = {
      filename: 'footer1.xml',
      docx: {
        'word/_rels/footer1.xml.rels': {
          elements: [
            {
              name: 'Relationships',
              elements: [
                {
                  name: 'Relationship',
                  attributes: {
                    Id: 'rId1',
                    Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
                    Target: 'media/footer-logo.png',
                  },
                },
              ],
            },
          ],
        },
      },
    };

    const result = handleImageNode(node, params, true);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('image');
    expect(result?.attrs?.src).toBe('word/media/footer-logo.png');
  });

  it('should fallback to document.xml.rels when header rels file is missing', () => {
    const node = makeImageNode();

    const params = {
      filename: 'header3.xml',
      docx: {
        // No header3.xml.rels file
        'word/_rels/document.xml.rels': {
          elements: [
            {
              name: 'Relationships',
              elements: [
                {
                  name: 'Relationship',
                  attributes: {
                    Id: 'rId1',
                    Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
                    Target: 'media/fallback-image.png',
                  },
                },
              ],
            },
          ],
        },
      },
    };

    const result = handleImageNode(node, params, true);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('image');
    expect(result?.attrs?.src).toBe('word/media/fallback-image.png');
  });

  it('should use document.xml.rels when filename is not provided', () => {
    const node = makeImageNode();

    const params = {
      // filename is undefined/not provided
      docx: {
        'word/_rels/document.xml.rels': {
          elements: [
            {
              name: 'Relationships',
              elements: [
                {
                  name: 'Relationship',
                  attributes: {
                    Id: 'rId1',
                    Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
                    Target: 'media/body-image.png',
                  },
                },
              ],
            },
          ],
        },
      },
    };

    const result = handleImageNode(node, params, true);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('image');
    expect(result?.attrs?.src).toBe('word/media/body-image.png');
  });

  it('should return null when relationship is not found in any rels file', () => {
    const node = makeImageNode();

    const params = {
      filename: 'header1.xml',
      docx: {
        'word/_rels/header1.xml.rels': {
          elements: [
            {
              name: 'Relationships',
              elements: [
                {
                  name: 'Relationship',
                  attributes: {
                    Id: 'rId999', // Different ID - rId1 is referenced but not defined
                    Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
                    Target: 'media/some-other-image.png',
                  },
                },
              ],
            },
          ],
        },
        'word/_rels/document.xml.rels': {
          elements: [
            {
              name: 'Relationships',
              elements: [], // Empty, no fallback available
            },
          ],
        },
      },
    };

    const result = handleImageNode(node, params, true);

    // Should return null because rId1 is not found in either rels file
    expect(result).toBeNull();
  });

  it('should resolve image from header2.xml.rels with full document structure', () => {
    // This test replicates a typical header structure where header2.xml contains
    // an image with rId1 that should resolve via header2.xml.rels to media/image1.png

    const node = makeImageNode();

    const params = {
      filename: 'header2.xml',
      docx: {
        // The header relationship file (word/_rels/header2.xml.rels)
        'word/_rels/header2.xml.rels': {
          elements: [
            {
              name: 'Relationships',
              attributes: {
                xmlns: 'http://schemas.openxmlformats.org/package/2006/relationships',
              },
              elements: [
                {
                  name: 'Relationship',
                  attributes: {
                    Id: 'rId1',
                    Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
                    Target: 'media/image1.png',
                  },
                },
              ],
            },
          ],
        },
        // Document rels file exists but shouldn't be used for this image
        'word/_rels/document.xml.rels': {
          elements: [
            {
              name: 'Relationships',
              elements: [
                {
                  name: 'Relationship',
                  attributes: {
                    Id: 'rId13',
                    Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header',
                    Target: 'header2.xml',
                  },
                },
              ],
            },
          ],
        },
      },
    };

    const result = handleImageNode(node, params, true);

    // Assert the image was correctly resolved
    expect(result).not.toBeNull();
    expect(result?.type).toBe('image');

    // Verify it resolved to the correct image path from header2.xml.rels
    expect(result?.attrs?.src).toBe('word/media/image1.png');
    expect(result?.attrs?.rId).toBe('rId1');

    // Verify other attributes are preserved
    expect(result?.attrs?.id).toBe('3');
    expect(result?.attrs?.alt).toContain('Picture 3'); // From wp:docPr name attribute
  });
});
