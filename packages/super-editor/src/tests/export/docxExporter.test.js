import { describe, it, expect } from 'vitest';
import { DocxExporter } from '@core/super-converter/exporter.js';

describe('DocxExporter', () => {
  // Helper to create a minimal converter stub
  const createConverterStub = () => ({
    declaration: {
      attributes: {
        version: '1.0',
        encoding: 'utf-8',
        standalone: 'yes',
      },
    },
  });

  it('escapes reserved characters within w:instrText nodes', () => {
    const exporter = new DocxExporter(createConverterStub());

    const data = {
      name: 'w:document',
      attributes: {},
      elements: [
        {
          name: 'w:instrText',
          attributes: {
            'xml:space': 'preserve',
          },
          elements: [
            {
              type: 'text',
              text: ' DOCPROPERTY DOCXDOCID Format=<<NUM>>_<<VER>> ',
            },
          ],
        },
      ],
    };

    const xml = exporter.schemaToXml(data);

    expect(xml).toContain('Format=&lt;&lt;NUM&gt;&gt;_&lt;&lt;VER&gt;&gt;');
  });

  it('does not double-escape ampersands in text nodes', () => {
    const exporter = new DocxExporter(createConverterStub());

    const data = {
      name: 'w:document',
      attributes: {},
      elements: [
        {
          name: 'w:t',
          elements: [
            {
              type: 'text',
              text: 'Rock & Roll &amp; Jazz',
            },
          ],
        },
      ],
    };

    const xml = exporter.schemaToXml(data);

    expect(xml).toContain('Rock &amp; Roll &amp; Jazz');
    expect(xml).not.toContain('&amp;amp;');
  });

  describe('error handling for text elements', () => {
    it('handles missing elements array gracefully', () => {
      const exporter = new DocxExporter(createConverterStub());

      const data = {
        name: 'w:document',
        attributes: {},
        elements: [
          {
            name: 'w:t',
            // No elements array
          },
        ],
      };

      const xml = exporter.schemaToXml(data);

      // Should create self-closing w:t element without throwing
      expect(xml).toContain('<w:t />');
    });

    it('handles empty elements array gracefully', () => {
      const exporter = new DocxExporter(createConverterStub());

      const data = {
        name: 'w:document',
        attributes: {},
        elements: [
          {
            name: 'w:t',
            elements: [],
          },
        ],
      };

      const xml = exporter.schemaToXml(data);

      // Empty elements array results in self-closing tag (error state, but doesn't crash)
      expect(xml).toContain('<w:t />');
    });

    it('handles missing text property gracefully', () => {
      const exporter = new DocxExporter(createConverterStub());

      const data = {
        name: 'w:document',
        attributes: {},
        elements: [
          {
            name: 'w:t',
            elements: [
              {
                type: 'text',
                // No text property
              },
            ],
          },
        ],
      };

      const xml = exporter.schemaToXml(data);

      // Should create empty w:t element without throwing
      expect(xml).toContain('<w:t></w:t>');
    });

    it('handles null element gracefully', () => {
      const exporter = new DocxExporter(createConverterStub());

      const data = {
        name: 'w:document',
        attributes: {},
        elements: [
          {
            name: 'w:delText',
            elements: [null],
          },
        ],
      };

      const xml = exporter.schemaToXml(data);

      // Should create empty element without throwing
      expect(xml).toContain('<w:delText></w:delText>');
    });
  });

  describe('[[sdspace]] placeholder removal', () => {
    it('removes a single [[sdspace]] placeholder from w:t element', () => {
      const exporter = new DocxExporter(createConverterStub());

      const data = {
        name: 'w:document',
        attributes: {},
        elements: [
          {
            name: 'w:t',
            elements: [
              {
                type: 'text',
                text: 'Hello[[sdspace]]World',
              },
            ],
          },
        ],
      };

      const xml = exporter.schemaToXml(data);

      expect(xml).toContain('<w:t>HelloWorld</w:t>');
      expect(xml).not.toContain('[[sdspace]]');
    });

    it('removes multiple [[sdspace]] placeholders from w:t element', () => {
      const exporter = new DocxExporter(createConverterStub());

      const data = {
        name: 'w:document',
        attributes: {},
        elements: [
          {
            name: 'w:t',
            elements: [
              {
                type: 'text',
                text: '[[sdspace]]Text[[sdspace]]with[[sdspace]]multiple[[sdspace]]placeholders[[sdspace]]',
              },
            ],
          },
        ],
      };

      const xml = exporter.schemaToXml(data);

      expect(xml).toContain('<w:t>Textwithmultipleplaceholders</w:t>');
      expect(xml).not.toContain('[[sdspace]]');
    });

    it('removes [[sdspace]] from w:delText element', () => {
      const exporter = new DocxExporter(createConverterStub());

      const data = {
        name: 'w:document',
        attributes: {},
        elements: [
          {
            name: 'w:delText',
            elements: [
              {
                type: 'text',
                text: 'Deleted[[sdspace]]text',
              },
            ],
          },
        ],
      };

      const xml = exporter.schemaToXml(data);

      expect(xml).toContain('<w:delText>Deletedtext</w:delText>');
      expect(xml).not.toContain('[[sdspace]]');
    });

    it('removes [[sdspace]] from wp:posOffset element', () => {
      const exporter = new DocxExporter(createConverterStub());

      const data = {
        name: 'w:document',
        attributes: {},
        elements: [
          {
            name: 'wp:posOffset',
            elements: [
              {
                type: 'text',
                text: '[[sdspace]]12345[[sdspace]]',
              },
            ],
          },
        ],
      };

      const xml = exporter.schemaToXml(data);

      expect(xml).toContain('<wp:posOffset>12345</wp:posOffset>');
      expect(xml).not.toContain('[[sdspace]]');
    });

    it('does not corrupt text without placeholders', () => {
      const exporter = new DocxExporter(createConverterStub());

      const data = {
        name: 'w:document',
        attributes: {},
        elements: [
          {
            name: 'w:t',
            elements: [
              {
                type: 'text',
                text: 'Normal text without any placeholders!',
              },
            ],
          },
        ],
      };

      const xml = exporter.schemaToXml(data);

      expect(xml).toContain('<w:t>Normal text without any placeholders!</w:t>');
    });

    it('handles text that is only [[sdspace]] markers', () => {
      const exporter = new DocxExporter(createConverterStub());

      const data = {
        name: 'w:document',
        attributes: {},
        elements: [
          {
            name: 'w:t',
            elements: [
              {
                type: 'text',
                text: '[[sdspace]][[sdspace]][[sdspace]]',
              },
            ],
          },
        ],
      };

      const xml = exporter.schemaToXml(data);

      expect(xml).toContain('<w:t></w:t>');
      expect(xml).not.toContain('[[sdspace]]');
    });

    it('handles consecutive [[sdspace]] markers', () => {
      const exporter = new DocxExporter(createConverterStub());

      const data = {
        name: 'w:document',
        attributes: {},
        elements: [
          {
            name: 'w:t',
            elements: [
              {
                type: 'text',
                text: 'Start[[sdspace]][[sdspace]][[sdspace]]End',
              },
            ],
          },
        ],
      };

      const xml = exporter.schemaToXml(data);

      expect(xml).toContain('<w:t>StartEnd</w:t>');
      expect(xml).not.toContain('[[sdspace]]');
    });

    it('preserves other bracket patterns like [[notspace]]', () => {
      const exporter = new DocxExporter(createConverterStub());

      const data = {
        name: 'w:document',
        attributes: {},
        elements: [
          {
            name: 'w:t',
            elements: [
              {
                type: 'text',
                text: 'Text with [[notspace]] and [[sdspace]] and [[other]]',
              },
            ],
          },
        ],
      };

      const xml = exporter.schemaToXml(data);

      expect(xml).toContain('<w:t>Text with [[notspace]] and  and [[other]]</w:t>');
      expect(xml).not.toContain('[[sdspace]]');
      expect(xml).toContain('[[notspace]]');
      expect(xml).toContain('[[other]]');
    });

    it('does not remove [[sdspace]] from w:instrText elements', () => {
      const exporter = new DocxExporter(createConverterStub());

      const data = {
        name: 'w:document',
        attributes: {},
        elements: [
          {
            name: 'w:instrText',
            elements: [
              {
                type: 'text',
                text: 'FIELD[[sdspace]]INSTRUCTION',
              },
            ],
          },
        ],
      };

      const xml = exporter.schemaToXml(data);

      // w:instrText should preserve the text as-is (only escapes special chars)
      expect(xml).toContain('FIELD[[sdspace]]INSTRUCTION');
    });

    it('handles special characters along with [[sdspace]] placeholders', () => {
      const exporter = new DocxExporter(createConverterStub());

      const data = {
        name: 'w:document',
        attributes: {},
        elements: [
          {
            name: 'w:t',
            elements: [
              {
                type: 'text',
                text: 'Text[[sdspace]]with & special < characters > and "quotes"',
              },
            ],
          },
        ],
      };

      const xml = exporter.schemaToXml(data);

      expect(xml).toContain('<w:t>Textwith &amp; special &lt; characters &gt; and &quot;quotes&quot;</w:t>');
      expect(xml).not.toContain('[[sdspace]]');
    });
  });
});
