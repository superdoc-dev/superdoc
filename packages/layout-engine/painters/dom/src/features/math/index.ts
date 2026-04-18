/**
 * Math Formula — rendering feature module
 *
 * Converts OMML (Office Math Markup Language) to MathML for browser-native rendering.
 * Uses a registry pattern so each OMML math object type can be implemented independently.
 *
 * @ooxml m:oMath — inline math zone
 * @ooxml m:oMathPara — display math paragraph
 * @ooxml m:r, m:t — math runs and text
 * @ooxml m:f, m:rad, m:sSup, m:sSub, m:d, m:nary, m:m, ... — math objects (18 types)
 * @spec ECMA-376 §22.1 (Math)
 */

export { convertOmmlToMathml, registerMathObjectConverter, MATHML_NS } from './omml-to-mathml.js';
export type { OmmlJsonNode, MathObjectConverter } from './types.js';
