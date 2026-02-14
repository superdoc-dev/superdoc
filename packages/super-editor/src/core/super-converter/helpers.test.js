import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  polygonToObj,
  objToPolygon,
  polygonUnitsToPixels,
  pixelsToPolygonUnits,
  getArrayBufferFromUrl,
  computeCrc32Hex,
  base64ToUint8Array,
} from './helpers.js';

describe('polygonToObj', () => {
  it('should return null for null input', () => {
    expect(polygonToObj(null)).toBeNull();
  });

  it('should return null for undefined input', () => {
    expect(polygonToObj(undefined)).toBeNull();
  });

  it('should return empty array for polygon with no elements', () => {
    const polygon = { elements: [] };
    expect(polygonToObj(polygon)).toEqual([]);
  });

  it('should extract points from wp:start and wp:lineTo elements', () => {
    const polygon = {
      elements: [
        { name: 'wp:start', attributes: { x: '9216', y: '9216' } },
        { name: 'wp:lineTo', attributes: { x: '18432', y: '18432' } },
        { name: 'wp:lineTo', attributes: { x: '27648', y: '27648' } },
      ],
    };

    const result = polygonToObj(polygon);
    expect(result).toEqual([
      [96, 96], // rounded from emuToPixels conversion
      [192, 192],
      [288, 288],
    ]);
  });

  it('should ignore elements that are not wp:start or wp:lineTo', () => {
    const polygon = {
      elements: [
        { name: 'wp:start', attributes: { x: '9216', y: '9216' } },
        { name: 'wp:other', attributes: { x: '18288', y: '18288' } }, // should be ignored
        { name: 'wp:lineTo', attributes: { x: '27648', y: '27648' } },
      ],
    };

    const result = polygonToObj(polygon);
    expect(result).toEqual([
      [96, 96],
      [288, 288],
    ]);
  });

  it('should remove the last point if it matches the first point (closed polygon)', () => {
    const polygon = {
      elements: [
        { name: 'wp:start', attributes: { x: '9216', y: '9216' } }, // [96, 96]
        { name: 'wp:lineTo', attributes: { x: '18432', y: '18432' } }, // [192, 192]
        { name: 'wp:lineTo', attributes: { x: '27648', y: '27648' } }, // [288, 288]
        { name: 'wp:lineTo', attributes: { x: '9216', y: '9216' } }, // [96, 96] - duplicate
      ],
    };

    const result = polygonToObj(polygon);
    expect(result).toEqual([
      [96, 96],
      [192, 192],
      [288, 288],
    ]);
  });

  it('should not remove the last point if it does not match the first point', () => {
    const polygon = {
      elements: [
        { name: 'wp:start', attributes: { x: '9216', y: '9216' } }, // [96, 96]
        { name: 'wp:lineTo', attributes: { x: '18432', y: '18432' } }, // [192, 192]
        { name: 'wp:lineTo', attributes: { x: '27648', y: '27648' } }, // [288, 288]
        { name: 'wp:lineTo', attributes: { x: '36864', y: '36864' } }, // [384, 384] - different
      ],
    };

    const result = polygonToObj(polygon);
    expect(result).toEqual([
      [96, 96],
      [192, 192],
      [288, 288],
      [384, 384],
    ]);
  });
});

