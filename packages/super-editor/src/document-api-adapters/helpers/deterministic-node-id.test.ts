import { buildFallbackBlockNodeId, isVolatileRuntimeBlockId } from './deterministic-node-id.js';

describe('deterministic-node-id', () => {
  describe('isVolatileRuntimeBlockId', () => {
    it('treats UUID-like sdBlockIds as volatile runtime ids', () => {
      expect(isVolatileRuntimeBlockId('7701a615-4ad8-45b5-922c-2a32114df4c8')).toBe(true);
    });

    it('does not treat descriptive ids as volatile runtime ids', () => {
      expect(isVolatileRuntimeBlockId('table-1')).toBe(false);
    });
  });

  describe('buildFallbackBlockNodeId', () => {
    it('builds deterministic table fallback ids from traversal paths', () => {
      expect(buildFallbackBlockNodeId('table', 42, [3])).toBe('table-auto-4fff82cf');
      expect(buildFallbackBlockNodeId('table', 42, [3])).toBe('table-auto-4fff82cf');
    });

    it('builds deterministic table-cell fallback ids from traversal paths', () => {
      expect(buildFallbackBlockNodeId('tableCell', 88, [3, 1, 2])).toBe('cell-auto-5e34d2b2');
      expect(buildFallbackBlockNodeId('tableCell', 88, [3, 1, 2])).toBe('cell-auto-5e34d2b2');
    });

    it('falls back to position when a traversal path is unavailable', () => {
      expect(buildFallbackBlockNodeId('table', 12)).toBe('table-auto-c3f1b3e8');
    });

    it('builds deterministic paragraph fallback ids from traversal paths', () => {
      const id = buildFallbackBlockNodeId('paragraph', 10, [0]);
      expect(id).toMatch(/^para-auto-[0-9a-f]{8}$/);
      // Stable across calls
      expect(buildFallbackBlockNodeId('paragraph', 10, [0])).toBe(id);
    });

    it('builds deterministic heading fallback ids from traversal paths', () => {
      const id = buildFallbackBlockNodeId('heading', 20, [1]);
      expect(id).toMatch(/^heading-auto-[0-9a-f]{8}$/);
      expect(buildFallbackBlockNodeId('heading', 20, [1])).toBe(id);
    });

    it('builds deterministic listItem fallback ids from traversal paths', () => {
      const id = buildFallbackBlockNodeId('listItem', 30, [2]);
      expect(id).toMatch(/^list-auto-[0-9a-f]{8}$/);
      expect(buildFallbackBlockNodeId('listItem', 30, [2])).toBe(id);
    });

    it('returns undefined for non-eligible types', () => {
      expect(buildFallbackBlockNodeId('tableRow', 0, [0])).toBeUndefined();
      expect(buildFallbackBlockNodeId('image', 0, [0])).toBeUndefined();
      expect(buildFallbackBlockNodeId('sdt', 0, [0])).toBeUndefined();
      expect(buildFallbackBlockNodeId('tableOfContents', 0, [0])).toBeUndefined();
    });

    it('produces different ids for different types at the same position', () => {
      const paraId = buildFallbackBlockNodeId('paragraph', 10, [0]);
      const headingId = buildFallbackBlockNodeId('heading', 10, [0]);
      const listId = buildFallbackBlockNodeId('listItem', 10, [0]);
      expect(paraId).not.toBe(headingId);
      expect(paraId).not.toBe(listId);
      expect(headingId).not.toBe(listId);
    });
  });
});
