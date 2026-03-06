import { describe, expect, test } from 'bun:test';
import { Doc as YDoc, XmlElement } from 'yjs';
import {
  DEFAULT_BOOTSTRAP_SETTLING_MS,
  DEFAULT_BOOTSTRAP_JITTER_MS,
  waitForContentSettling,
  detectRoomState,
  resolveBootstrapDecision,
  writeBootstrapMarker,
  clearBootstrapMarker,
  claimBootstrap,
  detectBootstrapRace,
  type BootstrapMarker,
} from '../bootstrap';

// ---------------------------------------------------------------------------
// detectRoomState
// ---------------------------------------------------------------------------

describe('detectRoomState', () => {
  test('returns "empty" for a fresh ydoc', () => {
    const ydoc = new YDoc();
    expect(detectRoomState(ydoc)).toBe('empty');
  });

  test('returns "populated" when XML fragment has content', () => {
    const ydoc = new YDoc();
    const fragment = ydoc.getXmlFragment('supereditor');
    fragment.insert(0, [new XmlElement('p')]);
    expect(detectRoomState(ydoc)).toBe('populated');
  });

  test('returns "populated" when meta map has finalized bootstrap marker', () => {
    const ydoc = new YDoc();
    ydoc.getMap('meta').set('bootstrap', { version: 1, source: 'doc' });
    expect(detectRoomState(ydoc)).toBe('populated');
  });

  test('returns "populated" when meta map has non-bootstrap entries', () => {
    const ydoc = new YDoc();
    ydoc.getMap('meta').set('docx', 'some-content');
    expect(detectRoomState(ydoc)).toBe('populated');
  });

  test('returns "empty" when meta map only has a pending bootstrap marker (stale claim recovery)', () => {
    const ydoc = new YDoc();
    ydoc.getMap('meta').set('bootstrap', {
      version: 1,
      clientId: 999,
      seededAt: new Date().toISOString(),
      source: 'pending',
    });
    expect(detectRoomState(ydoc)).toBe('empty');
  });

  test('returns "populated" when meta has pending marker plus other keys', () => {
    const ydoc = new YDoc();
    const metaMap = ydoc.getMap('meta');
    metaMap.set('bootstrap', { version: 1, source: 'pending' });
    metaMap.set('docx', 'content');
    expect(detectRoomState(ydoc)).toBe('populated');
  });
});

// ---------------------------------------------------------------------------
// resolveBootstrapDecision
// ---------------------------------------------------------------------------

describe('resolveBootstrapDecision', () => {
  test('populated room always joins', () => {
    expect(resolveBootstrapDecision('populated', 'seedFromDoc', true)).toEqual({ action: 'join' });
    expect(resolveBootstrapDecision('populated', 'seedFromDoc', false)).toEqual({ action: 'join' });
    expect(resolveBootstrapDecision('populated', 'blank', true)).toEqual({ action: 'join' });
    expect(resolveBootstrapDecision('populated', 'error', true)).toEqual({ action: 'join' });
  });

  test('empty + seedFromDoc + hasDoc -> seed from doc', () => {
    expect(resolveBootstrapDecision('empty', 'seedFromDoc', true)).toEqual({ action: 'seed', source: 'doc' });
  });

  test('empty + seedFromDoc + no doc -> seed from blank', () => {
    expect(resolveBootstrapDecision('empty', 'seedFromDoc', false)).toEqual({ action: 'seed', source: 'blank' });
  });

  test('empty + blank -> seed from blank regardless of hasDoc', () => {
    expect(resolveBootstrapDecision('empty', 'blank', true)).toEqual({ action: 'seed', source: 'blank' });
    expect(resolveBootstrapDecision('empty', 'blank', false)).toEqual({ action: 'seed', source: 'blank' });
  });

  test('empty + error -> error', () => {
    const result = resolveBootstrapDecision('empty', 'error', true);
    expect(result.action).toBe('error');
    expect((result as { reason: string }).reason).toContain('onMissing');
  });
});

// ---------------------------------------------------------------------------
// writeBootstrapMarker
// ---------------------------------------------------------------------------

