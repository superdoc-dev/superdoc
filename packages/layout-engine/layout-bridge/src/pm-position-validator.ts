/**
 * PM Position Validator
 *
 * Validates pmStart/pmEnd continuity across FlowBlocks to ensure proper cursor positioning.
 * Detects gaps, overlaps, and ordering issues in PM position mappings.
 *
 * Validation Strategy:
 * 1. Check for gaps between consecutive blocks
 * 2. Detect overlapping position ranges
 * 3. Verify correct ordering (pmStart < pmEnd)
 * 4. Calculate document coverage
 * 5. Optionally repair common issues
 *
 * @module pm-position-validator
 */

import type { FlowBlock, ParagraphAttrs } from '@superdoc/contracts';

/**
 * Result of PM position validation.
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Errors found during validation */
  errors: ValidationError[];
  /** Fraction of document covered by valid PM positions (0-1) */
  coverage: number;
}

/**
 * An error in PM position continuity.
 */
export interface ValidationError {
  /** Type of error */
  type: 'gap' | 'overlap' | 'out_of_order' | 'missing';
  /** Index of block where error occurred */
  blockIndex: number;
  /** Expected position range */
  expected: { start: number; end: number };
  /** Actual position range */
  actual: { start: number; end: number };
}

/**
 * PmPositionValidator ensures PM position continuity across document blocks.
 */
export class PmPositionValidator {
  /**
   * Validate pmStart/pmEnd continuity across all blocks.
   *
   * @param blocks - Array of flow blocks to validate
   * @returns Validation result with errors and coverage info
   */
  validate(blocks: FlowBlock[]): ValidationResult {
    return this.validateRange(blocks, 0, blocks.length);
  }

  /**
   * Validate a subset of blocks for incremental validation.
   *
   * @param blocks - Array of flow blocks
   * @param startIndex - Starting block index (inclusive)
   * @param endIndex - Ending block index (exclusive)
   * @returns Validation result
   */
  validateRange(blocks: FlowBlock[], startIndex: number, endIndex: number): ValidationResult {
    const errors: ValidationError[] = [];
    let coveredPositions = 0;
    let totalPositions = 0;

    for (let i = startIndex; i < endIndex; i++) {
      const block = blocks[i];
      const pmStart = this.getBlockPmStart(block);
      const pmEnd = this.getBlockPmEnd(block);

      // Check for missing PM positions
      if (pmStart === undefined || pmEnd === undefined) {
        errors.push({
          type: 'missing',
          blockIndex: i,
          expected: { start: 0, end: 0 },
          actual: { start: pmStart ?? -1, end: pmEnd ?? -1 },
        });
        continue;
      }

      // Check for out-of-order positions
      if (pmStart >= pmEnd) {
        errors.push({
          type: 'out_of_order',
          blockIndex: i,
          expected: { start: pmStart, end: pmStart + 1 },
          actual: { start: pmStart, end: pmEnd },
        });
      }

      coveredPositions += Math.max(0, pmEnd - pmStart);
      totalPositions += pmEnd - pmStart + 1;

      // Check for gaps with next block
      if (i < endIndex - 1) {
        const nextBlock = blocks[i + 1];
        const nextPmStart = this.getBlockPmStart(nextBlock);

        if (nextPmStart !== undefined && nextPmStart > pmEnd + 1) {
          errors.push({
            type: 'gap',
            blockIndex: i,
            expected: { start: pmEnd, end: nextPmStart },
            actual: { start: pmEnd, end: pmEnd },
          });
        } else if (nextPmStart !== undefined && nextPmStart < pmEnd) {
          errors.push({
            type: 'overlap',
            blockIndex: i,
            expected: { start: pmEnd, end: nextPmStart },
            actual: { start: pmEnd, end: pmEnd },
          });
        }
      }
    }

    const coverage = totalPositions > 0 ? coveredPositions / totalPositions : 0;

    return {
      valid: errors.length === 0,
      errors,
      coverage: Math.min(1, Math.max(0, coverage)),
    };
  }

