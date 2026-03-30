import { describe, it, expect } from 'vitest';
import { estimateMathDimensions, MATH_DEFAULT_HEIGHT } from './math-constants.js';

describe('estimateMathDimensions', () => {
  it('returns default height when no OMML JSON is provided', () => {
    const { height } = estimateMathDimensions('x+1');
    expect(height).toBe(MATH_DEFAULT_HEIGHT);
  });

  it('returns default height for simple text runs (no vertical stacking)', () => {
    const omml = {
      name: 'm:oMath',
      elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'x' }] }] }],
    };
    const { height } = estimateMathDimensions('x', omml);
    expect(height).toBe(MATH_DEFAULT_HEIGHT);
  });

  it('increases height for fractions (m:f)', () => {
    const omml = {
      name: 'm:oMath',
      elements: [{
        name: 'm:f',
        elements: [
          { name: 'm:num', elements: [{ name: 'm:r' }] },
          { name: 'm:den', elements: [{ name: 'm:r' }] },
        ],
      }],
    };
    const { height } = estimateMathDimensions('ab', omml);
    expect(height).toBeGreaterThan(MATH_DEFAULT_HEIGHT);
  });

  it('increases height for bar elements (m:bar)', () => {
    const omml = {
      name: 'm:oMath',
      elements: [{
        name: 'm:bar',
        elements: [{ name: 'm:e', elements: [{ name: 'm:r' }] }],
      }],
    };
    const { height } = estimateMathDimensions('x', omml);
    expect(height).toBeGreaterThan(MATH_DEFAULT_HEIGHT);
  });

  it('stacks multipliers for nested elements (bar over fraction)', () => {
    const omml = {
      name: 'm:oMath',
      elements: [{
        name: 'm:bar',
        elements: [{
          name: 'm:e',
          elements: [{
            name: 'm:f',
            elements: [
              { name: 'm:num', elements: [{ name: 'm:r' }] },
              { name: 'm:den', elements: [{ name: 'm:r' }] },
            ],
          }],
        }],
      }],
    };
    const fractionOnly = {
      name: 'm:oMath',
      elements: [{
        name: 'm:f',
        elements: [
          { name: 'm:num', elements: [{ name: 'm:r' }] },
          { name: 'm:den', elements: [{ name: 'm:r' }] },
        ],
      }],
    };
    const barOverFraction = estimateMathDimensions('ab', omml).height;
    const fractionHeight = estimateMathDimensions('ab', fractionOnly).height;
    expect(barOverFraction).toBeGreaterThan(fractionHeight);
  });

  it('scales height with equation array row count', () => {
    const omml = {
      name: 'm:oMathPara',
      elements: [{
        name: 'm:eqArr',
        elements: [
          { name: 'm:e', elements: [{ name: 'm:r' }] },
          { name: 'm:e', elements: [{ name: 'm:r' }] },
          { name: 'm:e', elements: [{ name: 'm:r' }] },
        ],
      }],
    };
    const { height } = estimateMathDimensions('abc', omml);
    // 3 rows = 2 additional rows worth of height
    expect(height).toBeGreaterThan(MATH_DEFAULT_HEIGHT * 2);
  });

  it('estimates width from text length', () => {
    const { width } = estimateMathDimensions('abcde');
    expect(width).toBe(50); // 5 chars * 10px
  });

  it('enforces minimum width', () => {
    const { width } = estimateMathDimensions('x');
    expect(width).toBe(20); // MATH_MIN_WIDTH
  });
});
