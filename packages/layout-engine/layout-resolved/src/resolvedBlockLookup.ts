import type { FlowBlock, Measure } from '@superdoc/contracts';

export type BlockMapEntry = { block: FlowBlock; measure: Measure };

function buildMissingEntryMessage(fragmentKind: string, blockId: string): string {
  return `[layout-resolved] Missing block/measure entry for ${fragmentKind} fragment "${blockId}".`;
}

function buildWrongKindMessage(
  fragmentKind: string,
  blockId: string,
  expectedBlockKind: FlowBlock['kind'],
  expectedMeasureKind: Measure['kind'],
  actualBlockKind: FlowBlock['kind'],
  actualMeasureKind: Measure['kind'],
): string {
  return `[layout-resolved] Expected ${fragmentKind} fragment "${blockId}" to resolve to ${expectedBlockKind}/${expectedMeasureKind}, got ${actualBlockKind}/${actualMeasureKind}.`;
}

/**
 * Reads a block-map entry and verifies that both the block and measure kinds
 * match what the resolved paint item expects.
 *
 * We validate here instead of silently fabricating fallback data so failures
 * remain visible and diagnosable during the migration to resolved paint items.
 */
export function requireResolvedBlockAndMeasure<
  TBlockKind extends FlowBlock['kind'],
  TMeasureKind extends Measure['kind'],
>(
  blockMap: Map<string, BlockMapEntry>,
  blockId: string,
  fragmentKind: string,
  expectedBlockKind: TBlockKind,
  expectedMeasureKind: TMeasureKind,
): {
  block: Extract<FlowBlock, { kind: TBlockKind }>;
  measure: Extract<Measure, { kind: TMeasureKind }>;
} {
  const entry = blockMap.get(blockId);
  if (!entry) {
    throw new Error(buildMissingEntryMessage(fragmentKind, blockId));
  }

  const actualBlockKind = entry.block.kind;
  const actualMeasureKind = entry.measure.kind;
  const kindsMatch = actualBlockKind === expectedBlockKind && actualMeasureKind === expectedMeasureKind;
  if (!kindsMatch) {
    throw new Error(
      buildWrongKindMessage(
        fragmentKind,
        blockId,
        expectedBlockKind,
        expectedMeasureKind,
        actualBlockKind,
        actualMeasureKind,
      ),
    );
  }

  return {
    block: entry.block as Extract<FlowBlock, { kind: TBlockKind }>,
    measure: entry.measure as Extract<Measure, { kind: TMeasureKind }>,
  };
}
