import { describe, expect, it } from 'vite-plus/test';

import SuperDocSource from '../SuperDoc.vue?raw';
import { getV2TrackedChangeMutationImpact } from './v2-review-mutation-impact.js';

const trackedChange = (entityId) => ({ kind: 'entity', entityType: 'trackedChange', entityId });

describe('v2 review mutation impact', () => {
  it('classifies inserted and updated identities for targeted refresh', () => {
    const impact = getV2TrackedChangeMutationImpact({
      type: 'mutation:committed',
      origin: 'command',
      receipt: { success: true, inserted: [trackedChange('new')], updated: [trackedChange('survivor')] },
    });

    expect([...impact.upsertIds]).toEqual(['new', 'survivor']);
    expect([...impact.removedIds]).toEqual([]);
    expect(impact.reconcileMode).toBe('targeted');
  });

  it('classifies tracked refs carried beside a structural block delta', () => {
    const impact = getV2TrackedChangeMutationImpact({
      type: 'mutation:committed',
      origin: 'command',
      receipt: {
        success: true,
        inserted: { kind: 'block', nodeType: 'paragraph', nodeId: 'tail' },
        trackedChangeRefs: [trackedChange('paragraph-mark-insertion')],
      },
    });

    expect([...impact.upsertIds]).toEqual(['paragraph-mark-insertion']);
    expect([...impact.removedIds]).toEqual([]);
  });

  it('classifies removals, invalidations, and remaps from history results', () => {
    const impact = getV2TrackedChangeMutationImpact({
      type: 'mutation:committed',
      origin: 'history',
      result: {
        removed: [trackedChange('removed')],
        invalidatedRefs: [trackedChange('invalidated')],
        remappedRefs: [{ from: trackedChange('old'), to: trackedChange('new') }],
      },
    });

    expect([...impact.upsertIds]).toEqual(['new']);
    expect([...impact.removedIds]).toEqual(['removed', 'invalidated', 'old']);
    expect(impact.remappedPairs).toEqual([{ from: 'old', to: 'new' }]);
    expect(impact.reconcileMode).toBe('targeted');
  });

  it('returns null when a mutation has no tracked-change receipt effects', () => {
    expect(
      getV2TrackedChangeMutationImpact({
        type: 'mutation:committed',
        origin: 'command',
        receipt: { success: true, updated: [{ kind: 'entity', entityType: 'comment', entityId: 'c1' }] },
      }),
    ).toBeNull();
  });

  it('retains a fully bound all-resolved fact for one-pass store clearing', () => {
    const fact = {
      schemaVersion: 1,
      targetKind: 'all',
      decision: 'accept',
      catalogRevision: '7',
      sourceCoverageRevision: 'coverage-7',
      logicalTargetCount: 1_300,
      physicalCarrierCount: 2_600,
      remainingLogicalCount: 0,
      txId: 'tx-bulk',
      documentEpoch: 'document-1',
      commitSequence: 9,
      packagePreviousRevision: 'package-7',
      packageNextRevision: 'package-8',
    };
    const impact = getV2TrackedChangeMutationImpact({
      type: 'mutation:committed',
      origin: 'command',
      receipt: { success: true, txId: 'tx-bulk' },
      trackedChangeAllResolved: fact,
    });

    expect(impact).toMatchObject({ allResolved: fact, reconcileMode: 'targeted' });
    expect(impact.upsertIds.size).toBe(0);
    expect(impact.removedIds.size).toBe(0);
  });
});

