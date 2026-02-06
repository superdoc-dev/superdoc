import { describe, it, expect } from 'vitest';
import { allTools } from './index.js';

describe('allTools', () => {
  it('contains at least one tool', () => {
    expect(allTools.length).toBeGreaterThan(0);
  });

  it('includes find_content', () => {
    const names = allTools.map((t) => t.name);
    expect(names).toContain('find_content');
  });

  it('each tool has required fields', () => {
    for (const tool of allTools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.parameters).toBeDefined();
    }
  });
});
