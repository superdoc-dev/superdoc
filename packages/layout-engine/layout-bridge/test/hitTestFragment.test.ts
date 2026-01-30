import { describe, it, expect } from 'bun:test';
import { hitTestPage, hitTestFragment } from '../src/index.ts';
import { columnsLayout, blocks, measures } from './mock-data';

describe('hitTestFragment', () => {
  it('prioritizes fragments by y then x (columns)', () => {
    const pageHit = hitTestPage(columnsLayout, { x: 100, y: 50 + 0 });
    if (!pageHit) throw new Error('page hit missing');
    const fragmentHit = hitTestFragment(columnsLayout, pageHit, blocks, measures, { x: 100, y: 50 });
    expect(fragmentHit?.fragment.x).toBe(40);
  });
});