describe('writeBootstrapMarker', () => {
  test('writes marker to meta map with correct shape', () => {
    const ydoc = new YDoc();
    writeBootstrapMarker(ydoc, 'doc');

    const marker = ydoc.getMap('meta').get('bootstrap') as BootstrapMarker;
    expect(marker).toBeDefined();
    expect(marker.version).toBe(1);
    expect(marker.clientId).toBe(ydoc.clientID);
    expect(marker.source).toBe('doc');
    expect(typeof marker.seededAt).toBe('string');
  });

  test('clearBootstrapMarker removes the marker from the meta map', () => {
    const ydoc = new YDoc();
    writeBootstrapMarker(ydoc, 'doc');
    expect(ydoc.getMap('meta').get('bootstrap')).toBeDefined();

    clearBootstrapMarker(ydoc);
    expect(ydoc.getMap('meta').get('bootstrap')).toBeUndefined();
  });

  test('finalized marker makes detectRoomState return populated', () => {
    const ydoc = new YDoc();
    writeBootstrapMarker(ydoc, 'doc');
    expect(detectRoomState(ydoc)).toBe('populated');
  });
});

// ---------------------------------------------------------------------------
// claimBootstrap
// ---------------------------------------------------------------------------

describe('claimBootstrap', () => {
  test('returns granted when this client owns the marker', async () => {
    const ydoc = new YDoc();
    const result = await claimBootstrap(ydoc, 0, 0);
    expect(result.granted).toBe(true);

    const marker = ydoc.getMap('meta').get('bootstrap') as BootstrapMarker;
    expect(marker.clientId).toBe(ydoc.clientID);
  });

  test('claim marker has source "pending"', async () => {
    const ydoc = new YDoc();
    await claimBootstrap(ydoc, 0, 0);

    const marker = ydoc.getMap('meta').get('bootstrap') as BootstrapMarker;
    expect(marker.source).toBe('pending');
  });

  test('returns denied with competitor info when another client overwrites during settling', async () => {
    const ydoc = new YDoc();
    const otherClientId = ydoc.clientID + 1;
    const metaMap = ydoc.getMap('meta');

    const promise = claimBootstrap(ydoc, 20, 0);

    // Overwrite with the other client's marker during the settling window
    setTimeout(() => {
      metaMap.set('bootstrap', {
        version: 1,
        clientId: otherClientId,
        seededAt: new Date().toISOString(),
        source: 'pending',
      });
    }, 2);

    const result = await promise;
    expect(result.granted).toBe(false);
    if (!result.granted) {
      expect(result.competitor.observedOtherClientId).toBe(otherClientId);
      expect(result.competitor.observedSource).toBe('pending');
      expect(typeof result.competitor.observedAt).toBe('string');
    }
  });

  test('observe detects late-arriving marker after sleep ends', async () => {
    // Simulates network latency: the competing marker arrives just before
    // the final read, but the observe handler catches it reactively.
    const ydoc = new YDoc();
    const otherClientId = ydoc.clientID + 1;
    const metaMap = ydoc.getMap('meta');

    const promise = claimBootstrap(ydoc, 5, 0);

    // Overwrite at ~4ms — very close to when the sleep ends
    setTimeout(() => {
      metaMap.set('bootstrap', {
        version: 1,
        clientId: otherClientId,
        seededAt: new Date().toISOString(),
        source: 'pending',
      });
    }, 4);

    const result = await promise;
    expect(result.granted).toBe(false);
  });

  test('returns denied gracefully when marker is removed during settling', async () => {
    const ydoc = new YDoc();
    const metaMap = ydoc.getMap('meta');

    // claimBootstrap (with jitter=0) executes synchronously until
    // `await sleep(settlingMs)`, so the marker is already written
    // when control returns here. Deleting it simulates another
    // process removing the key during the settling window.
    const promise = claimBootstrap(ydoc, 20, 0);
    metaMap.delete('bootstrap');

    const result = await promise;
    expect(result.granted).toBe(false);
    if (!result.granted) {
      expect(result.competitor.observedOtherClientId).toBe(0);
      expect(result.competitor.observedSource).toBe('unknown');
    }
  });

  test('jitter=0 disables random delay', async () => {
    const ydoc = new YDoc();
    const before = Date.now();
    await claimBootstrap(ydoc, 0, 0);
    const elapsed = Date.now() - before;
    // With jitter=0 and settling=0, should complete almost instantly
    expect(elapsed).toBeLessThan(50);
  });

  test('stale pending marker does not block subsequent bootstrap detection', async () => {
    // Simulates: claimer crashes after writing pending marker
    const ydoc = new YDoc();
    ydoc.getMap('meta').set('bootstrap', {
      version: 1,
      clientId: 999, // some crashed client
      seededAt: new Date().toISOString(),
      source: 'pending',
    });

    // A new client arrives — room should still look empty
    expect(detectRoomState(ydoc)).toBe('empty');

    // So the new client can proceed to seed
    const decision = resolveBootstrapDecision('empty', 'seedFromDoc', true);
    expect(decision).toEqual({ action: 'seed', source: 'doc' });
  });

  test('SD-2138 regression: stale pending marker after join-after-claim causes false-empty on reconnect', async () => {
    // Simulates the exact scenario that causes data loss:
    // 1. Client wins claim (pending marker written)
    // 2. Content arrives during settling → client joins instead of seeding
    // 3. If pending marker is NOT cleared, a future reconnect sees:
    //    - empty fragment (slow sync) + pending-only marker → 'empty' → destructive re-seed
    // 4. Clearing the marker ensures the room doesn't have a misleading pending signal
    const ydoc = new YDoc();

    // Step 1: Win the claim — writes pending marker
    const claim = await claimBootstrap(ydoc, 0, 0);
    expect(claim.granted).toBe(true);

    const marker = ydoc.getMap('meta').get('bootstrap') as BootstrapMarker;
    expect(marker.source).toBe('pending');

    // Step 2: Content arrived during settling (simulate)
    const fragment = ydoc.getXmlFragment('supereditor');
    fragment.insert(0, [new XmlElement('p')]);
    expect(detectRoomState(ydoc)).toBe('populated');

    // Step 3: Clear the pending marker (this is the fix)
    clearBootstrapMarker(ydoc);

    // Step 4: Simulate future reconnect — new ydoc where only meta synced,
    // fragment hasn't arrived yet (slow-sync scenario)
    const reconnectYdoc = new YDoc();
    // No fragment content, no meta — room is clean after marker was cleared
    expect(detectRoomState(reconnectYdoc)).toBe('empty');

    // Without the fix, the pending marker would persist and detectRoomState
    // would still return 'empty' — but the danger is that it LOOKS like a
    // fresh room rather than a room with a stale claim. With the marker
    // cleared, at least there's no misleading pending signal.

    // The critical assertion: after clearing, the original ydoc's meta map
    // has no bootstrap key that could sync to new clients as a stale pending marker
    expect(ydoc.getMap('meta').get('bootstrap')).toBeUndefined();
  });

  test('concurrent claimers: second claimer re-detects and joins after first seeds', async () => {
    // Simulates the full claim -> re-detect -> join path for a race loser
    const ydoc = new YDoc();
    const otherClientId = ydoc.clientID + 1;
    const metaMap = ydoc.getMap('meta');

    // First claimer won and finalized the marker
    metaMap.set('bootstrap', {
      version: 1,
      clientId: otherClientId,
      seededAt: new Date().toISOString(),
      source: 'doc',
    });

    // Second client checks — room is now populated
    expect(detectRoomState(ydoc)).toBe('populated');
    const decision = resolveBootstrapDecision('populated', 'seedFromDoc', true);
    expect(decision).toEqual({ action: 'join' });
  });
});

