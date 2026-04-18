import { getExportedResultWithDocContent } from './export-helpers/index';

// Mapping of SuperDoc paragraph attrs -> OOXML attribute names for <w:p>
const XML_ATTRS = {
  paraId: 'w14:paraId',
  textId: 'w14:textId',
  rsidR: 'w:rsidR',
  rsidRDefault: 'w:rsidRDefault',
  rsidP: 'w:rsidP',
  rsidRPr: 'w:rsidRPr',
  rsidDel: 'w:rsidDel',
};

const makeParagraph = (attrs, text = 'Attr Round Trip') => ({
  type: 'paragraph',
  attrs,
  content: [{ type: 'text', text }],
});

const getFirstParagraph = (result) => {
  const body = result.elements?.find((el) => el.name === 'w:body');
  if (!body) throw new Error('w:body not found in export result');
  return body.elements?.find((el) => el.name === 'w:p');
};

const getParagraphs = (result) => {
  const body = result.elements?.find((el) => el.name === 'w:body');
  if (!body) throw new Error('w:body not found in export result');
  return (body.elements || []).filter((el) => el.name === 'w:p');
};

describe('Paragraph attribute round-trip (7 valid attrs)', () => {
  it('round-trips all 7 attributes on a paragraph', async () => {
    const paraAttrs = {
      paraId: 'P-ABCDEF01',
      textId: 'T-ABCDEF02',
      rsidR: '00AAA111',
      rsidRDefault: '00BBB222',
      rsidP: '00CCC333',
      rsidRPr: '00DDD444',
      rsidDel: '00EEE555',
    };
    const content = [makeParagraph(paraAttrs)];
    const result = await getExportedResultWithDocContent(content);
    const p = getFirstParagraph(result);

    expect(p).toBeDefined();
    // All should be present and exactly equal
    Object.entries(XML_ATTRS).forEach(([sdKey, xmlKey]) => {
      expect(p.attributes?.[xmlKey]).toBe(paraAttrs[sdKey]);
    });
  });

  it('round-trips each attribute individually', async () => {
    const cases = [
      ['paraId', 'P-ONLY'],
      ['textId', 'T-ONLY'],
      ['rsidR', '11AAA111'],
      ['rsidRDefault', '22BBB222'],
      ['rsidP', '33CCC333'],
      ['rsidRPr', '44DDD444'],
      ['rsidDel', '55EEE555'],
    ];

    for (const [sdKey, value] of cases) {
      const attrs = { [sdKey]: value };
      const content = [makeParagraph(attrs, `Case ${sdKey}`)];
      const result = await getExportedResultWithDocContent(content);
      const p = getFirstParagraph(result);
      expect(p).toBeDefined();

      // Provided attr must exist and match
      const xmlKey = XML_ATTRS[sdKey];
      expect(p.attributes?.[xmlKey]).toBe(value);

      // Non-provided attrs should be undefined
      Object.entries(XML_ATTRS)
        .filter(([k]) => k !== sdKey)
        .forEach(([, otherXmlKey]) => {
          expect(p.attributes?.[otherXmlKey]).toBeUndefined();
        });
    }
  });

  it('round-trips a mixed subset of attributes', async () => {
    const subset = {
      paraId: 'P-MIXED',
      rsidR: '66AAA666',
      rsidRPr: '77DDD777',
    };
    const content = [makeParagraph(subset, 'Mixed subset')];
    const result = await getExportedResultWithDocContent(content);
    const p = getFirstParagraph(result);
    expect(p).toBeDefined();

    // Present in subset
    Object.entries(subset).forEach(([sdKey, value]) => {
      const xmlKey = XML_ATTRS[sdKey];
      expect(p.attributes?.[xmlKey]).toBe(value);
    });

    // Absent from subset
    Object.keys(XML_ATTRS)
      .filter((k) => !(k in subset))
      .forEach((sdKey) => {
        const xmlKey = XML_ATTRS[sdKey];
        expect(p.attributes?.[xmlKey]).toBeUndefined();
      });
  });

  it('round-trips multiple paragraphs with varied combinations (no bleed between nodes)', async () => {
    const combos = [
      { paraId: 'P0', textId: 'T0' },
      { rsidR: 'R1', rsidP: 'RP1', rsidDel: 'RD1' },
      { rsidRDefault: 'RRD2', rsidRPr: 'RPR2' },
      {},
    ];

    const content = combos.map((attrs, i) => makeParagraph(attrs, `Para ${i}`));
    const result = await getExportedResultWithDocContent(content);
    const ps = getParagraphs(result);

    expect(ps.length).toBeGreaterThanOrEqual(4);

    combos.forEach((attrs, idx) => {
      const p = ps[idx];
      expect(p).toBeDefined();
      // Present keys
      Object.entries(attrs).forEach(([sdKey, value]) => {
        const xmlKey = XML_ATTRS[sdKey];
        expect(p.attributes?.[xmlKey]).toBe(value);
      });
      // Absent keys
      Object.keys(XML_ATTRS)
        .filter((k) => !(k in attrs))
        .forEach((sdKey) => {
          const xmlKey = XML_ATTRS[sdKey];
          expect(p.attributes?.[xmlKey]).toBeUndefined();
        });
    });
  });

  it('round-trips another mixed set of attributes', async () => {
    const subset = {
      textId: 'T-M2',
      rsidR: 'R-M2',
      rsidDel: 'DEL-M2',
    };
    const content = [makeParagraph(subset, 'Mixed 2')];
    const result = await getExportedResultWithDocContent(content);
    const p = getFirstParagraph(result);
    expect(p).toBeDefined();

    Object.entries(subset).forEach(([sdKey, value]) => {
      const xmlKey = XML_ATTRS[sdKey];
      expect(p.attributes?.[xmlKey]).toBe(value);
    });

    Object.keys(XML_ATTRS)
      .filter((k) => !(k in subset))
      .forEach((sdKey) => {
        const xmlKey = XML_ATTRS[sdKey];
        expect(p.attributes?.[xmlKey]).toBeUndefined();
      });
  });
});
