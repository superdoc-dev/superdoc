/**
 * Cache Invalidation Tests
 *
 * Tests for cache invalidation logic for headers/footers and body content.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { FlowBlock, ParagraphBlock, SectionMetadata } from '@superdoc/contracts';
import type { HeaderFooterConstraints } from '../../layout-engine';
import {
  computeHeaderFooterContentHash,
  computeSectionMetadataHash,
  computeConstraintsHash,
  HeaderFooterCacheState,
  invalidateHeaderFooterCache,
} from '../src/cacheInvalidation';
import { HeaderFooterLayoutCache } from '../src/layoutHeaderFooter';

describe('Cache Invalidation', () => {
  describe('Hash Functions', () => {
    describe('computeHeaderFooterContentHash', () => {
      it('should return empty string for empty blocks', () => {
        expect(computeHeaderFooterContentHash([])).toBe('');
      });

      it('should compute hash based on block IDs and content', () => {
        const blocks: FlowBlock[] = [
          {
            kind: 'paragraph',
            id: 'p1',
            runs: [{ text: 'Hello' }, { text: 'World', bold: true }],
          } as ParagraphBlock,
        ];

        const hash = computeHeaderFooterContentHash(blocks);
        expect(hash).toContain('p1');
        expect(hash).toContain('Hello');
        expect(hash).toContain('World');
        expect(hash).toContain('b'); // Bold marker
      });

      it('should include token information in hash', () => {
        const blocks: FlowBlock[] = [
          {
            kind: 'paragraph',
            id: 'p1',
            runs: [{ text: '0', token: 'pageNumber' }],
          } as ParagraphBlock,
        ];

        const hash = computeHeaderFooterContentHash(blocks);
        expect(hash).toContain('token:pageNumber');
      });

      it('should produce different hashes for different content', () => {
        const blocks1: FlowBlock[] = [
          {
            kind: 'paragraph',
            id: 'p1',
            runs: [{ text: 'Hello' }],
          } as ParagraphBlock,
        ];

        const blocks2: FlowBlock[] = [
          {
            kind: 'paragraph',
            id: 'p1',
            runs: [{ text: 'World' }],
          } as ParagraphBlock,
        ];

        const hash1 = computeHeaderFooterContentHash(blocks1);
        const hash2 = computeHeaderFooterContentHash(blocks2);

        expect(hash1).not.toBe(hash2);
      });
    });

    describe('computeSectionMetadataHash', () => {
      it('should return empty string for empty sections', () => {
        expect(computeSectionMetadataHash([])).toBe('');
      });

      it('should compute hash based on section properties', () => {
        const sections: SectionMetadata[] = [
          {
            sectionIndex: 1,
            numbering: { format: 'lowerRoman', start: 1 },
          },
        ];

        const hash = computeSectionMetadataHash(sections);
        expect(hash).toContain('section:1');
        expect(hash).toContain('num:lowerRoman:1');
      });

      it('should produce different hashes for different metadata', () => {
        const sections1: SectionMetadata[] = [
          {
            sectionIndex: 1,
            numbering: { format: 'decimal', start: 1 },
          },
        ];

        const sections2: SectionMetadata[] = [
          {
            sectionIndex: 1,
            numbering: { format: 'lowerRoman', start: 1 },
          },
        ];

        const hash1 = computeSectionMetadataHash(sections1);
        const hash2 = computeSectionMetadataHash(sections2);

        expect(hash1).not.toBe(hash2);
      });
    });

    describe('computeConstraintsHash', () => {
      it('should compute hash based on width and height', () => {
        const constraints: HeaderFooterConstraints = {
          width: 500,
          height: 100,
        };

        const hash = computeConstraintsHash(constraints);
        expect(hash).toContain('w:500');
        expect(hash).toContain('h:100');
      });

      it('should include optional properties in hash', () => {
        const constraints: HeaderFooterConstraints = {
          width: 500,
          height: 100,
          pageWidth: 600,
          margins: { left: 50, right: 50 },
        };

        const hash = computeConstraintsHash(constraints);
        expect(hash).toContain('pw:600');
        expect(hash).toContain('ml:50');
        expect(hash).toContain('mr:50');
      });

      it('should produce different hashes for different constraints', () => {
        const constraints1: HeaderFooterConstraints = {
          width: 500,
          height: 100,
        };

        const constraints2: HeaderFooterConstraints = {
          width: 600,
          height: 100,
        };

        const hash1 = computeConstraintsHash(constraints1);
        const hash2 = computeConstraintsHash(constraints2);

        expect(hash1).not.toBe(hash2);
      });

      it('should include overflowBaseHeight in hash when provided', () => {
        const constraints: HeaderFooterConstraints = {
          width: 500,
          height: 100,
          overflowBaseHeight: 50,
        };

        const hash = computeConstraintsHash(constraints);
        expect(hash).toContain('obh:50');
      });

      it('should produce different hashes when overflowBaseHeight changes', () => {
        const constraints1: HeaderFooterConstraints = {
          width: 500,
          height: 100,
          overflowBaseHeight: 50,
        };

        const constraints2: HeaderFooterConstraints = {
          width: 500,
          height: 100,
          overflowBaseHeight: 75,
        };

        const hash1 = computeConstraintsHash(constraints1);
        const hash2 = computeConstraintsHash(constraints2);

        expect(hash1).not.toBe(hash2);
      });

      it('should omit overflowBaseHeight from hash when undefined', () => {
        const constraints: HeaderFooterConstraints = {
          width: 500,
          height: 100,
        };

        const hash = computeConstraintsHash(constraints);
        expect(hash).not.toContain('obh:');
      });
    });
  });

  describe('HeaderFooterCacheState', () => {
    let cacheState: HeaderFooterCacheState;

    beforeEach(() => {
      cacheState = new HeaderFooterCacheState();
    });

    describe('hasContentChanged', () => {
      it('should return false on first check', () => {
        const blocks: FlowBlock[] = [
          {
            kind: 'paragraph',
            id: 'p1',
            runs: [{ text: 'Hello' }],
          } as ParagraphBlock,
        ];

        const changed = cacheState.hasContentChanged('header-default', blocks);
        expect(changed).toBe(false);
      });

      it('should return false when content has not changed', () => {
        const blocks: FlowBlock[] = [
          {
            kind: 'paragraph',
            id: 'p1',
            runs: [{ text: 'Hello' }],
          } as ParagraphBlock,
        ];

        cacheState.hasContentChanged('header-default', blocks);
        const changed = cacheState.hasContentChanged('header-default', blocks);

        expect(changed).toBe(false);
      });

      it('should return true when content has changed', () => {
        const blocks1: FlowBlock[] = [
          {
            kind: 'paragraph',
            id: 'p1',
            runs: [{ text: 'Hello' }],
          } as ParagraphBlock,
        ];

        const blocks2: FlowBlock[] = [
          {
            kind: 'paragraph',
            id: 'p1',
            runs: [{ text: 'World' }],
          } as ParagraphBlock,
        ];

        cacheState.hasContentChanged('header-default', blocks1);
        const changed = cacheState.hasContentChanged('header-default', blocks2);

        expect(changed).toBe(true);
      });

      it('should track variants independently', () => {
        const blocks1: FlowBlock[] = [
          {
            kind: 'paragraph',
            id: 'p1',
            runs: [{ text: 'Default' }],
          } as ParagraphBlock,
        ];

        const blocks2: FlowBlock[] = [
          {
            kind: 'paragraph',
            id: 'p2',
            runs: [{ text: 'First' }],
          } as ParagraphBlock,
        ];

        cacheState.hasContentChanged('header-default', blocks1);
        cacheState.hasContentChanged('header-first', blocks2);

        // Checking same variant again should return false
        expect(cacheState.hasContentChanged('header-default', blocks1)).toBe(false);
        expect(cacheState.hasContentChanged('header-first', blocks2)).toBe(false);

        // Changing one variant should not affect the other
        const blocks1Modified: FlowBlock[] = [
          {
            kind: 'paragraph',
            id: 'p1',
            runs: [{ text: 'Modified' }],
          } as ParagraphBlock,
        ];

        expect(cacheState.hasContentChanged('header-default', blocks1Modified)).toBe(true);
        expect(cacheState.hasContentChanged('header-first', blocks2)).toBe(false);
      });
    });

    describe('hasConstraintsChanged', () => {
      it('should return false on first check', () => {
        const constraints: HeaderFooterConstraints = {
          width: 500,
          height: 100,
        };

        const changed = cacheState.hasConstraintsChanged(constraints);
        expect(changed).toBe(false);
      });

      it('should return false when constraints have not changed', () => {
        const constraints: HeaderFooterConstraints = {
          width: 500,
          height: 100,
        };

        cacheState.hasConstraintsChanged(constraints);
        const changed = cacheState.hasConstraintsChanged(constraints);

        expect(changed).toBe(false);
      });

      it('should return true when constraints have changed', () => {
        const constraints1: HeaderFooterConstraints = {
          width: 500,
          height: 100,
        };

        const constraints2: HeaderFooterConstraints = {
          width: 600,
          height: 100,
        };

        cacheState.hasConstraintsChanged(constraints1);
        const changed = cacheState.hasConstraintsChanged(constraints2);

        expect(changed).toBe(true);
      });
    });

    describe('hasSectionMetadataChanged', () => {
      it('should return false on first check', () => {
        const sections: SectionMetadata[] = [
          {
            sectionIndex: 1,
            numbering: { format: 'decimal', start: 1 },
          },
        ];

        const changed = cacheState.hasSectionMetadataChanged(sections);
        expect(changed).toBe(false);
      });

      it('should return true when metadata has changed', () => {
        const sections1: SectionMetadata[] = [
          {
            sectionIndex: 1,
            numbering: { format: 'decimal', start: 1 },
          },
        ];

        const sections2: SectionMetadata[] = [
          {
            sectionIndex: 1,
            numbering: { format: 'lowerRoman', start: 1 },
          },
        ];

        cacheState.hasSectionMetadataChanged(sections1);
        const changed = cacheState.hasSectionMetadataChanged(sections2);

        expect(changed).toBe(true);
      });
    });

    describe('reset', () => {
      it('should clear all cached state', () => {
        const blocks: FlowBlock[] = [
          {
            kind: 'paragraph',
            id: 'p1',
            runs: [{ text: 'Hello' }],
          } as ParagraphBlock,
        ];

        const constraints: HeaderFooterConstraints = {
          width: 500,
          height: 100,
        };

        const sections: SectionMetadata[] = [
          {
            sectionIndex: 1,
            numbering: { format: 'decimal', start: 1 },
          },
        ];

        cacheState.hasContentChanged('header-default', blocks);
        cacheState.hasConstraintsChanged(constraints);
        cacheState.hasSectionMetadataChanged(sections);

        cacheState.reset();

        // After reset, should return false (first check)
        expect(cacheState.hasContentChanged('header-default', blocks)).toBe(false);
        expect(cacheState.hasConstraintsChanged(constraints)).toBe(false);
        expect(cacheState.hasSectionMetadataChanged(sections)).toBe(false);
      });
    });
  });

  describe('invalidateHeaderFooterCache', () => {
    let cache: HeaderFooterLayoutCache;
    let cacheState: HeaderFooterCacheState;

    beforeEach(() => {
      cache = new HeaderFooterLayoutCache();
      cacheState = new HeaderFooterCacheState();
    });

    it('should invalidate cache when content changes', () => {
      const invalidateSpy = vi.spyOn(cache, 'invalidate');

      const blocks1 = {
        default: [
          {
            kind: 'paragraph',
            id: 'p1',
            runs: [{ text: 'Hello' }],
          } as ParagraphBlock,
        ],
      };

      const blocks2 = {
        default: [
          {
            kind: 'paragraph',
            id: 'p1',
            runs: [{ text: 'World' }],
          } as ParagraphBlock,
        ],
      };

      // First call - no invalidation (first time)
      invalidateHeaderFooterCache(cache, cacheState, blocks1, undefined, undefined, undefined);
      expect(invalidateSpy).not.toHaveBeenCalled();

      // Second call with changed content - should invalidate
      invalidateHeaderFooterCache(cache, cacheState, blocks2, undefined, undefined, undefined);
      expect(invalidateSpy).toHaveBeenCalledWith(['p1']);
    });

    it('should invalidate cache when constraints change', () => {
      const invalidateSpy = vi.spyOn(cache, 'invalidate');

      const blocks = {
        default: [
          {
            kind: 'paragraph',
            id: 'p1',
            runs: [{ text: 'Hello' }],
          } as ParagraphBlock,
        ],
      };

      const constraints1: HeaderFooterConstraints = {
        width: 500,
        height: 100,
      };

      const constraints2: HeaderFooterConstraints = {
        width: 600,
        height: 100,
      };

      // First call
      invalidateHeaderFooterCache(cache, cacheState, blocks, undefined, constraints1, undefined);

      // Second call with changed constraints
      invalidateSpy.mockClear();
      invalidateHeaderFooterCache(cache, cacheState, blocks, undefined, constraints2, undefined);

      expect(invalidateSpy).toHaveBeenCalled();
    });

    it('should invalidate cache when section metadata changes', () => {
      const invalidateSpy = vi.spyOn(cache, 'invalidate');

      const blocks = {
        default: [
          {
            kind: 'paragraph',
            id: 'p1',
            runs: [{ text: 'Hello' }],
          } as ParagraphBlock,
        ],
      };

      const sections1: SectionMetadata[] = [
        {
          sectionIndex: 1,
          numbering: { format: 'decimal', start: 1 },
        },
      ];

      const sections2: SectionMetadata[] = [
        {
          sectionIndex: 1,
          numbering: { format: 'lowerRoman', start: 1 },
        },
      ];

      // First call
      invalidateHeaderFooterCache(cache, cacheState, blocks, undefined, undefined, sections1);

      // Second call with changed metadata
      invalidateSpy.mockClear();
      invalidateHeaderFooterCache(cache, cacheState, blocks, undefined, undefined, sections2);

      expect(invalidateSpy).toHaveBeenCalled();
    });

    it('should not invalidate when nothing has changed', () => {
      const invalidateSpy = vi.spyOn(cache, 'invalidate');

      const blocks = {
        default: [
          {
            kind: 'paragraph',
            id: 'p1',
            runs: [{ text: 'Hello' }],
          } as ParagraphBlock,
        ],
      };

      const constraints: HeaderFooterConstraints = {
        width: 500,
        height: 100,
      };

      // First call
      invalidateHeaderFooterCache(cache, cacheState, blocks, undefined, constraints, undefined);

      // Second call with same data
      invalidateSpy.mockClear();
      invalidateHeaderFooterCache(cache, cacheState, blocks, undefined, constraints, undefined);

      expect(invalidateSpy).not.toHaveBeenCalled();
    });

    it('should invalidate cache when overflowBaseHeight changes', () => {
      const invalidateSpy = vi.spyOn(cache, 'invalidate');

      const blocks = {
        default: [
          {
            kind: 'paragraph',
            id: 'p1',
            runs: [{ text: 'Hello' }],
          } as ParagraphBlock,
        ],
      };

      const constraints1: HeaderFooterConstraints = {
        width: 500,
        height: 100,
        overflowBaseHeight: 50,
      };

      const constraints2: HeaderFooterConstraints = {
        width: 500,
        height: 100,
        overflowBaseHeight: 75,
      };

      // First call
      invalidateHeaderFooterCache(cache, cacheState, blocks, undefined, constraints1, undefined);

      // Second call with changed overflowBaseHeight
      invalidateSpy.mockClear();
      invalidateHeaderFooterCache(cache, cacheState, blocks, undefined, constraints2, undefined);

      expect(invalidateSpy).toHaveBeenCalled();
      expect(invalidateSpy).toHaveBeenCalledWith(['p1']);
    });
  });
});
