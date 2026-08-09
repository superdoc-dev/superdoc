import { describe, expect, it } from 'vite-plus/test';
import { composedNaturalLineHeight, extendFontLineMetricEnvelope } from './line-metric-composition.js';

describe('font line metric composition', () => {
  it('combines complementary face extents around one baseline independent of run order', () => {
    const times = { ascent: 12.5841, descent: 3.1639, naturalLineHeight: 16.8667 };
    const arial = { ascent: 12.577, descent: 3.2355, naturalLineHeight: 16.8667 };
    const timesThenArial = extendFontLineMetricEnvelope(extendFontLineMetricEnvelope(undefined, times), arial);
    const arialThenTimes = extendFontLineMetricEnvelope(extendFontLineMetricEnvelope(undefined, arial), times);

    expect(timesThenArial).toEqual(arialThenTimes);
    expect(composedNaturalLineHeight(timesThenArial)).toBeGreaterThan(times.naturalLineHeight);
    expect(composedNaturalLineHeight(timesThenArial)).toBeGreaterThan(arial.naturalLineHeight);
    expect(timesThenArial.glyphAscent).toBe(times.ascent);
    expect(timesThenArial.glyphDescent).toBe(arial.descent);
  });

  it('is idempotent for repeated runs from the same face', () => {
    const sample = { ascent: 12.5841, descent: 3.1639, naturalLineHeight: 16.8667 };
    const once = extendFontLineMetricEnvelope(undefined, sample);
    const twice = extendFontLineMetricEnvelope(once, sample);

    expect(twice).toEqual(once);
    expect(composedNaturalLineHeight(twice)).toBeCloseTo(sample.naturalLineHeight, 4);
  });
});