describe('mounted v2 review mutation wiring', () => {
  it('applies receipt-local effects and forwards every committed page window', () => {
    expect(SuperDocSource).toContain('commentsStore.reconcileTrackedChangeMutationFromV2?.({');
    expect(SuperDocSource).not.toContain('createV2ReviewMutationReconciler');
    expect(SuperDocSource).toContain("armV2TrackedChangeRestampGeometryRetention('tracked-change-mutation')");
    expect(SuperDocSource).toContain("'render-epoch-handoff'");
    expect(SuperDocSource).toContain(
      'scheduleV2GeometryPublish(payload, () => takeV2TrackedChangeRestampGeometryRetention())',
    );
    expect(SuperDocSource).toMatch(
      /onReviewWindowCommitted: \(payload\) => \{[\s\S]+?v2ReviewWindowController\.onCommittedPagePaint\?\.\(\{ \.\.\.payload, documentId: doc\.id \}\)/,
    );
    expect(SuperDocSource).toContain('resolveReviewWindow: (input) => host.resolveReviewWindow(input)');
    expect(SuperDocSource).not.toContain('onReviewWindowPlanned: (payload) =>');
    expect(SuperDocSource).not.toContain('createV2TypingReviewHydrationScheduler');
    expect(SuperDocSource).not.toContain('createV2RemoteReviewHydrationScheduler');
    expect(SuperDocSource).not.toContain("reconcileInBackground?.('typing-idle')");
    expect(SuperDocSource).not.toContain('hydrateV2ReviewRowsFromHost');
    expect(SuperDocSource).not.toContain("invalidate('mutation-committed')");
    expect(SuperDocSource).not.toContain('demandCatalog');
    expect(SuperDocSource).not.toContain('releaseCatalogDemand');
  });

  it('uses a review-mutation barrier without starting deferred catalog work', () => {
    expect(SuperDocSource).toMatch(
      /event\.type === 'review-mutation:started'[\s\S]+?v2ReviewWindowController\.beginMutation\(event\.reviewMutation\)/,
    );
    expect(SuperDocSource).toMatch(
      /const handleV2DocumentModeChange = \(\) => \{[\s\S]+?v2ReviewWindowController\.refreshCommittedWindow\('document-mode-change'\)/,
    );
    expect(SuperDocSource).not.toContain('clearV2TypingReviewHydrationTimer');
  });

  it('attaches the review controller even when the built-in comments surface is disabled', () => {
    expect(SuperDocSource).toMatch(
      /if \(commentsAdapter \|\| trackedChangesAdapter\) \{[\s\S]+?v2ReviewWindowController\.setContext\(/,
    );
    expect(SuperDocSource).not.toContain('commentsModuleEnabled && (commentsAdapter || trackedChangesAdapter)');
  });

  it('refreshes the bounded committed window after a remote review-only revision', () => {
    expect(SuperDocSource).toMatch(
      /event\.type === 'collaboration:remote-changed'[\s\S]+?v2ReviewWindowController\.invalidate\('collaboration:remote-review-changed'\)[\s\S]+?v2ReviewWindowController\.refreshCommittedWindow\('collaboration:remote-review-changed'\)/,
    );
  });

  it('refreshes only the committed bounded window after history metadata changes', () => {
    expect(SuperDocSource).not.toContain('v2ReviewMutationReconciler');
    expect(SuperDocSource).not.toContain('hydrateTrackedChangesFromV2');
    expect(SuperDocSource).not.toContain('listTrackedChanges(');
    expect(SuperDocSource).not.toContain('hydrateV2CommentRowsFromHost');
    expect(SuperDocSource).toMatch(
      /event\.origin === 'history'[\s\S]+?v2ReviewWindowController\.refreshCommittedWindow\(`history-\$\{event\.direction\}`\)/,
    );
  });

  it('always releases a review-mutation token and only suppresses tracked hydration after proven row clearing', () => {
    expect(SuperDocSource).toContain(
      'const reconciledAllResolved = allResolved && result?.ok === true && result?.allResolved === true;',
    );
    expect(SuperDocSource).toContain(
      "resumeDomains: reconciledAllResolved ? ['comments'] : ['comments', 'trackedChanges']",
    );
    expect(SuperDocSource).toContain(
      'Promise.resolve(reconciliation).then(settleReviewMutation, () => settleReviewMutation(null))',
    );
  });
});
