import { expect } from 'vitest';
import { translator as wPTranslator } from '@converter/v3/handlers/w/p';

describe('Tab Stops Export Tests', () => {
  // Create a minimal editor mock that has the required extensions property
  const createMockEditor = () => ({
    extensions: {
      find: vi.fn(() => null),
    },
    schema: {
      marks: {},
    },
  });
  const createParagraphNode = (paragraphProperties = {}) => ({
    type: 'paragraph',
    attrs: { paragraphProperties },
    content: [],
  });

  it('correctly exports paragraph with tab stops', () => {
    const mockEditor = createMockEditor();
    const mockParagraphNode = createParagraphNode({
      tabStops: [
        {
          tab: {
            tabType: 'start',
            pos: 2160,
          },
        },
        {
          tab: {
            tabType: 'center',
            pos: 5040,
            leader: 'dot',
          },
        },
        {
          tab: {
            tabType: 'decimal',
            pos: 7200,
            leader: 'underscore',
          },
        },
      ],
    });

    const result = wPTranslator.decode({
      editor: mockEditor,
      node: mockParagraphNode,
    });

    expect(result.name).toBe('w:p');
    expect(result.elements).toBeDefined();

    // Find the pPr element
    const pPr = result.elements.find((el) => el.name === 'w:pPr');
    expect(pPr).toBeDefined();

    // Find the tabs element within pPr
    const tabs = pPr.elements.find((el) => el.name === 'w:tabs');
    expect(tabs).toBeDefined();
    expect(tabs.elements).toBeDefined();
    expect(tabs.elements.length).toBe(3);

    // Check first tab stop
    const firstTab = tabs.elements[0];
    expect(firstTab.name).toBe('w:tab');
    expect(firstTab.attributes['w:val']).toBe('start');
    expect(firstTab.attributes['w:pos']).toBe('2160');
    expect(firstTab.attributes['w:leader']).toBeUndefined();

    // Check second tab stop
    const secondTab = tabs.elements[1];
    expect(secondTab.name).toBe('w:tab');
    expect(secondTab.attributes['w:val']).toBe('center');
    expect(secondTab.attributes['w:pos']).toBe('5040');
    expect(secondTab.attributes['w:leader']).toBe('dot');

    // Check third tab stop
    const thirdTab = tabs.elements[2];
    expect(thirdTab.name).toBe('w:tab');
    expect(thirdTab.attributes['w:val']).toBe('decimal');
    expect(thirdTab.attributes['w:pos']).toBe('7200');
    expect(thirdTab.attributes['w:leader']).toBe('underscore');
  });

  it('correctly exports paragraph without tab stops', () => {
    const mockEditor = createMockEditor();
    const mockParagraphNode = createParagraphNode();

    const result = wPTranslator.decode({
      editor: mockEditor,
      node: mockParagraphNode,
    });

    expect(result.name).toBe('w:p');
    expect(result.elements).toBeDefined();

    // Find the pPr element (if it exists)
    const pPr = result.elements.find((el) => el.name === 'w:pPr');

    if (pPr) {
      // If pPr exists, it should not contain tabs
      const tabs = pPr.elements?.find((el) => el.name === 'w:tabs');
      expect(tabs).toBeUndefined();
    }
  });

  it('correctly exports paragraph with empty tab stops array', () => {
    const mockEditor = createMockEditor();
    const mockParagraphNode = createParagraphNode({ tabStops: [] });

    const result = wPTranslator.decode({
      editor: mockEditor,
      node: mockParagraphNode,
    });

    expect(result.name).toBe('w:p');
    expect(result.elements).toBeDefined();

    // Find the pPr element (if it exists)
    const pPr = result.elements.find((el) => el.name === 'w:pPr');

    if (pPr) {
      // If pPr exists, it should not contain tabs for empty array
      const tabs = pPr.elements?.find((el) => el.name === 'w:tabs');
      expect(tabs).toBeUndefined();
    }
  });

  it('correctly exports tab stop with default val attribute', () => {
    const mockEditor = createMockEditor();
    const mockParagraphNode = createParagraphNode({
      tabStops: [
        {
          tab: {
            pos: 1440,
            // No val specified, should default to 'start'
          },
        },
      ],
    });

    const result = wPTranslator.decode({
      editor: mockEditor,
      node: mockParagraphNode,
    });

    expect(result.name).toBe('w:p');

    const pPr = result.elements.find((el) => el.name === 'w:pPr');
    expect(pPr).toBeDefined();

    const tabs = pPr.elements.find((el) => el.name === 'w:tabs');
    expect(tabs).toBeDefined();
    expect(tabs.elements.length).toBe(1);

    const tab = tabs.elements[0];
    expect(tab.name).toBe('w:tab');
    expect(tab.attributes['w:val']).toBeUndefined();
    expect(tab.attributes['w:pos']).toBe('1440');
    expect(tab.attributes['w:leader']).toBeUndefined();
  });

  it('correctly exports tab stops with all supported val types', () => {
    const mockEditor = createMockEditor();
    const supportedTypes = ['bar', 'center', 'clear', 'decimal', 'end', 'num', 'start'];

    const tabStops = supportedTypes.map((type, index) => ({
      tab: {
        tabType: type,
        pos: (index + 1) * 1440, // 1 inch intervals
      },
    }));

    const mockParagraphNode = createParagraphNode({ tabStops });

    const result = wPTranslator.decode({
      editor: mockEditor,
      node: mockParagraphNode,
    });

    const pPr = result.elements.find((el) => el.name === 'w:pPr');
    const tabs = pPr.elements.find((el) => el.name === 'w:tabs');

    expect(tabs.elements.length).toBe(supportedTypes.length);

    supportedTypes.forEach((type, index) => {
      const tab = tabs.elements[index];
      expect(tab.attributes['w:val']).toBe(type);
      expect(tab.attributes['w:pos']).toBe(((index + 1) * 1440).toString());
    });
  });

  it('correctly exports tab stops with all supported leader types', () => {
    const mockEditor = createMockEditor();
    const supportedLeaders = ['dot', 'heavy', 'hyphen', 'middleDot', 'none', 'underscore'];

    const tabStops = supportedLeaders.map((leader, index) => ({
      tab: {
        tabType: 'start',
        pos: (index + 1) * 1440,
        leader,
      },
    }));

    const mockParagraphNode = createParagraphNode({ tabStops });

    const result = wPTranslator.decode({
      editor: mockEditor,
      node: mockParagraphNode,
    });

    const pPr = result.elements.find((el) => el.name === 'w:pPr');
    const tabs = pPr.elements.find((el) => el.name === 'w:tabs');

    expect(tabs.elements.length).toBe(supportedLeaders.length);

    supportedLeaders.forEach((leader, index) => {
      const tab = tabs.elements[index];
      expect(tab.attributes['w:val']).toBe('start');
      expect(tab.attributes['w:pos']).toBe(((index + 1) * 1440).toString());
      expect(tab.attributes['w:leader']).toBe(leader);
    });
  });
});
