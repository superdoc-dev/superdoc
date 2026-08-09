/**
 * Plan 15 — the spliced `blockResumeCheckpoints` sidecar must be EXACTLY
 * cold-equal. Two defect classes lived here (both reproduced before the fix,
 * both routed to Plan 15 by the Plans 06/09 records):
 *
 *  - the dirty block's PREDECESSOR lost its checkpoint (its stamp sits ON
 *    the partial-checkpoint page and the strict prefix test dropped it) —
 *    the freddie oracle's 19-of-3,423 missing-boundary-checkpoints family;
 *  - the SUFFIX-START block's stamp came from the local relaid run
 *    (post-break, top-of-window) where cold stamps the pre-break state on
 *    the preceding page — the stitched-plane one-line resume drift family
 *    (alkuri/nvca page-zero partial resumes refusing convergence).
 *
 * A later resume replays the exact cold break decision only if this map is
 * exact, so the pin sweeps every mid-document edit position and requires
 * full per-entry equality against a cold recompute.
 */
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { FlowBlock, Layout, Line, Measure, Page, ParagraphBlock, ParagraphMeasure } from '@superdoc/contracts';
import { clearIncrementalModuleState, incrementalLayout, type IncrementalLayoutReuseOptions } from '../src/index.js';
import { computeDirtyRegions } from '../src/diff.js';

const OPTIONS = {
  pageSize: { w: 240, h: 140 },
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
  columns: { count: 1, gap: 0 },
};

function paragraph(id: string, text: string, pmStart: number): ParagraphBlock {
  return { kind: 'paragraph', id, runs: [{ kind: 'text', text, pmStart, pmEnd: pmStart + text.length }] };
}
function paragraphs(count: number): ParagraphBlock[] {
  return Array.from({ length: count }, (_, i) => paragraph(`p${i}`, `text-${i}`, 1 + i * 20));
}
/** Multi-line measures so blocks SPAN pages: block p<i> has (1 + i%3) lines. */
const measureBlock = vi.fn(async (block: FlowBlock): Promise<Measure> => {
  if (block.kind !== 'paragraph') throw new Error('unexpected');
  const n = 1 + (Number(block.id.slice(1)) % 3);
  const lines: Line[] = Array.from({ length: n }, (_, k) => ({
    fromRun: 0,
    fromChar: k,
    toRun: 0,
    toChar: k + 1,
    width: 100,
    ascent: 22,
    descent: 8,
    lineHeight: 30,
  }));
  return { kind: 'paragraph', lines, totalHeight: 30 * n } as ParagraphMeasure;
});

