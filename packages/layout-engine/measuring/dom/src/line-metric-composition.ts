/** Physical font metrics normalized into a Word-compatible natural line box. */
export type FontLineMetricEnvelope = {
  glyphAscent: number;
  glyphDescent: number;
  naturalAscent: number;
  naturalDescent: number;
};

export type FontLineMetricSample = {
  ascent: number;
  descent: number;
  naturalLineHeight: number;
};

/**
 * Add one font face to a line's shared baseline envelope.
 *
 * Word composes a line from the maximum ascent and maximum descent of every
 * participating face. Selecting one run loses the small but cumulative
 * Times/Arial baseline difference. Scale each face's physical ascent/descent
 * to its natural line height before merging so intrinsic leading stays on the
 * correct side of the baseline.
 */
export function extendFontLineMetricEnvelope(
  current: FontLineMetricEnvelope | undefined,
  sample: FontLineMetricSample,
): FontLineMetricEnvelope {
  const glyphAscent = Math.max(0, sample.ascent);
  const glyphDescent = Math.max(0, sample.descent);
  const glyphHeight = glyphAscent + glyphDescent;
  const naturalLineHeight = Math.max(glyphHeight, sample.naturalLineHeight);
  const scale = glyphHeight > 0 ? naturalLineHeight / glyphHeight : 1;
  const naturalAscent = glyphAscent * scale;
  const naturalDescent = glyphDescent * scale;

  if (!current) {
    return { glyphAscent, glyphDescent, naturalAscent, naturalDescent };
  }

  return {
    glyphAscent: Math.max(current.glyphAscent, glyphAscent),
    glyphDescent: Math.max(current.glyphDescent, glyphDescent),
    naturalAscent: Math.max(current.naturalAscent, naturalAscent),
    naturalDescent: Math.max(current.naturalDescent, naturalDescent),
  };
}

export function composedNaturalLineHeight(envelope: FontLineMetricEnvelope): number {
  return envelope.naturalAscent + envelope.naturalDescent;
}