describe('objToPolygon', () => {
  it('should return null for null input', () => {
    expect(objToPolygon(null)).toBeNull();
  });

  it('should return null for undefined input', () => {
    expect(objToPolygon(undefined)).toBeNull();
  });

  it('should return null for non-array input', () => {
    expect(objToPolygon('not an array')).toBeNull();
    expect(objToPolygon({})).toBeNull();
    expect(objToPolygon(123)).toBeNull();
  });

  it('should handle empty array', () => {
    const result = objToPolygon([]);
    expect(result).toEqual({
      name: 'wp:wrapPolygon',
      type: 'wp:wrapPolygon',
      attributes: { edited: '0' },
      elements: [],
    });
  });

  it('should convert points to polygon with wp:start for first point and wp:lineTo for others', () => {
    const points = [
      [96, 96],
      [192, 192],
      [288, 288],
    ];

    const result = objToPolygon(points);
    expect(result).toEqual({
      name: 'wp:wrapPolygon',
      type: 'wp:wrapPolygon',
      attributes: { edited: '0' },
      elements: [
        {
          name: 'wp:start',
          type: 'wp:start',
          attributes: { x: 9216, y: 9216 },
        },
        {
          name: 'wp:lineTo',
          type: 'wp:lineTo',
          attributes: { x: 18432, y: 18432 },
        },
        {
          name: 'wp:lineTo',
          type: 'wp:lineTo',
          attributes: { x: 27648, y: 27648 },
        },
        {
          name: 'wp:lineTo',
          type: 'wp:lineTo',
          attributes: { x: 9216, y: 9216 }, // back to start point
        },
      ],
    });
  });

  it('should add lineTo back to starting point to close the polygon', () => {
    const points = [
      [50, 75],
      [150, 175],
    ];

    const result = objToPolygon(points);

    // Check that the last element is a lineTo back to the starting point
    const elements = result.elements;
    expect(result.attributes).toEqual({ edited: '0' });
    const firstPoint = elements[0];
    const lastPoint = elements[elements.length - 1];

    expect(firstPoint.name).toBe('wp:start');
    expect(firstPoint.type).toBe('wp:start');
    expect(lastPoint.name).toBe('wp:lineTo');
    expect(lastPoint.type).toBe('wp:lineTo');
    expect(lastPoint.attributes.x).toBe(firstPoint.attributes.x);
    expect(lastPoint.attributes.y).toBe(firstPoint.attributes.y);
  });

  it('should handle floating point coordinates', () => {
    const points = [
      [100.5, 200.7],
      [300.2, 400.9],
    ];

    const result = objToPolygon(points);
    expect(result.elements[0].attributes.x).toBe(pixelsToPolygonUnits(100.5));
    expect(result.elements[0].attributes.y).toBe(pixelsToPolygonUnits(200.7));
    expect(result.elements[1].attributes.x).toBe(pixelsToPolygonUnits(300.2));
    expect(result.elements[1].attributes.y).toBe(pixelsToPolygonUnits(400.9));
  });
});

describe('polygonToObj and objToPolygon integration', () => {
  it('should be able to convert back and forth while maintaining polygon closure', () => {
    // Start with a polygon that has a closing point
    const originalPolygon = {
      elements: [
        { name: 'wp:start', attributes: { x: '9216', y: '9216' } },
        { name: 'wp:lineTo', attributes: { x: '18432', y: '18432' } },
        { name: 'wp:lineTo', attributes: { x: '27648', y: '27648' } },
        { name: 'wp:lineTo', attributes: { x: '9216', y: '9216' } }, // closing point
      ],
    };

    // Convert to object (should remove duplicate closing point)
    const points = polygonToObj(originalPolygon);
    expect(points).toEqual([
      [96, 96],
      [192, 192],
      [288, 288],
    ]);

    // Convert back to polygon (should add closing point)
    const newPolygon = objToPolygon(points);
    expect(newPolygon.attributes).toEqual({ edited: '0' });
    expect(newPolygon.elements).toHaveLength(4); // 3 original + 1 closing

    // First and last points should be the same
    const firstElement = newPolygon.elements[0];
    const lastElement = newPolygon.elements[3];
    expect(firstElement.name).toBe('wp:start');
    expect(firstElement.type).toBe('wp:start');
    expect(lastElement.name).toBe('wp:lineTo');
    expect(lastElement.type).toBe('wp:lineTo');
    expect(lastElement.attributes.x).toBe(firstElement.attributes.x);
    expect(lastElement.attributes.y).toBe(firstElement.attributes.y);
  });

  it('should handle open polygons correctly', () => {
    // Start with an open polygon
    const originalPolygon = {
      elements: [
        { name: 'wp:start', attributes: { x: '9216', y: '9216' } },
        { name: 'wp:lineTo', attributes: { x: '18432', y: '18432' } },
        { name: 'wp:lineTo', attributes: { x: '27648', y: '27648' } },
      ],
    };

    // Convert to object
    const points = polygonToObj(originalPolygon);
    expect(points).toEqual([
      [96, 96],
      [192, 192],
      [288, 288],
    ]);

    // Convert back to polygon (should add closing point)
    const newPolygon = objToPolygon(points);
    expect(newPolygon.elements).toHaveLength(4); // 3 original + 1 closing
  });

  it('should handle realistic DOCX polygon roundtrip scenario', () => {
    // Simulate a typical DOCX polygon that comes from Word - closed polygon with duplicate end point
    const docxPolygon = {
      elements: [
        { name: 'wp:start', attributes: { x: '9216', y: '9216' } }, // Top-left: [96, 96]
        { name: 'wp:lineTo', attributes: { x: '27648', y: '9216' } }, // Top-right: [288, 96]
        { name: 'wp:lineTo', attributes: { x: '27648', y: '27648' } }, // Bottom-right: [288, 288]
        { name: 'wp:lineTo', attributes: { x: '9216', y: '27648' } }, // Bottom-left: [96, 288]
        { name: 'wp:lineTo', attributes: { x: '9216', y: '9216' } }, // Back to start (duplicate)
      ],
    };

    // Step 1: Import from DOCX (should remove duplicate closing point)
    const importedPoints = polygonToObj(docxPolygon);
    expect(importedPoints).toEqual([
      [96, 96], // Top-left
      [288, 96], // Top-right
      [288, 288], // Bottom-right
      [96, 288], // Bottom-left (no duplicate)
    ]);

    // Step 2: Export back to DOCX (should add closing point)
    const exportedPolygon = objToPolygon(importedPoints);
    expect(exportedPolygon.elements).toHaveLength(5); // 4 original + 1 closing
    expect(exportedPolygon.attributes).toEqual({ edited: '0' });

    // Verify structure
    expect(exportedPolygon.elements[0].name).toBe('wp:start');
    expect(exportedPolygon.elements[0].type).toBe('wp:start');
    expect(exportedPolygon.elements[1].name).toBe('wp:lineTo');
    expect(exportedPolygon.elements[1].type).toBe('wp:lineTo');
    expect(exportedPolygon.elements[2].name).toBe('wp:lineTo');
    expect(exportedPolygon.elements[2].type).toBe('wp:lineTo');
    expect(exportedPolygon.elements[3].name).toBe('wp:lineTo');
    expect(exportedPolygon.elements[3].type).toBe('wp:lineTo');
    expect(exportedPolygon.elements[4].name).toBe('wp:lineTo');
    expect(exportedPolygon.elements[4].type).toBe('wp:lineTo'); // Closing point

    // Verify closing point matches starting point
    const startPoint = exportedPolygon.elements[0];
    const closingPoint = exportedPolygon.elements[4];
    expect(closingPoint.attributes.x).toBe(startPoint.attributes.x);
    expect(closingPoint.attributes.y).toBe(startPoint.attributes.y);
  });
});

