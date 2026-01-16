import { describe, expect, it } from 'vitest';
import { StepMap } from 'prosemirror-transform';
import type { Transaction } from 'prosemirror-state';

import { EpochPositionMapper } from '../EpochPositionMapper.js';

describe('EpochPositionMapper', () => {
  it('starts at epoch 0', () => {
    const mapper = new EpochPositionMapper();
    expect(mapper.getCurrentEpoch()).toBe(0);
  });

  it('ignores transactions that do not change the document', () => {
    const mapper = new EpochPositionMapper();
    mapper.recordTransaction({ docChanged: false } as unknown as Transaction);
    expect(mapper.getCurrentEpoch()).toBe(0);
  });

  it('maps positions forward across epochs using StepMaps', () => {
    const mapper = new EpochPositionMapper();

    // Epoch 0 -> 1: insert 2 units at pos 1
    mapper.recordTransaction({
      docChanged: true,
      mapping: { maps: [new StepMap([1, 0, 2])] },
    } as unknown as Transaction);

    // Epoch 1 -> 2: delete 1 unit at pos 3
    mapper.recordTransaction({
      docChanged: true,
      mapping: { maps: [new StepMap([3, 1, 0])] },
    } as unknown as Transaction);

    expect(mapper.getCurrentEpoch()).toBe(2);

    const mapped = mapper.mapPosFromLayoutToCurrentDetailed(5, 0, 1);
    expect(mapped.ok).toBe(true);
    if (mapped.ok) {
      // 5 -> (insert at 1) 7 -> (delete at 3) 6
      expect(mapped.pos).toBe(6);
      expect(mapped.fromEpoch).toBe(0);
      expect(mapped.toEpoch).toBe(2);
    }
  });

  it('returns null when a mapped position is deleted', () => {
    const mapper = new EpochPositionMapper();
    mapper.recordTransaction({
      docChanged: true,
      mapping: { maps: [new StepMap([3, 2, 0])] },
    } as unknown as Transaction);

    const mapped = mapper.mapPosFromLayoutToCurrentDetailed(4, 0, 1);
    expect(mapped.ok).toBe(false);
    if (!mapped.ok) {
      expect(mapped.reason).toBe('deleted');
    }
  });

  it('fails deterministically when StepMaps are missing', () => {
    const mapper = new EpochPositionMapper();

    mapper.recordTransaction({
      docChanged: true,
      mapping: { maps: [new StepMap([1, 0, 1])] },
    } as unknown as Transaction);
    mapper.recordTransaction({
      docChanged: true,
      mapping: { maps: [new StepMap([2, 0, 1])] },
    } as unknown as Transaction);

    // Drop epoch 0 maps; mapping from epoch 0 should now fail.
    mapper.onLayoutComplete(1);

    const mapped = mapper.mapPosFromLayoutToCurrentDetailed(1, 0, 1);
    expect(mapped.ok).toBe(false);
    if (!mapped.ok) {
      expect(mapped.reason).toBe('missing_stepmap');
    }
  });

  it('fails with epoch_too_old after pruning beyond maxEpochsToKeep', () => {
    const mapper = new EpochPositionMapper({ maxEpochsToKeep: 2 });
    for (let i = 0; i < 5; i += 1) {
      mapper.recordTransaction({
        docChanged: true,
        mapping: { maps: [new StepMap([1, 0, 1])] },
      } as unknown as Transaction);
    }

    const mapped = mapper.mapPosFromLayoutToCurrentDetailed(1, 0, 1);
    expect(mapped.ok).toBe(false);
    if (!mapped.ok) {
      expect(mapped.reason).toBe('epoch_too_old');
    }
  });

  // Edge case tests
  it('handles invalid positions (negative)', () => {
    const mapper = new EpochPositionMapper();
    mapper.recordTransaction({
      docChanged: true,
      mapping: { maps: [new StepMap([1, 0, 1])] },
    } as unknown as Transaction);

    const mapped = mapper.mapPosFromLayoutToCurrentDetailed(-1, 0, 1);
    expect(mapped.ok).toBe(false);
    if (!mapped.ok) {
      expect(mapped.reason).toBe('invalid_pos');
    }
  });

  it('handles invalid positions (NaN)', () => {
    const mapper = new EpochPositionMapper();
    const mapped = mapper.mapPosFromLayoutToCurrentDetailed(NaN, 0, 1);
    expect(mapped.ok).toBe(false);
    if (!mapped.ok) {
      expect(mapped.reason).toBe('invalid_pos');
    }
  });

  it('handles invalid positions (Infinity)', () => {
    const mapper = new EpochPositionMapper();
    const mapped = mapper.mapPosFromLayoutToCurrentDetailed(Infinity, 0, 1);
    expect(mapped.ok).toBe(false);
    if (!mapped.ok) {
      expect(mapped.reason).toBe('invalid_pos');
    }
  });

  it('handles invalid epochs (negative)', () => {
    const mapper = new EpochPositionMapper();
    const mapped = mapper.mapPosFromLayoutToCurrentDetailed(5, -1, 1);
    expect(mapped.ok).toBe(false);
    if (!mapped.ok) {
      expect(mapped.reason).toBe('invalid_epoch');
    }
  });

  it('handles invalid epochs (NaN)', () => {
    const mapper = new EpochPositionMapper();
    const mapped = mapper.mapPosFromLayoutToCurrentDetailed(5, NaN, 1);
    expect(mapped.ok).toBe(false);
    if (!mapped.ok) {
      expect(mapped.reason).toBe('invalid_epoch');
    }
  });

  it('handles invalid epochs (fromEpoch > toEpoch)', () => {
    const mapper = new EpochPositionMapper();
    mapper.recordTransaction({
      docChanged: true,
      mapping: { maps: [new StepMap([1, 0, 1])] },
    } as unknown as Transaction);

    const mapped = mapper.mapPosFromLayoutToCurrentDetailed(5, 5, 1);
    expect(mapped.ok).toBe(false);
    if (!mapped.ok) {
      expect(mapped.reason).toBe('invalid_epoch');
    }
  });

  it('handles concurrent pruning and mapping', () => {
    const mapper = new EpochPositionMapper({ maxEpochsToKeep: 3 });

    for (let i = 0; i < 5; i += 1) {
      mapper.recordTransaction({
        docChanged: true,
        mapping: { maps: [new StepMap([1, 0, 1])] },
      } as unknown as Transaction);
    }

    // Prune via onLayoutComplete
    mapper.onLayoutComplete(3);

    // Try to map from epoch 0 (should be pruned)
    const mapped = mapper.mapPosFromLayoutToCurrentDetailed(5, 0, 1);
    expect(mapped.ok).toBe(false);
  });

  it('handles empty mapping.maps array', () => {
    const mapper = new EpochPositionMapper();
    mapper.recordTransaction({
      docChanged: true,
      mapping: { maps: [] },
    } as unknown as Transaction);

    const mapped = mapper.mapPosFromLayoutToCurrentDetailed(5, 0, 1);
    expect(mapped.ok).toBe(true);
    if (mapped.ok) {
      expect(mapped.pos).toBe(5); // No transformation applied
    }
  });

  it('returns same position when fromEpoch equals toEpoch', () => {
    const mapper = new EpochPositionMapper();
    const mapped = mapper.mapPosFromLayoutToCurrentDetailed(42, 0, 1);
    expect(mapped.ok).toBe(true);
    if (mapped.ok) {
      expect(mapped.pos).toBe(42);
      expect(mapped.fromEpoch).toBe(0);
      expect(mapped.toEpoch).toBe(0);
    }
  });

  it('handles complex multi-step mapping sequence', () => {
    const mapper = new EpochPositionMapper();

    // Epoch 0 -> 1: insert 10 at pos 0
    mapper.recordTransaction({
      docChanged: true,
      mapping: { maps: [new StepMap([0, 0, 10])] },
    } as unknown as Transaction);

    // Epoch 1 -> 2: delete 5 at pos 5
    mapper.recordTransaction({
      docChanged: true,
      mapping: { maps: [new StepMap([5, 5, 0])] },
    } as unknown as Transaction);

    // Epoch 2 -> 3: insert 3 at pos 2
    mapper.recordTransaction({
      docChanged: true,
      mapping: { maps: [new StepMap([2, 0, 3])] },
    } as unknown as Transaction);

    // Map position 8 from epoch 0 to current (epoch 3)
    // 8 -> (insert 10 at 0) 18 -> (delete 5 at 5) 13 -> (insert 3 at 2) 16
    const mapped = mapper.mapPosFromLayoutToCurrentDetailed(8, 0, 1);
    expect(mapped.ok).toBe(true);
    if (mapped.ok) {
      expect(mapped.pos).toBe(16);
    }
  });
});
