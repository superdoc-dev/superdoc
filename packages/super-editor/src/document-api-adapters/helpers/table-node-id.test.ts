import { buildFallbackTableNodeId, isVolatileRuntimeBlockId } from './table-node-id.js';

describe('table-node-id', () => {
  describe('isVolatileRuntimeBlockId', () => {
    it('treats UUID-like sdBlockIds as volatile runtime ids', () => {
      expect(isVolatileRuntimeBlockId('7701a615-4ad8-45b5-922c-2a32114df4c8')).toBe(true);
    });

    it('does not treat descriptive ids as volatile runtime ids', () => {
      expect(isVolatileRuntimeBlockId('table-1')).toBe(false);
    });
  });

  describe('buildFallbackTableNodeId', () => {
    it('builds deterministic table fallback ids from traversal paths', () => {
      expect(buildFallbackTableNodeId('table', 42, [3])).toBe('table-auto-4fff82cf');
      expect(buildFallbackTableNodeId('table', 42, [3])).toBe('table-auto-4fff82cf');
    });

    it('builds deterministic table-cell fallback ids from traversal paths', () => {
      expect(buildFallbackTableNodeId('tableCell', 88, [3, 1, 2])).toBe('cell-auto-5e34d2b2');
      expect(buildFallbackTableNodeId('tableCell', 88, [3, 1, 2])).toBe('cell-auto-5e34d2b2');
    });

    it('falls back to position when a traversal path is unavailable', () => {
      expect(buildFallbackTableNodeId('table', 12)).toBe('table-auto-c3f1b3e8');
    });
  });
});