describe('getArrayBufferFromUrl', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('fetches remote resources when given an HTTP URL', async () => {
    const payload = new Uint8Array([1, 2, 3, 4]);
    const mockResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      arrayBuffer: vi.fn().mockResolvedValue(payload.buffer),
    };

    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    const result = await getArrayBufferFromUrl('https://example.com/image.png');

    expect(globalThis.fetch).toHaveBeenCalledWith('https://example.com/image.png');
    expect(new Uint8Array(result)).toEqual(payload);
  });

  it('decodes data URIs into an ArrayBuffer', async () => {
    const bytes = new Uint8Array([11, 22, 33, 44]);
    const base64 = Buffer.from(bytes).toString('base64');
    const dataUri = `data:image/png;base64,${base64}`;

    const result = await getArrayBufferFromUrl(dataUri);

    expect(Array.from(new Uint8Array(result))).toEqual(Array.from(bytes));
  });

  it('decodes bare base64 strings into an ArrayBuffer', async () => {
    const bytes = new Uint8Array([55, 66, 77]);
    const base64 = Buffer.from(bytes).toString('base64');

    const result = await getArrayBufferFromUrl(base64);

    expect(Array.from(new Uint8Array(result))).toEqual(Array.from(bytes));
  });
});

describe('computeCrc32Hex', () => {
  it('matches buffer-crc32 output for known inputs', () => {
    // Reference values verified against buffer-crc32 npm package
    const cases = [
      { input: 'hello world', expected: '0d4a1185' },
      { input: '', expected: '00000000' },
      { input: 'The quick brown fox jumps over the lazy dog', expected: '414fa339' },
    ];

    for (const { input, expected } of cases) {
      const data = new TextEncoder().encode(input);
      expect(computeCrc32Hex(data)).toBe(expected);
    }
  });

  it('produces consistent output for binary data', () => {
    const data = new Uint8Array([0, 1, 2, 3, 255, 254, 253, 128, 127, 64, 32, 16]);
    // Reference: buffer-crc32(Buffer.from([0,1,2,3,255,254,253,128,127,64,32,16])).toString('hex')
    expect(computeCrc32Hex(data)).toBe('463601ac');
  });
});

describe('base64ToUint8Array', () => {
  it('decodes a base64 string to Uint8Array', () => {
    // "hello" in base64
    const result = base64ToUint8Array('aGVsbG8=');
    expect(Array.from(result)).toEqual([104, 101, 108, 108, 111]);
  });

  it('handles empty string', () => {
    const result = base64ToUint8Array('');
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(0);
  });

  it('decodes binary data correctly', () => {
    // Bytes [0, 1, 255] → base64 "AAH/"
    const result = base64ToUint8Array('AAH/');
    expect(Array.from(result)).toEqual([0, 1, 255]);
  });
});