// ---------------------------------------------------------------------------
// claim loser always yields
// ---------------------------------------------------------------------------

describe('claim loser always yields', () => {
  test('loser yields even when winner marker is still pending (room looks empty)', () => {
    // After a failed claim, the loser sees the room with only a pending
    // marker (the winner hasn't finalized yet).  detectRoomState returns
    // 'empty' but the loser must NOT re-seed — they must yield.
    // This tests the contract that document.ts enforces: claim loser -> join.
    const ydoc = new YDoc();
    ydoc.getMap('meta').set('bootstrap', {
      version: 1,
      clientId: ydoc.clientID + 1, // winner
      seededAt: new Date().toISOString(),
      source: 'pending',
    });

    // Room looks empty because the only marker is pending
    expect(detectRoomState(ydoc)).toBe('empty');

    // But resolveBootstrapDecision would return 'seed' — which is WHY
    // document.ts must force 'join' after a failed claim regardless of
    // re-detected state.  The decision matrix alone is not enough.
    const naiveDecision = resolveBootstrapDecision('empty', 'seedFromDoc', true);
    expect(naiveDecision.action).toBe('seed');
    // ^ This is the bug the unconditional yield prevents
  });
});

// ---------------------------------------------------------------------------
// detectBootstrapRace
// ---------------------------------------------------------------------------

