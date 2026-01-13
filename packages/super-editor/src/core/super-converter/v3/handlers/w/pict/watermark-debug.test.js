import { describe, it, expect } from 'vitest';
import { pictNodeTypeStrategy } from './helpers/pict-node-type-strategy';
import { handleShapeImageWatermarkImport } from './helpers/handle-shape-image-watermark-import';

describe('Watermark Import Debug - User XML', () => {
  it('should import the exact user-provided watermark XML', () => {
    // Mock DOCX with the relationship
    const mockDocx = {
      'word/_rels/header1.xml.rels': {
        elements: [
          {
            name: 'Relationships',
            elements: [
              {
                name: 'Relationship',
                attributes: {
                  Id: 'rId1',
                  Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
                  Target: 'media/balloons.png',
                },
              },
            ],
          },
        ],
      },
    };

    // Exact XML from user's example
    const userWatermarkPict = {
      name: 'w:pict',
      attributes: {
        'w14:anchorId': '01741A80',
      },
      elements: [
        {
          name: 'v:shapetype',
          attributes: {
            id: '_x0000_t75',
            coordsize: '21600,21600',
            'o:spt': '75',
            'o:preferrelative': 't',
            path: 'm@4@5l@4@11@9@11@9@5xe',
            filled: 'f',
            stroked: 'f',
          },
          elements: [
            {
              name: 'v:stroke',
              attributes: {
                joinstyle: 'miter',
              },
            },
            {
              name: 'v:formulas',
              elements: [
                { name: 'v:f', attributes: { eqn: 'if lineDrawn pixelLineWidth 0' } },
                { name: 'v:f', attributes: { eqn: 'sum @0 1 0' } },
                { name: 'v:f', attributes: { eqn: 'sum 0 0 @1' } },
                { name: 'v:f', attributes: { eqn: 'prod @2 1 2' } },
                { name: 'v:f', attributes: { eqn: 'prod @3 21600 pixelWidth' } },
                { name: 'v:f', attributes: { eqn: 'prod @3 21600 pixelHeight' } },
                { name: 'v:f', attributes: { eqn: 'sum @0 0 1' } },
                { name: 'v:f', attributes: { eqn: 'prod @6 1 2' } },
                { name: 'v:f', attributes: { eqn: 'prod @7 21600 pixelWidth' } },
                { name: 'v:f', attributes: { eqn: 'sum @8 21600 0' } },
                { name: 'v:f', attributes: { eqn: 'prod @7 21600 pixelHeight' } },
                { name: 'v:f', attributes: { eqn: 'sum @10 21600 0' } },
              ],
            },
            {
              name: 'v:path',
              attributes: {
                'o:extrusionok': 'f',
                gradientshapeok: 't',
                'o:connecttype': 'rect',
              },
            },
            {
              name: 'o:lock',
              attributes: {
                'v:ext': 'edit',
                aspectratio: 't',
              },
            },
          ],
        },
        {
          name: 'v:shape',
          attributes: {
            id: 'WordPictureWatermark100927634',
            'o:spid': '_x0000_s1027',
            type: '#_x0000_t75',
            alt: '',
            style:
              'position:absolute;margin-left:0;margin-top:0;width:466.55pt;height:233.25pt;z-index:-251653120;mso-wrap-edited:f;mso-width-percent:0;mso-height-percent:0;mso-position-horizontal:center;mso-position-horizontal-relative:margin;mso-position-vertical:center;mso-position-vertical-relative:margin;mso-width-percent:0;mso-height-percent:0',
            'o:allowincell': 'f',
          },
          elements: [
            {
              name: 'v:imagedata',
              attributes: {
                'r:id': 'rId1',
                'o:title': 'Balloons',
                gain: '19661f',
                blacklevel: '22938f',
              },
            },
          ],
        },
      ],
    };

    // Test strategy detection
    const { type, handler } = pictNodeTypeStrategy(userWatermarkPict);

    console.log('Detected type:', type);
    console.log('Handler:', handler?.name);

    expect(type).toBe('image');
    expect(handler).toBe(handleShapeImageWatermarkImport);

    // Test import
    const importedNode = handler({
      params: {
        docx: mockDocx,
        filename: 'header1.xml',
      },
      pict: userWatermarkPict,
    });

    console.log('Imported node:', JSON.stringify(importedNode, null, 2));

    // Verify the imported node
    expect(importedNode).not.toBeNull();
    expect(importedNode.type).toBe('image');
    expect(importedNode.attrs.vmlWatermark).toBe(true);
    expect(importedNode.attrs.isAnchor).toBe(true);
    expect(importedNode.attrs.anchorData).toEqual({
      hRelativeFrom: 'margin',
      vRelativeFrom: 'margin',
      alignH: 'center',
      alignV: 'center',
    });
    expect(importedNode.attrs.wrap).toEqual({
      type: 'None',
      attrs: {
        behindDoc: true,
      },
    });

    // Check dimensions (466.55pt ≈ 622px, 233.25pt ≈ 311px)
    expect(importedNode.attrs.size.width).toBeGreaterThan(620);
    expect(importedNode.attrs.size.width).toBeLessThan(625);
    expect(importedNode.attrs.size.height).toBeGreaterThan(309);
    expect(importedNode.attrs.size.height).toBeLessThan(313);
  });
});