  /**
   * Attempt to repair gaps in pmStart/pmEnd by interpolating missing positions.
   *
   * @param blocks - Array of flow blocks
   * @param errors - Validation errors to repair
   * @returns Repaired blocks (new array, original unmodified)
   */
  repair(blocks: FlowBlock[], errors: ValidationError[]): FlowBlock[] {
    const repaired = [...blocks];

    for (const error of errors) {
      if (error.type === 'gap') {
        // Fill gap by extending the block's pmEnd
        const block = repaired[error.blockIndex];
        if (block.kind === 'paragraph') {
          repaired[error.blockIndex] = {
            ...block,
            attrs: {
              ...block.attrs,
              pmEnd: error.expected.end,
            } as ParagraphAttrs,
          };
        }
      } else if (error.type === 'missing') {
        // Assign default PM positions based on block index
        const block = repaired[error.blockIndex];
        const prevBlock = error.blockIndex > 0 ? repaired[error.blockIndex - 1] : null;
        const prevPmEnd = prevBlock ? (this.getBlockPmEnd(prevBlock) ?? 0) : 0;

        if (block.kind === 'paragraph') {
          repaired[error.blockIndex] = {
            ...block,
            attrs: {
              ...block.attrs,
              pmStart: prevPmEnd,
              pmEnd: prevPmEnd + 1,
            } as ParagraphAttrs,
          };
        }
      }
    }

    return repaired;
  }

  /**
   * Get coverage report for complex features.
   *
   * @param blocks - Array of flow blocks
   * @returns Coverage statistics for complex features
   */
  getFeatureCoverage(blocks: FlowBlock[]): {
    trackedChanges: { total: number; covered: number };
    tables: { total: number; covered: number };
    embeds: { total: number; covered: number };
    tokens: { total: number; covered: number };
  } {
    const stats = {
      trackedChanges: { total: 0, covered: 0 },
      tables: { total: 0, covered: 0 },
      embeds: { total: 0, covered: 0 },
      tokens: { total: 0, covered: 0 },
    };

    for (const block of blocks) {
      const pmStart = this.getBlockPmStart(block);
      const pmEnd = this.getBlockPmEnd(block);
      const hasPmPositions = pmStart !== undefined && pmEnd !== undefined;

      // Detect tracked changes (blocks with tracked_change attr)
      if ('attrs' in block && block.attrs && 'tracked_change' in block.attrs) {
        stats.trackedChanges.total++;
        if (hasPmPositions) stats.trackedChanges.covered++;
      }

      // Detect tables
      if (block.kind === 'table') {
        stats.tables.total++;
        if (hasPmPositions) stats.tables.covered++;
      }

      // Detect embeds (images, drawings, etc.)
      if (block.kind === 'drawing' || block.kind === 'image') {
        stats.embeds.total++;
        if (hasPmPositions) stats.embeds.covered++;
      }

      // Detect tokens (placeholders)
      if ('attrs' in block && block.attrs && typeof block.attrs === 'object' && 'token' in block.attrs) {
        stats.tokens.total++;
        if (hasPmPositions) stats.tokens.covered++;
      }
    }

    return stats;
  }

  /**
   * Extract pmStart from a block.
   *
   * @param block - Flow block
   * @returns PM start position or undefined
   * @private
   */
  private getBlockPmStart(block: FlowBlock): number | undefined {
    if (block.kind === 'paragraph') {
      const attrs = block.attrs as Record<string, unknown> | undefined;
      return typeof attrs?.pmStart === 'number' ? attrs.pmStart : undefined;
    }
    return undefined;
  }

  /**
   * Extract pmEnd from a block.
   *
   * @param block - Flow block
   * @returns PM end position or undefined
   * @private
   */
  private getBlockPmEnd(block: FlowBlock): number | undefined {
    if (block.kind === 'paragraph') {
      const attrs = block.attrs as Record<string, unknown> | undefined;
      return typeof attrs?.pmEnd === 'number' ? attrs.pmEnd : undefined;
    }
    return undefined;
  }
}