function pageStartKey(page: Page): string {
  const f = page.fragments[0];
  const s = page.sectionIndex ?? 0;
  if (!f) return `#empty#0#${s}#0`;
  const from = 'fromLine' in f ? f.fromLine : 'fromRow' in f ? f.fromRow : 0;
  const carry = 'continuesFromPrev' in f && f.continuesFromPrev === true ? 1 : 0;
  return `${f.blockId}#${from ?? 0}#${s}#${carry}`;
}
function blockPageIndex(layout: Layout): Map<string, { firstPage: number; lastPage: number }> {
  const index = new Map<string, { firstPage: number; lastPage: number }>();
  layout.pages.forEach((page, pi) => {
    for (const f of page.fragments) {
      const prev = index.get(f.blockId);
      if (prev) prev.lastPage = pi;
      else index.set(f.blockId, { firstPage: pi, lastPage: pi });
    }
  });
  return index;
}
function buildReuse(
  prevB: FlowBlock[],
  nextB: FlowBlock[],
  prevL: Layout,
  editPmEnd: number,
): IncrementalLayoutReuseOptions {
  const keys = prevL.pages.map(pageStartKey);
  const keyIndex = new Map<string, number[]>();
  keys.forEach((k, i) => keyIndex.set(k, [...(keyIndex.get(k) ?? []), i]));
  const dirty = computeDirtyRegions(prevB, nextB);
  return {
    previousLayout: prevL,
    retainedMetadataSourceLayoutEpoch: prevL.layoutEpoch ?? null,
    previousPageStartKeys: keys,
    previousPageStartKeyIndex: keyIndex,
    previousBlockPageIndex: blockPageIndex(prevL),
    currentBlockIndexById: new Map(nextB.map((b, i) => [b.id, i])),
    maxRelaidPages: 3,
    requireDocumentStartCheckpoint: false,
    dirtyBlockIds: dirty.changedBlockIds,
    pmShift: { atChar: editPmEnd, delta: 1 },
    provedDirtyRegion: dirty,
    dependencyProof: {
      profile: 'page-checkpoint-local-text',
      blockIdsUnchanged: true,
      blockIdsUnique: true,
      globalDependenciesAbsent: false,
      globalDependenciesFencedByPageCheckpoint: true,
      admittedDependencyClasses: ['body-anchored-objects'],
      renderInputsUnchanged: true,
      pageReferencesAbsent: true,
      multiColumnSectionsProvedNonBalanceable: true,
    },
  } as IncrementalLayoutReuseOptions;
}
function applyEdit(blocks: ParagraphBlock[], idx: number): ParagraphBlock[] {
  const start = blocks[idx]!.runs[0]!.pmStart!;
  return blocks.map((b, i) =>
    i === idx
      ? paragraph(b.id, `${b.runs[0]!.text}!`, b.runs[0]!.pmStart!)
      : b.runs[0]!.pmStart! > start
        ? paragraph(b.id, b.runs[0]!.text, b.runs[0]!.pmStart! + 1)
        : b,
  );
}

describe('incrementalLayout spliced checkpoint sidecar equality (plan 15)', () => {
  beforeEach(() => clearIncrementalModuleState());
  it('keeps the spliced blockResumeCheckpoints exactly cold-equal across edit positions', async () => {
    for (const editIdx of Array.from({ length: 46 }, (_, i) => i + 6)) {
      clearIncrementalModuleState();
      const prevBlocks = paragraphs(60);
      const prev = await incrementalLayout([], null, prevBlocks, OPTIONS, measureBlock);
      prev.layout.layoutEpoch = 1;
      const nextBlocks = applyEdit(prevBlocks, editIdx);
      const inc = await incrementalLayout(
        prevBlocks,
        prev.layout,
        nextBlocks,
        OPTIONS,
        measureBlock,
        undefined,
        prev.measures,
        undefined,
        undefined,
        buildReuse(prevBlocks, nextBlocks, prev.layout, prevBlocks[editIdx]!.runs[0]!.pmEnd!),
      );
      clearIncrementalModuleState();
      const cold = await incrementalLayout([], null, nextBlocks, OPTIONS, measureBlock);
      const spliced = new Map(inc.layout.blockResumeCheckpoints ?? []);
      const coldMap = new Map(cold.layout.blockResumeCheckpoints ?? []);
      const missing: string[] = [];
      const wrong: string[] = [];
      for (const [id, cp] of coldMap) {
        const got = spliced.get(id);
        if (!got) {
          missing.push(`${id}@p${cp.pageIndex}`);
          continue;
        }
        if (
          JSON.stringify({ ...got, footnoteAnchorsThisPage: [...got.footnoteAnchorsThisPage] }) !==
          JSON.stringify({ ...cp, footnoteAnchorsThisPage: [...cp.footnoteAnchorsThisPage] })
        ) {
          wrong.push(`${id}: got p${got.pageIndex} y${got.cursorY} want p${cp.pageIndex} y${cp.cursorY}`);
        }
      }
      expect(inc.layoutReuse.mode, `editIdx=${editIdx}`).toBe('tail-splice');
      expect(missing, `editIdx=${editIdx} missing`).toEqual([]);
      expect(wrong, `editIdx=${editIdx} wrong`).toEqual([]);
      expect(spliced.size, `editIdx=${editIdx} size`).toBe(coldMap.size);
    }
  });
});
