/**
 * Runtime block-identity repair for the plan engine.
 *
 * Counterpart to the import-time `normalizeDuplicateBlockIdentitiesInContent`
 * pass. The importer dedups duplicate `w14:paraId` / `sdBlockId` / `blockId`
 * values during DOCX → PM JSON conversion, so a fresh `Editor.open(buffer)`
 * always produces a clean block index.
 *
 * The runtime path can still see duplicates, though:
 *
 * 1. **Yjs / collab restore.** When an editor hydrates from a pre-existing
 *    `YXmlFragment` (`Editor.options.fragment`), the importer never runs —
 *    `Editor#generatePmData` goes straight from `yXmlFragmentToProseMirrorRootNode`
 *    to PM state. Documents whose base copy was imported by an older SuperDoc
 *    (before the dedup pass landed) carry their duplicate paraIds forward
 *    forever.
 * 2. **Schema-injected JSON.** `loadFromSchema` accepts arbitrary PM JSON and
 *    runs the schema reviver, but does not dedup block identities. (V2 import
 *    via `createDocument` does; the JSON loader path does not.)
 *
 * Both cases produce a PM doc that fails the `assertNoDuplicateBlockIds` gate
 * at the top of `compilePlan`, so the customer cannot perform any mutation.
 *
 * The fix is to rerun the importer's renaming policy against live PM state
 * before the assertion fires. We use the same identity-attribute priorities
 * and the same deterministic allocator so behavior stays consistent.
 */

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Editor } from '../../core/Editor.js';
import {
  createDeterministicDocxIdAllocator,
  getExplicitIdentityEntries,
  groupIdentityEntriesByValue,
} from '../../core/super-converter/v2/importer/block-identity-renaming.js';
import { getBlockIndex } from '../helpers/index-cache.js';
import type { ExplicitIdentityMap } from '../helpers/node-address-resolver.js';
import { planError } from './errors.js';

interface NodeRepairPlan {
  pos: number;
  /** Identity groups (value → attrs) that were rewritten on this node. */
  rewrittenGroups: Array<{ originalValue: string; replacementValue: string; attrs: string[] }>;
}

export interface RepairBlockIdentitiesReport {
  /** Total number of block nodes whose identity attrs were rewritten. */
  repairedBlockCount: number;
  /** The original identity values that collided (one entry per duplicate group). */
  duplicateBlockIds: string[];
  /** The original→replacement mapping applied (deterministic, useful for tests/logs). */
  renames: Array<{ originalValue: string; replacementValue: string; attrs: string[] }>;
}

/**
 * Produces a deterministic list of node-level repair plans for any block whose
 * explicit identity attrs collide with an earlier block.
 *
 * Two modes:
 *
 * - **Fast path** (`identityMap` provided): the caller has already walked the
 *   doc once (via `buildBlockIndex`) and accumulated the side-channel
 *   {@link ExplicitIdentityMap}. We then iterate that map (O(unique values))
 *   to detect duplicates and use the recorded positions directly. On a clean
 *   doc this is O(N) on the map size with no second descendants pass.
 * - **Fallback path** (no `identityMap`): we walk the doc twice ourselves —
 *   first to reserve identities and detect duplicates, then to assemble
 *   per-node repair plans. Retained for mock/test editors that hand
 *   `repairDuplicateBlockIdentities` a stubbed state without a cache-backed
 *   block index.
 *
 * In both modes the allocator reserves every explicit identity value in the
 * doc up front (matches the importer pass) so newly-allocated IDs never
 * collide with values that appear later.
 *
 * Repairs the union of explicit identity attrs that contributed the duplicate
 * value — e.g. if `paraId === sdBlockId === 'XYZ'` both get the same
 * replacement, so the alias entry in `buildBlockIndex` stays consistent.
 *
 * Synthesis (filling in a missing `paraId` for naked paragraphs) is left to
 * the importer; the runtime path only ever rewrites duplicates that already
 * have an explicit value, because synthesizing here would invent a public
 * identity mid-session and break adapter targeting.
 */
