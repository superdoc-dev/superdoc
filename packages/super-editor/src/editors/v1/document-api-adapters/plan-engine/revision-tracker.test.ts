import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getRevision, incrementRevision, initRevision, checkRevision, trackRevisions } from './revision-tracker.js';
import { PlanError } from './errors.js';
import type { Editor } from '../../core/Editor.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEditor(): Editor & { _listeners: Map<string, Function[]> } {
  const listeners = new Map<string, Function[]>();
  return {
    on(event: string, fn: Function) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(fn);
    },
    _listeners: listeners,
  } as any;
}

function emitTransaction(editor: any, docChanged: boolean, meta: Record<string, unknown> = {}) {
  const fns = editor._listeners.get('transaction') ?? [];
  for (const fn of fns) {
    fn({ transaction: { docChanged, getMeta: (key: string) => meta[key] } });
  }
}

// ---------------------------------------------------------------------------
// Core revision operations
// ---------------------------------------------------------------------------

describe('revision-tracker: core operations', () => {
  it('starts at 0 after init', () => {
    const editor = makeEditor();
    initRevision(editor);
    expect(getRevision(editor)).toBe('0');
  });

  it('increments monotonically', () => {
    const editor = makeEditor();
    initRevision(editor);

    expect(incrementRevision(editor)).toBe('1');
    expect(incrementRevision(editor)).toBe('2');
    expect(getRevision(editor)).toBe('2');
  });

  it('checkRevision passes when revision matches', () => {
    const editor = makeEditor();
    initRevision(editor);

    expect(() => checkRevision(editor, '0')).not.toThrow();
  });

  it('checkRevision throws REVISION_MISMATCH with actionable remediation', () => {
    const editor = makeEditor();
    initRevision(editor);

    try {
      checkRevision(editor, '5');
      throw new Error('expected PlanError');
    } catch (e) {
      expect(e).toBeInstanceOf(PlanError);
      const err = e as PlanError;
      expect(err.code).toBe('REVISION_MISMATCH');

      const details = err.details as Record<string, unknown>;
      expect(details.expectedRevision).toBe('5');
      expect(details.currentRevision).toBe('0');
      expect(details.refStability).toBe('ephemeral');
      expect(details.remediation).toContain('query.match');
    }
  });

  it('checkRevision is a no-op when expectedRevision is undefined', () => {
    const editor = makeEditor();
    initRevision(editor);
    expect(() => checkRevision(editor, undefined)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// trackRevisions — transaction-based revision advancement
// ---------------------------------------------------------------------------

describe('trackRevisions: transaction-based revision advancement', () => {
  it('increments revision on docChanged transactions', () => {
    const editor = makeEditor();
    initRevision(editor);
    trackRevisions(editor);

    expect(getRevision(editor)).toBe('0');

    // Simulate a doc-changing transaction
    emitTransaction(editor, true);
    expect(getRevision(editor)).toBe('1');

    emitTransaction(editor, true);
    expect(getRevision(editor)).toBe('2');
  });

  it('does not increment revision on non-docChanged transactions', () => {
    const editor = makeEditor();
    initRevision(editor);
    trackRevisions(editor);

    // Selection-only transaction (no doc change)
    emitTransaction(editor, false);
    expect(getRevision(editor)).toBe('0');
  });

  it('only subscribes once per editor (idempotent)', () => {
    const editor = makeEditor();
    initRevision(editor);

    trackRevisions(editor);
    trackRevisions(editor);
    trackRevisions(editor);

    // Should only have one listener
    const listeners = editor._listeners.get('transaction') ?? [];
    expect(listeners).toHaveLength(1);
  });

  it('tracks direct edits alongside plan-engine mutations', () => {
    const editor = makeEditor();
    initRevision(editor);
    trackRevisions(editor);

    // Simulate: plan-engine mutation dispatches a transaction
    emitTransaction(editor, true);
    expect(getRevision(editor)).toBe('1');

    // Simulate: user types directly (direct edit)
    emitTransaction(editor, true);
    expect(getRevision(editor)).toBe('2');

    // Simulate: collaboration update arrives
    emitTransaction(editor, true);
    expect(getRevision(editor)).toBe('3');

    // Selection-only (no increment)
    emitTransaction(editor, false);
    expect(getRevision(editor)).toBe('3');
  });

  it('does not increment revision for block-identity repair transactions', () => {
    // the runtime identity repair pass dispatches a
    // docChanged transaction tagged with `superdoc/block-identity-repair`.
    // Bumping the revision on that tr would invalidate a caller's
    // `expectedRevision` for a non-content remediation step.
    const editor = makeEditor();
    initRevision(editor);
    trackRevisions(editor);

    expect(getRevision(editor)).toBe('0');

    // Repair tr: docChanged is true (AttrSteps land), but the meta tag is set.
    emitTransaction(editor, true, { 'superdoc/block-identity-repair': { repairedBlockCount: 1 } });
    expect(getRevision(editor)).toBe('0');

    // Subsequent user edit (untagged) still advances normally.
    emitTransaction(editor, true);
    expect(getRevision(editor)).toBe('1');
  });

  it('does not increment for a metadata-only repair transaction (docChanged === false)', () => {
    // Pins the defensive invariant: the meta short-circuit is checked BEFORE
    // the docChanged gate. Today the only repair transactions in flight are
    // doc-changing (so this case is vacuously skipped via the docChanged
    // guard), but a future "metadata-only repair" tr — e.g. one that only
    // rewrites a non-PM-tracked field — must still get the same treatment.
    //
    const editor = makeEditor();
    initRevision(editor);
    trackRevisions(editor);

    expect(getRevision(editor)).toBe('0');

    // Tagged repair tr with docChanged === false.
    emitTransaction(editor, false, { 'superdoc/block-identity-repair': { repairedBlockCount: 0 } });
    expect(getRevision(editor)).toBe('0');

    // And an untagged doc-changing tr still advances.
    emitTransaction(editor, true);
    expect(getRevision(editor)).toBe('1');
  });

  it('makes expectedRevision guards reject stale refs after external edits', () => {
    const editor = makeEditor();
    initRevision(editor);
    trackRevisions(editor);

    // Initial state: revision 0
    expect(getRevision(editor)).toBe('0');

    // External edit happens (e.g., collaboration)
    emitTransaction(editor, true);
    expect(getRevision(editor)).toBe('1');

    // A plan with expectedRevision: '0' should now fail
    try {
      checkRevision(editor, '0');
      throw new Error('expected PlanError');
    } catch (e) {
      expect(e).toBeInstanceOf(PlanError);
      expect((e as PlanError).code).toBe('REVISION_MISMATCH');
    }

    // But expectedRevision: '1' should pass
    expect(() => checkRevision(editor, '1')).not.toThrow();
  });
});
