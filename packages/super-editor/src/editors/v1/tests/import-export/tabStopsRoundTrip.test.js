import { expect } from 'vitest';
import { handleParagraphNode } from '@converter/v2/importer/paragraphNodeImporter.js';
import { defaultNodeListHandler } from '@converter/v2/importer/docxImporter.js';
import { translator as wPTranslator } from '@converter/v3/handlers/w/p';

describe('Tab Stops Round Trip Tests', () => {
  // Create a minimal editor mock that has the required extensions property
  const createMockEditor = () => ({
    extensions: {
      find: vi.fn(() => null),
    },
    schema: {
      marks: {},
    },
  });

  it('correctly imports and exports tab stops with all attributes', () => {
    // Create a mock DOCX paragraph with tab stops
    const mockDocxParagraph = {
      name: 'w:p',
      elements: [
        {
          name: 'w:pPr',
          elements: [
            {
              name: 'w:tabs',
              elements: [
                {
                  name: 'w:tab',
                  attributes: {
                    'w:val': 'start',
                    'w:pos': '2160',
                  },
                },
                {
                  name: 'w:tab',
                  attributes: {
                    'w:val': 'center',
                    'w:pos': '5040',
                    'w:leader': 'dot',
                  },
                },
                {
                  name: 'w:tab',
                  attributes: {
                    'w:val': 'decimal',
                    'w:pos': '7200',
                    'w:leader': 'underscore',
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    // Step 1: Import the DOCX paragraph
    const { nodes } = handleParagraphNode({
      nodes: [mockDocxParagraph],
      docx: {},
      nodeListHandler: defaultNodeListHandler(),
    });

    const importedNode = nodes[0];
    expect(importedNode.type).toBe('paragraph');
    const importedTabStops = importedNode.attrs.paragraphProperties?.tabStops;
    expect(importedTabStops).toBeDefined();
    expect(importedTabStops.length).toBe(3);

    // Verify imported tab stops
    const firstTab = importedTabStops[0].tab;
    expect(firstTab.tabType).toBe('start');
    expect(firstTab.pos).toBe(2160);
    expect(firstTab.leader).toBeUndefined();

    const secondTab = importedTabStops[1].tab;
    expect(secondTab.tabType).toBe('center');
    expect(secondTab.pos).toBe(5040);
    expect(secondTab.leader).toBe('dot');

    const thirdTab = importedTabStops[2].tab;
    expect(thirdTab.tabType).toBe('decimal');
    expect(thirdTab.pos).toBe(7200);
    expect(thirdTab.leader).toBe('underscore');

    // Step 2: Export the imported node back to DOCX
    const mockEditor = createMockEditor();
    const exportedResult = wPTranslator.decode({
      editor: mockEditor,
      node: importedNode,
    });

    expect(exportedResult.name).toBe('w:p');

    // Find the pPr element
    const pPr = exportedResult.elements.find((el) => el.name === 'w:pPr');
    expect(pPr).toBeDefined();

    // Find the tabs element within pPr
    const tabs = pPr.elements.find((el) => el.name === 'w:tabs');
    expect(tabs).toBeDefined();
    expect(tabs.elements.length).toBe(3);

    // Verify exported tab stops match the original
    const exportedFirstTab = tabs.elements[0];
    expect(exportedFirstTab.name).toBe('w:tab');
    expect(exportedFirstTab.attributes['w:val']).toBe('start');
    expect(exportedFirstTab.attributes['w:pos']).toBe('2160');
    expect(exportedFirstTab.attributes['w:leader']).toBeUndefined();

    const exportedSecondTab = tabs.elements[1];
    expect(exportedSecondTab.name).toBe('w:tab');
    expect(exportedSecondTab.attributes['w:val']).toBe('center');
    expect(exportedSecondTab.attributes['w:pos']).toBe('5040');
    expect(exportedSecondTab.attributes['w:leader']).toBe('dot');

    const exportedThirdTab = tabs.elements[2];
    expect(exportedThirdTab.name).toBe('w:tab');
    expect(exportedThirdTab.attributes['w:val']).toBe('decimal');
    expect(exportedThirdTab.attributes['w:pos']).toBe('7200');
    expect(exportedThirdTab.attributes['w:leader']).toBe('underscore');
  });

  it('correctly handles paragraphs without tab stops in round trip', () => {
    // Create a mock DOCX paragraph without tab stops
    const mockDocxParagraph = {
      name: 'w:p',
      elements: [
        {
          name: 'w:pPr',
          elements: [],
        },
      ],
    };

    // Step 1: Import the DOCX paragraph
    const { nodes } = handleParagraphNode({
      nodes: [mockDocxParagraph],
      docx: {},
      nodeListHandler: defaultNodeListHandler(),
    });

    const importedNode = nodes[0];
    expect(importedNode.type).toBe('paragraph');
    expect(importedNode.attrs.paragraphProperties?.tabStops).toBeUndefined();

    // Step 2: Export the imported node back to DOCX
    const mockEditor = createMockEditor();
    const exportedResult = wPTranslator.decode({
      editor: mockEditor,
      node: importedNode,
    });

    expect(exportedResult.name).toBe('w:p');

    // Find the pPr element (if it exists)
    const pPr = exportedResult.elements.find((el) => el.name === 'w:pPr');

    if (pPr) {
      // If pPr exists, it should not contain tabs
      const tabs = pPr.elements?.find((el) => el.name === 'w:tabs');
      expect(tabs).toBeUndefined();
    }
  });

  it('correctly handles tab stops with default values in round trip', () => {
    // Create a mock DOCX paragraph with tab stop that has default val
    const mockDocxParagraph = {
      name: 'w:p',
      elements: [
        {
          name: 'w:pPr',
          elements: [
            {
              name: 'w:tabs',
              elements: [
                {
                  name: 'w:tab',
                  attributes: {
                    'w:pos': '1440',
                    // No w:val provided, should default to 'start'
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    // Step 1: Import the DOCX paragraph
    const { nodes } = handleParagraphNode({
      nodes: [mockDocxParagraph],
      docx: {},
      nodeListHandler: defaultNodeListHandler(),
    });

    const importedNode = nodes[0];
    expect(importedNode.type).toBe('paragraph');
    const importedTabStops = importedNode.attrs.paragraphProperties?.tabStops;
    expect(importedTabStops).toBeDefined();
    expect(importedTabStops.length).toBe(1);

    const tab = importedTabStops[0].tab;
    expect(tab.pos).toBe(1440);
    expect(tab.leader).toBeUndefined();

    // Step 2: Export the imported node back to DOCX
    const mockEditor = createMockEditor();
    const exportedResult = wPTranslator.decode({
      editor: mockEditor,
      node: importedNode,
    });

    const pPr = exportedResult.elements.find((el) => el.name === 'w:pPr');
    const tabs = pPr.elements.find((el) => el.name === 'w:tabs');
    expect(tabs.elements.length).toBe(1);

    const exportedTab = tabs.elements[0];
    expect(exportedTab.attributes['w:val']).toBeUndefined();
    expect(exportedTab.attributes['w:pos']).toBe('1440');
    expect(exportedTab.attributes['w:leader']).toBeUndefined();
  });

  it('preserves original w:pos values for clearing tab stops', () => {
    const mockDocxParagraph = {
      name: 'w:p',
      elements: [
        {
          name: 'w:pPr',
          elements: [
            {
              name: 'w:tabs',
              elements: [
                {
                  name: 'w:tab',
                  attributes: {
                    'w:val': 'clear',
                    'w:pos': '1234',
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const { nodes } = handleParagraphNode({
      nodes: [mockDocxParagraph],
      docx: {},
      nodeListHandler: defaultNodeListHandler(),
    });

    const importedNode = nodes[0];
    expect(importedNode.attrs.paragraphProperties?.tabStops?.[0]?.tab.pos).toBe(1234);

    const mockEditor = createMockEditor();
    const exportedResult = wPTranslator.decode({
      editor: mockEditor,
      node: importedNode,
    });

    const pPr = exportedResult.elements.find((el) => el.name === 'w:pPr');
    const tabs = pPr.elements.find((el) => el.name === 'w:tabs');
    const exportedTab = tabs.elements[0];
    expect(exportedTab.attributes['w:pos']).toBe('1234');
  });

  it('preserves tab stop order in round trip', () => {
    // Create a mock DOCX paragraph with multiple tab stops in specific order
    const mockDocxParagraph = {
      name: 'w:p',
      elements: [
        {
          name: 'w:pPr',
          elements: [
            {
              name: 'w:tabs',
              elements: [
                {
                  name: 'w:tab',
                  attributes: {
                    'w:val': 'end',
                    'w:pos': '8640',
                    'w:leader': 'hyphen',
                  },
                },
                {
                  name: 'w:tab',
                  attributes: {
                    'w:val': 'bar',
                    'w:pos': '1440',
                  },
                },
                {
                  name: 'w:tab',
                  attributes: {
                    'w:val': 'num',
                    'w:pos': '4320',
                    'w:leader': 'middleDot',
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    // Step 1: Import the DOCX paragraph
    const { nodes } = handleParagraphNode({
      nodes: [mockDocxParagraph],
      docx: {},
      nodeListHandler: defaultNodeListHandler(),
    });

    const importedNode = nodes[0];
    expect(importedNode.attrs.paragraphProperties?.tabStops?.length).toBe(3);

    // Step 2: Export the imported node back to DOCX
    const mockEditor = createMockEditor();
    const exportedResult = wPTranslator.decode({
      editor: mockEditor,
      node: importedNode,
    });

    const pPr = exportedResult.elements.find((el) => el.name === 'w:pPr');
    const tabs = pPr.elements.find((el) => el.name === 'w:tabs');
    expect(tabs.elements.length).toBe(3);

    // Verify the order is preserved
    expect(tabs.elements[0].attributes['w:val']).toBe('end');
    expect(tabs.elements[0].attributes['w:pos']).toBe('8640');
    expect(tabs.elements[0].attributes['w:leader']).toBe('hyphen');

    expect(tabs.elements[1].attributes['w:val']).toBe('bar');
    expect(tabs.elements[1].attributes['w:pos']).toBe('1440');
    expect(tabs.elements[1].attributes['w:leader']).toBeUndefined();

    expect(tabs.elements[2].attributes['w:val']).toBe('num');
    expect(tabs.elements[2].attributes['w:pos']).toBe('4320');
    expect(tabs.elements[2].attributes['w:leader']).toBe('middleDot');
  });
});