describe('detectBootstrapRace', () => {
  test('returns raceSuspected: false when no competing marker arrives', async () => {
    const ydoc = new YDoc();
    writeBootstrapMarker(ydoc, 'doc');

    const result = await detectBootstrapRace(ydoc, 10);
    expect(result.raceSuspected).toBe(false);
  });

  test('returns raceSuspected: true with competitor info when another finalized marker arrives', async () => {
    const ydoc = new YDoc();
    const otherClientId = ydoc.clientID + 1;
    writeBootstrapMarker(ydoc, 'doc');

    const promise = detectBootstrapRace(ydoc, 20);

    // Another client's finalized marker arrives during observation
    setTimeout(() => {
      ydoc.getMap('meta').set('bootstrap', {
        version: 1,
        clientId: otherClientId,
        seededAt: new Date().toISOString(),
        source: 'doc',
      });
    }, 5);

    const result = await promise;
    expect(result.raceSuspected).toBe(true);
    if (result.raceSuspected) {
      expect(result.competitor.observedOtherClientId).toBe(otherClientId);
      expect(result.competitor.observedSource).toBe('doc');
      expect(typeof result.competitor.observedAt).toBe('string');
    }
  });

  test('ignores changes to non-bootstrap meta keys', async () => {
    const ydoc = new YDoc();
    writeBootstrapMarker(ydoc, 'doc');

    const promise = detectBootstrapRace(ydoc, 20);

    // Unrelated meta key changes should not trigger false positive
    setTimeout(() => {
      ydoc.getMap('meta').set('docx', 'some-content');
    }, 5);

    const result = await promise;
    expect(result.raceSuspected).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('DEFAULT_BOOTSTRAP_SETTLING_MS', () => {
  test('is a positive number', () => {
    expect(DEFAULT_BOOTSTRAP_SETTLING_MS).toBeGreaterThan(0);
  });
});

describe('DEFAULT_BOOTSTRAP_JITTER_MS', () => {
  test('is a positive number', () => {
    expect(DEFAULT_BOOTSTRAP_JITTER_MS).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// waitForContentSettling (SD-2138)
// ---------------------------------------------------------------------------

describe('waitForContentSettling', () => {
  test('resolves immediately when fragment already has content', async () => {
    const ydoc = new YDoc();
    const fragment = ydoc.getXmlFragment('supereditor');
    fragment.insert(0, [new XmlElement('p')]);

    const before = Date.now();
    await waitForContentSettling(ydoc, 500);
    expect(Date.now() - before).toBeLessThan(50);
  });

  test('resolves immediately when meta map has finalized bootstrap marker', async () => {
    const ydoc = new YDoc();
    ydoc.getMap('meta').set('bootstrap', { version: 1, source: 'doc' });

    const before = Date.now();
    await waitForContentSettling(ydoc, 500);
    expect(Date.now() - before).toBeLessThan(50);
  });

  test('resolves immediately when meta map has non-bootstrap entries', async () => {
    const ydoc = new YDoc();
    ydoc.getMap('meta').set('docx', 'some-content');

    const before = Date.now();
    await waitForContentSettling(ydoc, 500);
    expect(Date.now() - before).toBeLessThan(50);
  });

  test('waits and resolves when fragment is populated during settling', async () => {
    const ydoc = new YDoc();
    const fragment = ydoc.getXmlFragment('supereditor');

    // Populate fragment after 20ms
    setTimeout(() => {
      fragment.insert(0, [new XmlElement('p')]);
    }, 20);

    const before = Date.now();
    await waitForContentSettling(ydoc, 500);
    const elapsed = Date.now() - before;

    // Should resolve quickly after content arrives, not wait full 500ms
    expect(elapsed).toBeGreaterThanOrEqual(15);
    expect(elapsed).toBeLessThan(200);
  });

  test('times out when no content arrives', async () => {
    const ydoc = new YDoc();

    const before = Date.now();
    await waitForContentSettling(ydoc, 50);
    const elapsed = Date.now() - before;

    expect(elapsed).toBeGreaterThanOrEqual(40);
  });

  test('does not treat pending bootstrap marker as content', async () => {
    const ydoc = new YDoc();
    ydoc.getMap('meta').set('bootstrap', {
      version: 1,
      clientId: 999,
      seededAt: new Date().toISOString(),
      source: 'pending',
    });

    const before = Date.now();
    await waitForContentSettling(ydoc, 50);
    const elapsed = Date.now() - before;

    // Should wait full timeout since pending marker is not content
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });
});
