import { describe, it, expect } from 'vitest';
import { CHART_URI, resolveChartPart, parseChartXml } from './chart-helpers.js';

describe('chart-helpers', () => {
  describe('CHART_URI', () => {
    it('matches the OOXML chart graphic data URI', () => {
      expect(CHART_URI).toBe('http://schemas.openxmlformats.org/drawingml/2006/chart');
    });
  });

  describe('resolveChartPart', () => {
    it('resolves chart part path from relationship ID', () => {
      const docx = {
        'word/_rels/document.xml.rels': {
          elements: [
            {
              name: 'Relationships',
              elements: [
                {
                  name: 'Relationship',
                  attributes: {
                    Id: 'rId4',
                    Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart',
                    Target: 'charts/chart1.xml',
                  },
                },
              ],
            },
          ],
        },
      };

      const result = resolveChartPart(docx, 'rId4');
      expect(result).not.toBeNull();
      expect(result.chartPartPath).toBe('word/charts/chart1.xml');
    });

    it('returns null for unknown relationship ID', () => {
      const docx = {
        'word/_rels/document.xml.rels': {
          elements: [{ name: 'Relationships', elements: [] }],
        },
      };
      expect(resolveChartPart(docx, 'rId999')).toBeNull();
    });

    it('returns null when no docx provided', () => {
      expect(resolveChartPart(null, 'rId4')).toBeNull();
    });

    it('returns null when no chartRelId provided', () => {
      expect(resolveChartPart({}, null)).toBeNull();
    });

    const makeDocxWithTarget = (target) => ({
      'word/_rels/document.xml.rels': {
        elements: [
          {
            name: 'Relationships',
            elements: [{ name: 'Relationship', attributes: { Id: 'rId1', Target: target } }],
          },
        ],
      },
    });

    it('normalizes ./charts/chart1.xml prefix', () => {
      const result = resolveChartPart(makeDocxWithTarget('./charts/chart1.xml'), 'rId1');
      expect(result.chartPartPath).toBe('word/charts/chart1.xml');
    });

    it('normalizes ../charts/chart1.xml parent reference', () => {
      const result = resolveChartPart(makeDocxWithTarget('../charts/chart1.xml'), 'rId1');
      expect(result.chartPartPath).toBe('word/charts/chart1.xml');
    });

    it('normalizes absolute /word/charts/chart1.xml path', () => {
      const result = resolveChartPart(makeDocxWithTarget('/word/charts/chart1.xml'), 'rId1');
      expect(result.chartPartPath).toBe('word/charts/chart1.xml');
    });

    it('resolves rels from story-specific file (header)', () => {
      const docx = {
        'word/_rels/header1.xml.rels': {
          elements: [
            {
              name: 'Relationships',
              elements: [{ name: 'Relationship', attributes: { Id: 'rId2', Target: 'charts/chart2.xml' } }],
            },
          ],
        },
      };
      const result = resolveChartPart(docx, 'rId2', 'header1.xml');
      expect(result).not.toBeNull();
      expect(result.chartPartPath).toBe('word/charts/chart2.xml');
    });
  });

  describe('parseChartXml', () => {
    const makeBarChartXml = () => ({
      name: 'c:chartSpace',
      elements: [
        {
          name: 'c:chart',
          elements: [
            {
              name: 'c:plotArea',
              elements: [
                {
                  name: 'c:barChart',
                  elements: [
                    {
                      name: 'c:barDir',
                      attributes: { val: 'col' },
                    },
                    {
                      name: 'c:grouping',
                      attributes: { val: 'clustered' },
                    },
                    {
                      name: 'c:ser',
                      elements: [
                        {
                          name: 'c:idx',
                          attributes: { val: '0' },
                        },
                        {
                          name: 'c:tx',
                          elements: [
                            {
                              name: 'c:strRef',
                              elements: [
                                {
                                  name: 'c:strCache',
                                  elements: [
                                    {
                                      name: 'c:pt',
                                      attributes: { idx: '0' },
                                      elements: [{ name: 'c:v', elements: [{ text: 'Series 1' }] }],
                                    },
                                  ],
                                },
                              ],
                            },
                          ],
                        },
                        {
                          name: 'c:cat',
                          elements: [
                            {
                              name: 'c:strRef',
                              elements: [
                                {
                                  name: 'c:strCache',
                                  elements: [
                                    {
                                      name: 'c:pt',
                                      attributes: { idx: '0' },
                                      elements: [{ name: 'c:v', elements: [{ text: 'Q1' }] }],
                                    },
                                    {
                                      name: 'c:pt',
                                      attributes: { idx: '1' },
                                      elements: [{ name: 'c:v', elements: [{ text: 'Q2' }] }],
                                    },
                                    {
                                      name: 'c:pt',
                                      attributes: { idx: '2' },
                                      elements: [{ name: 'c:v', elements: [{ text: 'Q3' }] }],
                                    },
                                  ],
                                },
                              ],
                            },
                          ],
                        },
                        {
                          name: 'c:val',
                          elements: [
                            {
                              name: 'c:numRef',
                              elements: [
                                {
                                  name: 'c:numCache',
                                  elements: [
                                    {
                                      name: 'c:pt',
                                      attributes: { idx: '0' },
                                      elements: [{ name: 'c:v', elements: [{ text: '100' }] }],
                                    },
                                    {
                                      name: 'c:pt',
                                      attributes: { idx: '1' },
                                      elements: [{ name: 'c:v', elements: [{ text: '200' }] }],
                                    },
                                    {
                                      name: 'c:pt',
                                      attributes: { idx: '2' },
                                      elements: [{ name: 'c:v', elements: [{ text: '150' }] }],
                                    },
                                  ],
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
                {
                  name: 'c:catAx',
                  elements: [
                    {
                      name: 'c:scaling',
                      elements: [{ name: 'c:orientation', attributes: { val: 'minMax' } }],
                    },
                  ],
                },
                {
                  name: 'c:valAx',
                  elements: [],
                },
              ],
            },
            {
              name: 'c:legend',
              elements: [{ name: 'c:legendPos', attributes: { val: 'r' } }],
            },
          ],
        },
        {
          name: 'c:style',
          attributes: { val: '2' },
        },
      ],
    });

    const makeBarChartXmlWithAlternateContentStyle = ({ choiceStyle, fallbackStyle }) => {
      const xml = makeBarChartXml();
      xml.elements = xml.elements.filter((el) => el.name !== 'c:style');

      const altContent = {
        name: 'mc:AlternateContent',
        elements: [
          {
            name: 'mc:Choice',
            attributes: { Requires: 'c14' },
            elements: choiceStyle != null ? [{ name: 'c14:style', attributes: { val: String(choiceStyle) } }] : [],
          },
          ...(fallbackStyle != null
            ? [
                {
                  name: 'mc:Fallback',
                  elements: [{ name: 'c:style', attributes: { val: String(fallbackStyle) } }],
                },
              ]
            : []),
        ],
      };

      xml.elements.unshift(altContent);
      return xml;
    };

    it('parses a bar chart with series, categories, and values', () => {
      const result = parseChartXml(makeBarChartXml());

      expect(result).not.toBeNull();
      expect(result.chartType).toBe('barChart');
      expect(result.subType).toBe('clustered');
      expect(result.barDirection).toBe('col');
      expect(result.series).toHaveLength(1);

      const series = result.series[0];
      expect(series.name).toBe('Series 1');
      expect(series.categories).toEqual(['Q1', 'Q2', 'Q3']);
      expect(series.values).toEqual([100, 200, 150]);
    });

    it('parses legend position', () => {
      const result = parseChartXml(makeBarChartXml());
      expect(result.legendPosition).toBe('r');
    });

    it('parses style ID', () => {
      const result = parseChartXml(makeBarChartXml());
      expect(result.styleId).toBe(2);
    });

    it('prefers c14 style in mc:AlternateContent when present', () => {
      const result = parseChartXml(makeBarChartXmlWithAlternateContentStyle({ choiceStyle: 102, fallbackStyle: 2 }));
      expect(result.styleId).toBe(102);
    });

    it('falls back to mc:Fallback c:style when c14 style is missing', () => {
      const result = parseChartXml(makeBarChartXmlWithAlternateContentStyle({ choiceStyle: null, fallbackStyle: 3 }));
      expect(result.styleId).toBe(3);
    });

    it('parses category axis orientation', () => {
      const result = parseChartXml(makeBarChartXml());
      expect(result.categoryAxis).toEqual({ orientation: 'minMax' });
    });

    it('returns null for missing chart element', () => {
      expect(parseChartXml({ name: 'c:chartSpace', elements: [] })).toBeNull();
    });

    it('returns null for missing plotArea', () => {
      const xml = {
        name: 'c:chartSpace',
        elements: [{ name: 'c:chart', elements: [] }],
      };
      expect(parseChartXml(xml)).toBeNull();
    });

    it('returns null when plotArea has no chart-type elements at all', () => {
      const xml = {
        name: 'c:chartSpace',
        elements: [
          {
            name: 'c:chart',
            elements: [{ name: 'c:plotArea', elements: [{ name: 'c:catAx' }] }],
          },
        ],
      };
      expect(parseChartXml(xml)).toBeNull();
    });

    it('parses unrecognized chart types with raw element name for placeholder rendering', () => {
      const xml = {
        name: 'c:chartSpace',
        elements: [
          {
            name: 'c:chart',
            elements: [
              {
                name: 'c:plotArea',
                elements: [{ name: 'c:surfaceChart', elements: [] }],
              },
            ],
          },
        ],
      };
      const result = parseChartXml(xml);
      expect(result).not.toBeNull();
      expect(result.chartType).toBe('surfaceChart');
      expect(result.series).toEqual([]);
    });

    it('parses ofPie chart type explicitly', () => {
      const xml = {
        name: 'c:chartSpace',
        elements: [
          {
            name: 'c:chart',
            elements: [
              {
                name: 'c:plotArea',
                elements: [
                  {
                    name: 'c:ofPieChart',
                    elements: [
                      {
                        name: 'c:ser',
                        elements: [
                          { name: 'c:idx', attributes: { val: '0' } },
                          {
                            name: 'c:tx',
                            elements: [
                              {
                                name: 'c:strRef',
                                elements: [
                                  {
                                    name: 'c:strCache',
                                    elements: [
                                      {
                                        name: 'c:pt',
                                        attributes: { idx: '0' },
                                        elements: [{ name: 'c:v', elements: [{ text: 'Sales' }] }],
                                      },
                                    ],
                                  },
                                ],
                              },
                            ],
                          },
                          {
                            name: 'c:cat',
                            elements: [
                              {
                                name: 'c:strRef',
                                elements: [
                                  {
                                    name: 'c:strCache',
                                    elements: [
                                      {
                                        name: 'c:pt',
                                        attributes: { idx: '0' },
                                        elements: [{ name: 'c:v', elements: [{ text: 'Q1' }] }],
                                      },
                                    ],
                                  },
                                ],
                              },
                            ],
                          },
                          {
                            name: 'c:val',
                            elements: [
                              {
                                name: 'c:numRef',
                                elements: [
                                  {
                                    name: 'c:numCache',
                                    elements: [
                                      {
                                        name: 'c:pt',
                                        attributes: { idx: '0' },
                                        elements: [{ name: 'c:v', elements: [{ text: '10' }] }],
                                      },
                                    ],
                                  },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };
      const result = parseChartXml(xml);
      expect(result).not.toBeNull();
      expect(result.chartType).toBe('ofPieChart');
      expect(result.series[0]?.name).toBe('Sales');
    });

    it('parses scatter chart x/y series values', () => {
      const xml = {
        name: 'c:chartSpace',
        elements: [
          {
            name: 'c:chart',
            elements: [
              {
                name: 'c:plotArea',
                elements: [
                  {
                    name: 'c:scatterChart',
                    elements: [
                      {
                        name: 'c:ser',
                        elements: [
                          { name: 'c:idx', attributes: { val: '0' } },
                          {
                            name: 'c:tx',
                            elements: [
                              {
                                name: 'c:strRef',
                                elements: [
                                  {
                                    name: 'c:strCache',
                                    elements: [
                                      {
                                        name: 'c:pt',
                                        attributes: { idx: '0' },
                                        elements: [{ name: 'c:v', elements: [{ text: 'XY' }] }],
                                      },
                                    ],
                                  },
                                ],
                              },
                            ],
                          },
                          {
                            name: 'c:xVal',
                            elements: [
                              {
                                name: 'c:numRef',
                                elements: [
                                  {
                                    name: 'c:numCache',
                                    elements: [
                                      {
                                        name: 'c:pt',
                                        attributes: { idx: '0' },
                                        elements: [{ name: 'c:v', elements: [{ text: '1' }] }],
                                      },
                                      {
                                        name: 'c:pt',
                                        attributes: { idx: '1' },
                                        elements: [{ name: 'c:v', elements: [{ text: '2' }] }],
                                      },
                                    ],
                                  },
                                ],
                              },
                            ],
                          },
                          {
                            name: 'c:yVal',
                            elements: [
                              {
                                name: 'c:numRef',
                                elements: [
                                  {
                                    name: 'c:numCache',
                                    elements: [
                                      {
                                        name: 'c:pt',
                                        attributes: { idx: '0' },
                                        elements: [{ name: 'c:v', elements: [{ text: '10' }] }],
                                      },
                                      {
                                        name: 'c:pt',
                                        attributes: { idx: '1' },
                                        elements: [{ name: 'c:v', elements: [{ text: '20' }] }],
                                      },
                                    ],
                                  },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = parseChartXml(xml);
      expect(result).not.toBeNull();
      expect(result.chartType).toBe('scatterChart');
      expect(result.series[0]).toMatchObject({
        name: 'XY',
        values: [10, 20],
        xValues: [1, 2],
      });
    });

    it('parses bubble chart x/y/size values', () => {
      const xml = {
        name: 'c:chartSpace',
        elements: [
          {
            name: 'c:chart',
            elements: [
              {
                name: 'c:plotArea',
                elements: [
                  {
                    name: 'c:bubbleChart',
                    elements: [
                      {
                        name: 'c:ser',
                        elements: [
                          { name: 'c:idx', attributes: { val: '0' } },
                          {
                            name: 'c:xVal',
                            elements: [
                              {
                                name: 'c:numRef',
                                elements: [
                                  {
                                    name: 'c:numCache',
                                    elements: [
                                      {
                                        name: 'c:pt',
                                        attributes: { idx: '0' },
                                        elements: [{ name: 'c:v', elements: [{ text: '5' }] }],
                                      },
                                    ],
                                  },
                                ],
                              },
                            ],
                          },
                          {
                            name: 'c:yVal',
                            elements: [
                              {
                                name: 'c:numRef',
                                elements: [
                                  {
                                    name: 'c:numCache',
                                    elements: [
                                      {
                                        name: 'c:pt',
                                        attributes: { idx: '0' },
                                        elements: [{ name: 'c:v', elements: [{ text: '30' }] }],
                                      },
                                    ],
                                  },
                                ],
                              },
                            ],
                          },
                          {
                            name: 'c:bubbleSize',
                            elements: [
                              {
                                name: 'c:numRef',
                                elements: [
                                  {
                                    name: 'c:numCache',
                                    elements: [
                                      {
                                        name: 'c:pt',
                                        attributes: { idx: '0' },
                                        elements: [{ name: 'c:v', elements: [{ text: '12' }] }],
                                      },
                                    ],
                                  },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = parseChartXml(xml);
      expect(result).not.toBeNull();
      expect(result.chartType).toBe('bubbleChart');
      expect(result.series[0]).toMatchObject({
        values: [30],
        xValues: [5],
        bubbleSizes: [12],
      });
    });

    it('handles series with missing cached data gracefully', () => {
      const xml = {
        name: 'c:chartSpace',
        elements: [
          {
            name: 'c:chart',
            elements: [
              {
                name: 'c:plotArea',
                elements: [
                  {
                    name: 'c:barChart',
                    elements: [
                      {
                        name: 'c:ser',
                        elements: [{ name: 'c:idx', attributes: { val: '0' } }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = parseChartXml(xml);
      expect(result).not.toBeNull();
      expect(result.series).toHaveLength(1);
      expect(result.series[0].name).toBe('Series 0');
      expect(result.series[0].categories).toEqual([]);
      expect(result.series[0].values).toEqual([]);
    });
  });
});
