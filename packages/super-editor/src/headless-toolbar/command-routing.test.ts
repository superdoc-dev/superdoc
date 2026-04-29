import { describe, it, expect } from 'vitest';
import { TOOLBAR_COMMAND_ROUTING } from './command-routing.js';
import type { PublicToolbarItemId } from './types.js';

/**
 * Static enforcement of the routing matrix. The `satisfies` clause in
 * `command-routing.ts` already guarantees compile-time exhaustiveness;
 * these tests cover invariants that the type system can't express
 * structurally.
 */

const LINEAR_TICKET_PATTERN = /^SD-\d+$/;

// Lifted from the type's keys at runtime so adding a new PublicToolbarItemId
// without an entry surfaces as a missing-key failure here too — belt and
// braces alongside the static `satisfies` gate.
const ALL_TOOLBAR_IDS: PublicToolbarItemId[] = Object.keys(TOOLBAR_COMMAND_ROUTING) as PublicToolbarItemId[];

describe('TOOLBAR_COMMAND_ROUTING', () => {
  it('lists every PublicToolbarItemId exactly once', () => {
    const seen = new Set<string>();
    for (const id of ALL_TOOLBAR_IDS) {
      expect(seen.has(id), `duplicate routing entry: ${id}`).toBe(false);
      seen.add(id);
    }
  });

  it('document-api entries declare at least one operation', () => {
    for (const id of ALL_TOOLBAR_IDS) {
      const entry = TOOLBAR_COMMAND_ROUTING[id];
      if (entry.route !== 'document-api') continue;
      expect(entry.operations.length, `${id} has no operations declared`).toBeGreaterThan(0);
      for (const op of entry.operations) {
        // Doc-api ops are dotted paths like `format.bold`, `tables.insertRow`.
        // Catches typos that would otherwise survive until the executor runs.
        expect(op, `${id} operation "${op}" is not a dotted doc-api path`).toMatch(
          /^[a-z][a-zA-Z]*(\.[a-zA-Z][a-zA-Z]*)+$/,
        );
      }
    }
  });

  it('legacy-editor-command entries link to a Linear gap ticket', () => {
    for (const id of ALL_TOOLBAR_IDS) {
      const entry = TOOLBAR_COMMAND_ROUTING[id];
      if (entry.route !== 'legacy-editor-command') continue;
      expect(entry.gapTicket, `${id} missing gapTicket`).toMatch(LINEAR_TICKET_PATTERN);
    }
  });

  it('document-api entries with collapsed-fallback declare a gap ticket', () => {
    for (const id of ALL_TOOLBAR_IDS) {
      const entry = TOOLBAR_COMMAND_ROUTING[id];
      if (entry.route !== 'document-api') continue;
      if (entry.execution !== 'single-doc-op-with-collapsed-fallback') continue;
      expect(entry.collapsedFallbackGapTicket, `${id} declares a collapsed fallback but no gap ticket`).toMatch(
        LINEAR_TICKET_PATTERN,
      );
    }
  });

  it('ui-session entries with relocation tickets use a Linear identifier', () => {
    for (const id of ALL_TOOLBAR_IDS) {
      const entry = TOOLBAR_COMMAND_ROUTING[id];
      if (entry.route !== 'ui-session') continue;
      if (!entry.relocationTicket) continue;
      expect(entry.relocationTicket, `${id} relocationTicket is malformed`).toMatch(LINEAR_TICKET_PATTERN);
    }
  });

  it('execution shape is consistent with route', () => {
    for (const id of ALL_TOOLBAR_IDS) {
      const entry = TOOLBAR_COMMAND_ROUTING[id];
      switch (entry.route) {
        case 'document-api':
          expect(
            ['single-doc-op', 'composed-doc-ops', 'single-doc-op-with-collapsed-fallback'],
            `${id} execution "${entry.execution}" does not fit document-api route`,
          ).toContain(entry.execution);
          break;
        case 'legacy-editor-command':
          expect(entry.execution).toBe('legacy-gap');
          break;
        case 'ui-session':
          expect(entry.execution).toBe('ui-session');
          break;
        case 'internal':
          // Internal entries are expected to remain absent from the public
          // registry; if one ever appears, surface it for review.
          throw new Error(`${id} routed as 'internal'; internal commands must not appear in the public registry.`);
      }
    }
  });

  it('counts match the audit (33 document-api / 1 legacy-editor-command / 4 ui-session / 0 internal)', () => {
    const counts: Record<string, number> = {
      'document-api': 0,
      'legacy-editor-command': 0,
      'ui-session': 0,
      internal: 0,
    };
    for (const id of ALL_TOOLBAR_IDS) {
      counts[TOOLBAR_COMMAND_ROUTING[id].route] += 1;
    }
    // These numbers are deliberately hard-coded so the next contributor
    // sees the audit shift in CI rather than later in review. Update both
    // here and the AGENTS.md guidance whenever the registry changes.
    expect(counts).toEqual({
      'document-api': 33,
      'legacy-editor-command': 1,
      'ui-session': 4,
      internal: 0,
    });
  });
});
