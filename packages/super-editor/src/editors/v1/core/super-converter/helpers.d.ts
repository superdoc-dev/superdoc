export const PIXELS_PER_INCH: 96;
export function inchesToTwips(inches: any): number;
export function twipsToInches(twips: any): number;
export function twipsToPixels(twips: any): number;
export function pixelsToTwips(pixels: any): number;
export function pixelsToInches(pixels: any): number;
export function inchesToPixels(inches: any): number;
export function twipsToLines(twips: any): number;
export function linesToTwips(lines: any): number;
export function halfPointToPixels(halfPoints: any): number;
export function emuToPixels(emu: any): number;
export function pixelsToEmu(px: any): number;
export function pixelsToHalfPoints(pixels: any): number;
export function halfPointToPoints(halfPoints: any): number;
export function eighthPointsToPixels(eighthPoints: any): number;
export function pixelsToEightPoints(pixels: any): number;
export function rotToDegrees(rot: any): number;
export function degreesToRot(degrees: any): number;
/**
 * Converts an array of pixel coordinates to a DOCX polygon node.
 * Automatically adds a closing wp:lineTo element that connects back to the starting point,
 * ensuring the polygon is properly closed in the DOCX format.
 *
 * @param {Array<[number, number]>} points - Array of [x, y] pixel coordinate pairs
 * @returns {Object|null} DOCX polygon node with wp:start and wp:lineTo elements, or null if invalid input
 */
export function objToPolygon(points: Array<[number, number]>): any | null;
/**
 * Converts a DOCX polygon node to an array of pixel coordinates.
 * Automatically removes duplicate closing points that are the same as the starting point,
 * since polygons are assumed to be closed shapes.
 *
 * @param {Object} polygonNode - The polygon node from DOCX XML with wp:start and wp:lineTo elements
 * @returns {Array<[number, number]>|null} Array of [x, y] pixel coordinate pairs, or null if invalid input
 */
export function polygonToObj(polygonNode: any): Array<[number, number]> | null;
export function getArrayBufferFromUrl(input: any): Promise<ArrayBuffer | SharedArrayBuffer>;
export function getContentTypesFromXml(contentTypesXml: any): string[];
export function getHexColorFromDocxSystem(docxColor: any): string;
export function getDocxHighlightKeywordFromHex(hexColor: any): any;
export function normalizeHexColor(hex: any): any;
export function isValidHexColor(color: any): boolean;
export function rgbToHex(rgb: any): string;
export function ptToTwips(pt: any): number;
export function twipsToPt(twips: any): number;
export function getLineHeightValueString(
  lineHeight: any,
  defaultUnit: any,
  lineRule?: string,
  isObject?: boolean,
):
  | string
  | {
      'line-height'?: undefined;
    }
  | {
      'line-height': string;
    };
export function deobfuscateFont(arrayBuffer: any, guidHex: any): any;
export function hasSomeParentWithClass(element: any, classname: any): any;
/**
 * Get the export value for text indent
 * @param {string|number} indent - The text indent value to export
 * @returns {number} - The export value in twips
 */
export function getTextIndentExportValue(indent: string | number): number;
export function polygonUnitsToPixels(pu: any): number;
export function pixelsToPolygonUnits(pixels: any): number;
export function resolveOpcTargetPath(target: string, baseDir?: string): string | null;
//# sourceMappingURL=helpers.d.ts.map