function planRepairs(
  doc: ProseMirrorNode,
  identityMap?: ExplicitIdentityMap,
): { plans: NodeRepairPlan[]; report: RepairBlockIdentitiesReport } {
  if (identityMap) {
    return planRepairsFromIdentityMap(identityMap);
  }
  return planRepairsByWalk(doc);
}

/**
 * Fast path: build repair plans from the pre-collected {@link ExplicitIdentityMap}.
 *
 * `buildBlockIndex` has already walked the doc once, so all we need to do is
 * scan the map for entries whose observation count is > 1 — those are the
 * duplicate values. The first observation (by document position) keeps its
 * identity; every subsequent observation gets allocated a fresh replacement.
 *
 * Map iteration preserves insertion order, which is `doc.descendants` order,
 * so the first-occurrence-wins rule is automatic. Subsequent occurrences,
 * however, can be interleaved across different identity-value groups (e.g.
 * `A1, B1, B2, A2`), so we collect every rewrite into a flat list and sort by
 * document position before allocating replacement IDs — that way the
 * deterministic allocator emits IDs in document order, matching the
 * fallback/importer walks exactly.
 */
function planRepairsFromIdentityMap(identityMap: ExplicitIdentityMap): {
  plans: NodeRepairPlan[];
  report: RepairBlockIdentitiesReport;
} {
  // Early-exit on clean docs is O(map size): if no value has > 1 observation,
  // there is nothing to repair.
  let hasDuplicates = false;
  for (const observations of identityMap.values()) {
    if (observations.length > 1) {
      hasDuplicates = true;
      break;
    }
  }
  if (!hasDuplicates) {
    return { plans: [], report: { repairedBlockCount: 0, duplicateBlockIds: [], renames: [] } };
  }

  // Collect every rewrite (i.e. every duplicate occurrence after the first)
  // across all identity-value groups, then sort by document position so the
  // allocator emits replacement IDs in the same order as a single-pass walk.
  // Without this sort the order would follow Map-iteration-then-within-group,
  // which only matches doc order when duplicates are not interleaved.
  const rewrites: Array<{ pos: number; value: string; attrs: readonly string[] }> = [];
  for (const [value, observations] of identityMap) {
    if (observations.length <= 1) continue;
    for (let i = 1; i < observations.length; i += 1) {
      const { pos, attrs } = observations[i];
      rewrites.push({ pos, value, attrs });
    }
  }
  rewrites.sort((a, b) => a.pos - b.pos);

  // Reserve every value (including duplicates) so freshly-allocated IDs never
  // collide with anything currently in the doc.
  const reservedIds = new Set<string>(identityMap.keys());
  const allocateDocxId = createDeterministicDocxIdAllocator(reservedIds);

  // Stage repair groups per-position. A node may carry multiple distinct
  // identity values (e.g. paraId !== sdBlockId), each of which could be a
  // duplicate, so we accumulate by position then materialize plans in
  // ascending position order.
  const plansByPos = new Map<number, NodeRepairPlan>();
  const duplicateBlockIds: string[] = [];
  const renames: RepairBlockIdentitiesReport['renames'] = [];

  for (const { pos, value, attrs } of rewrites) {
    const replacementValue = allocateDocxId();
    let plan = plansByPos.get(pos);
    if (!plan) {
      plan = { pos, rewrittenGroups: [] };
      plansByPos.set(pos, plan);
    }
    const attrsCopy = [...attrs];
    plan.rewrittenGroups.push({ originalValue: value, replacementValue, attrs: attrsCopy });
    duplicateBlockIds.push(value);
    renames.push({ originalValue: value, replacementValue, attrs: attrsCopy });
  }

  // Emit plans in ascending position to match the descendants-walk ordering
  // the fallback path produces (keeps tests/snapshots aligned).
  const plans = [...plansByPos.values()].sort((a, b) => a.pos - b.pos);

  return {
    plans,
    report: { repairedBlockCount: plans.length, duplicateBlockIds, renames },
  };
}

/**
 * Fallback path: walk the doc twice when no pre-collected identity map is
 * available (mock editors, direct callers that bypass the block-index cache).
 */
