// @ts-check

/**
 * Shared OOXML complex-field run builder.
 *
 * Both totalPageNumber and documentStatField translators emit the same
 * five-run structure (begin → instrText → separate → cached result → end).
 * This helper eliminates that duplication.
 */

/**
 * Builds the standard OOXML 5-run complex field structure.
 *
 * @param {Object}  options
 * @param {string}  options.instruction - Field instruction (e.g. 'NUMPAGES', 'NUMWORDS')
 * @param {string}  options.cachedText  - Cached result text to embed between separate/end
 * @param {Array}   options.outputMarks - Serialized w:rPr elements for each run
 * @param {boolean} options.dirty       - Whether to mark the field as w:dirty
 * @returns {Array} Five w:r OOXML elements
 */
export function buildComplexFieldRuns({ instruction, cachedText, outputMarks, dirty }) {
  const beginAttrs = { 'w:fldCharType': 'begin' };
  if (dirty) beginAttrs['w:dirty'] = 'true';

  return [
    {
      name: 'w:r',
      elements: [
        { name: 'w:rPr', elements: outputMarks },
        { name: 'w:fldChar', attributes: beginAttrs },
      ],
    },
    {
      name: 'w:r',
      elements: [
        { name: 'w:rPr', elements: outputMarks },
        {
          name: 'w:instrText',
          attributes: { 'xml:space': 'preserve' },
          elements: [{ type: 'text', text: ` ${instruction}` }],
        },
      ],
    },
    {
      name: 'w:r',
      elements: [
        { name: 'w:rPr', elements: outputMarks },
        { name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' } },
      ],
    },
    {
      name: 'w:r',
      elements: [
        { name: 'w:rPr', elements: outputMarks },
        {
          name: 'w:t',
          attributes: { 'xml:space': 'preserve' },
          elements: [{ type: 'text', text: cachedText }],
        },
      ],
    },
    {
      name: 'w:r',
      elements: [
        { name: 'w:rPr', elements: outputMarks },
        { name: 'w:fldChar', attributes: { 'w:fldCharType': 'end' } },
      ],
    },
  ];
}
