/**
 * Tests for PmPositionValidator
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { PmPositionValidator } from '../src/pm-position-validator';
import type { FlowBlock } from '@superdoc/contracts';

describe('PmPositionValidator', () => {
  let validator: PmPositionValidator;

  beforeEach(() => {
    validator = new PmPositionValidator();
  });

  const createParagraphBlock = (pmStart: number, pmEnd: number): FlowBlock => ({
    kind: 'paragraph',
    id: `block-${pmStart}`,
    runs: [],
    attrs: { pmStart, pmEnd },
  });

  describe('validate', () => {
    it('should validate continuous blocks without errors', () => {
      const blocks: FlowBlock[] = [
        createParagraphBlock(0, 10),
        createParagraphBlock(10, 20),
        createParagraphBlock(20, 30),
      ];

      const result = validator.validate(blocks);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect gaps between blocks', () => {
      const blocks: FlowBlock[] = [
        createParagraphBlock(0, 10),
        createParagraphBlock(15, 25), // Gap from 10 to 15
      ];

      const result = validator.validate(blocks);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('gap');
    });

    it('should detect overlapping blocks', () => {
      const blocks: FlowBlock[] = [
        createParagraphBlock(0, 15),
        createParagraphBlock(10, 20), // Overlaps with previous block
      ];

      const result = validator.validate(blocks);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.type === 'overlap')).toBe(true);
    });

    it('should detect out-of-order positions', () => {
      const blocks: FlowBlock[] = [createParagraphBlock(10, 5)]; // pmEnd < pmStart

      const result = validator.validate(blocks);

      expect(result.valid).toBe(false);
      expect(result.errors[0].type).toBe('out_of_order');
    });

    it('should detect missing PM positions', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: 'block-1',
          runs: [],
          attrs: {}, // Missing pmStart/pmEnd
        },
      ];

      const result = validator.validate(blocks);

      expect(result.valid).toBe(false);
      expect(result.errors[0].type).toBe('missing');
    });

    it('should calculate coverage correctly', () => {
      const blocks: FlowBlock[] = [createParagraphBlock(0, 10), createParagraphBlock(10, 20)];

      const result = validator.validate(blocks);

      expect(result.coverage).toBeGreaterThan(0);
      expect(result.coverage).toBeLessThanOrEqual(1);
    });
  });

  describe('validateRange', () => {
    it('should validate a subset of blocks', () => {
      const blocks: FlowBlock[] = [
        createParagraphBlock(0, 10),
        createParagraphBlock(10, 20),
        createParagraphBlock(20, 30),
      ];

      const result = validator.validateRange(blocks, 1, 3);

      expect(result.valid).toBe(true);
    });

    it('should handle empty range', () => {
      const blocks: FlowBlock[] = [createParagraphBlock(0, 10)];

      const result = validator.validateRange(blocks, 0, 0);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('repair', () => {
    it('should repair gap errors', () => {
      const blocks: FlowBlock[] = [createParagraphBlock(0, 10), createParagraphBlock(15, 25)];

      const validationResult = validator.validate(blocks);
      const repaired = validator.repair(blocks, validationResult.errors);

      const revalidated = validator.validate(repaired);
      expect(revalidated.errors.filter((e) => e.type === 'gap')).toHaveLength(0);
    });

    it('should repair missing PM positions', () => {
      const blocks: FlowBlock[] = [
        createParagraphBlock(0, 10),
        {
          kind: 'paragraph',
          id: 'block-missing',
          runs: [],
          attrs: {},
        },
      ];

      const validationResult = validator.validate(blocks);
      const repaired = validator.repair(blocks, validationResult.errors);

      const revalidated = validator.validate(repaired);
      expect(revalidated.errors.filter((e) => e.type === 'missing')).toHaveLength(0);
    });

    it('should not modify original blocks', () => {
      const blocks: FlowBlock[] = [
        createParagraphBlock(0, 10),
        { kind: 'paragraph', id: 'block', runs: [], attrs: {} },
      ];

      const validationResult = validator.validate(blocks);
      validator.repair(blocks, validationResult.errors);

      expect(blocks[1].attrs?.pmStart).toBeUndefined();
    });
  });

  describe('getFeatureCoverage', () => {
    it('should count tracked changes', () => {
      const blocks: FlowBlock[] = [
        {
          ...createParagraphBlock(0, 10),
          attrs: { ...createParagraphBlock(0, 10).attrs, tracked_change: true },
        },
      ];

      const coverage = validator.getFeatureCoverage(blocks);

      expect(coverage.trackedChanges.total).toBe(1);
      expect(coverage.trackedChanges.covered).toBe(1);
    });

    it('should count tables', () => {
      const blocks: FlowBlock[] = [
        { kind: 'table', id: 'table-1', attrs: { pmStart: 0, pmEnd: 10 } } as unknown as FlowBlock,
      ];

      const coverage = validator.getFeatureCoverage(blocks);

      expect(coverage.tables.total).toBe(1);
    });

    it('should count embeds', () => {
      const blocks: FlowBlock[] = [
        { kind: 'image', id: 'img-1', attrs: { pmStart: 0, pmEnd: 1 } } as unknown as FlowBlock,
        { kind: 'drawing', id: 'draw-1', attrs: { pmStart: 1, pmEnd: 2 } } as unknown as FlowBlock,
      ];

      const coverage = validator.getFeatureCoverage(blocks);

      expect(coverage.embeds.total).toBe(2);
    });

    it('should count tokens', () => {
      const blocks: FlowBlock[] = [
        {
          ...createParagraphBlock(0, 10),
          attrs: { ...createParagraphBlock(0, 10).attrs, token: 'placeholder' },
        },
      ];

      const coverage = validator.getFeatureCoverage(blocks);

      expect(coverage.tokens.total).toBe(1);
      expect(coverage.tokens.covered).toBe(1);
    });
  });
});