function planRepairsByWalk(doc: ProseMirrorNode): { plans: NodeRepairPlan[]; report: RepairBlockIdentitiesReport } {
  // First walk reserves every explicit identity value the doc currently uses,
  // so the allocator never picks a replacement that collides with a value
  // sitting later in the doc. While we're here, track whether any value was
  // observed twice — that is the single source of truth for "the doc actually
  // has duplicates to repair", matching the planner's own definition. Acts as
  // an early-exit gate for clean docs without a separate `index`-based scan
  // (which projects via the resolver and would miss `sdBlockId`-only
  // collisions).
  const reservedIds = new Set<string>();
  let hasDuplicates = false;
  doc.descendants((node) => {
    const entries = getExplicitIdentityEntries(node.attrs as Record<string, unknown>, node.type?.name);
    for (const { value } of groupIdentityEntriesByValue(entries)) {
      if (reservedIds.has(value)) {
        hasDuplicates = true;
      } else {
        reservedIds.add(value);
      }
    }
  });

  if (!hasDuplicates) {
    return { plans: [], report: { repairedBlockCount: 0, duplicateBlockIds: [], renames: [] } };
  }

  const allocateDocxId = createDeterministicDocxIdAllocator(reservedIds);
  const seenIds = new Set<string>();
  const plans: NodeRepairPlan[] = [];
  const duplicateBlockIds: string[] = [];
  const renames: RepairBlockIdentitiesReport['renames'] = [];

  doc.descendants((node, pos) => {
    const entries = getExplicitIdentityEntries(node.attrs as Record<string, unknown>, node.type?.name);
    const groups = groupIdentityEntriesByValue(entries);
    if (groups.length === 0) return;

    let plan: NodeRepairPlan | null = null;

    for (const group of groups) {
      if (seenIds.has(group.value)) {
        if (!plan) plan = { pos, rewrittenGroups: [] };
        const replacementValue = allocateDocxId();
        plan.rewrittenGroups.push({ originalValue: group.value, replacementValue, attrs: [...group.attrs] });
        duplicateBlockIds.push(group.value);
        renames.push({ originalValue: group.value, replacementValue, attrs: [...group.attrs] });
        seenIds.add(replacementValue);
      } else {
        seenIds.add(group.value);
      }
    }

    if (plan) plans.push(plan);
  });

  return {
    plans,
    report: { repairedBlockCount: plans.length, duplicateBlockIds, renames },
  };
}

/**
 * Identifies duplicate block identities in the editor's current state and, if
 * any are found, dispatches a single transaction that renames the duplicate
 * halves using the same deterministic allocator as the import-time normalizer.
 *
 * Returns a report describing what was repaired. Returns `null` if no repair
 * was necessary.
 *
 * The transaction is marked with `addToHistory: false` because the rename is
 * remediation, not user intent — undoing it would just put the editor back
 * into the broken state.
 *
 * Uses per-attribute `tr.setNodeAttribute` calls (not `setNodeMarkup`) because
 * those emit PM AttrSteps with no `from`/`to` range. Transaction filters that
 * gate ranged steps (`structured-content-lock-plugin.filterTransaction` skips
 * "steps without from/to" by design; `permission-ranges` follows the same
 * convention) cannot silently reject metadata-only rewrites, so a duplicate
 * paraId sitting inside a locked SDT is still repaired. See
 * `sdt-properties-write.ts` for the same documented pattern.
 *
 * After dispatch we verify the planned attrs actually landed on the doc. If a
 * filter rejected the transaction anyway, we surface that as an explicit
 * `REPAIR_BLOCKED` error rather than returning a misleading success report —
 * see
 */
export function repairDuplicateBlockIdentities(editor: Editor): RepairBlockIdentitiesReport | null {
  const doc = editor.state?.doc;
  // Defensive: mock editors used by unit tests sometimes hand us a stub state
  // without a real PM doc. The walk requires `descendants` and `tr`; without
  // them the repair pass is a no-op and the legacy `assertNoDuplicateBlockIds`
  // check (which only reads `index.candidates`) does its own thing.
  if (!doc || typeof doc.descendants !== 'function') return null;
  if (typeof editor.state?.tr !== 'object' || editor.state.tr === null) return null;
  if (typeof editor.dispatch !== 'function') return null;

  // Reuse the side-channel map populated during the block-index build. On a
  // clean 1000-page doc this avoids the second full descendants traversal —
  // see at scale, the dedicated walk costs ~10k callbacks
  // per mutation. `getBlockIndex` is already called by `compilePlan` before
  // us, so the cache is warm; if the index doesn't carry the side channel
  // (legacy mocks that hand-construct a BlockIndex), fall back to the in-tree
  // walk.
  let identityMap: ExplicitIdentityMap | undefined;
  try {
    identityMap = getBlockIndex(editor).explicitIdentities;
  } catch {
    // Stubbed editors without a real cache fall back to the walk path.
    identityMap = undefined;
  }

  const { plans, report } = planRepairs(doc, identityMap);
  if (plans.length === 0) return null;

  const tr = editor.state.tr;
  tr.setMeta('addToHistory', false);
  // Tag the transaction so observers (collaboration, telemetry, track-changes)
  // can attribute it to the runtime repair pass rather than user edits.
  tr.setMeta('superdoc/block-identity-repair', report);

  for (const plan of plans) {
    // Positions are stable across these writes — AttrSteps don't shift sizes.
    // Issue one setNodeAttribute per renamed identity attr so each emitted
    // step is a metadata-only AttrStep that transaction filters ignore.
    for (const group of plan.rewrittenGroups) {
      for (const attr of group.attrs) {
        tr.setNodeAttribute(plan.pos, attr, group.replacementValue);
      }
    }
  }

  editor.dispatch(tr);

  // Verify the repair actually landed. If a transaction filter rejected the
  // tr (despite our metadata-only steps), the doc is unchanged and returning
  // `report` would cause `assertNoDuplicateBlockIds` to throw a misleading
  // downstream error. Fail loud instead.
  const blockedNodeIds: string[] = [];
  for (const plan of plans) {
    const node = editor.state.doc.nodeAt(plan.pos);
    if (!node) {
      // Position no longer resolves to a node — treat as blocked so the
      // caller doesn't trust a partial repair.
      blockedNodeIds.push(`pos:${plan.pos}`);
      continue;
    }
    for (const group of plan.rewrittenGroups) {
      for (const attr of group.attrs) {
        if (node.attrs?.[attr] !== group.replacementValue) {
          const observedId =
            (typeof node.attrs?.id === 'string' && node.attrs.id) ||
            (typeof node.attrs?.sdBlockId === 'string' && node.attrs.sdBlockId) ||
            `pos:${plan.pos}`;
          blockedNodeIds.push(observedId);
        }
      }
    }
  }

  if (blockedNodeIds.length > 0) {
    const unique = [...new Set(blockedNodeIds)];
    // Defensive per-ID cap: paraIds are 8 hex chars and sdBlockIds are 36-char
    // UUIDs in practice, so the formatted preview won't explode under normal
    // conditions — but a stray oversized identity (e.g. a custom blockId from
    // an upstream tool) shouldn't be able to balloon the error message.
    const MAX_ID_PREVIEW_LENGTH = 32;
    const truncate = (id: string): string =>
      id.length > MAX_ID_PREVIEW_LENGTH ? `${id.slice(0, MAX_ID_PREVIEW_LENGTH - 1)}…` : id;
    const preview = unique.slice(0, 4).map(truncate).join(', ');
    const previewSuffix = unique.length > 4 ? `, +${unique.length - 4} more` : '';
    throw planError(
      'REPAIR_BLOCKED',
      `Runtime identity repair was rejected by a transaction filter ` +
        `(${unique.length} node${unique.length === 1 ? '' : 's'}: ${preview}${previewSuffix}). ` +
        `A structured-content lock or permission range likely covers one of the duplicate blocks. ` +
        `Re-import the document via doc.open to assign unique identities.`,
      undefined,
      {
        blockedNodeIds: unique,
        remediation: 'Re-import the document via doc.open to assign unique identities.',
      },
    );
  }

  return report;
}
