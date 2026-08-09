/**
 * The review guard has to read the resolved interaction policy.
 *
 * `interaction.comments.readOnly` exists so an application rendering its own
 * comment interface still honors read-only. But `ui: false` and
 * `ui: { comments: false }` set `modules.comments` to `false`, so a guard that
 * consults only the legacy block finds nothing and permits the mutation —
 * failing open for exactly the consumer the policy was added for.
 */
import { describe, expect, it, vi } from 'vite-plus/test';

import { createSuperDocUI } from './create-super-doc-ui.js';

/**
 * Drive the guard through a route that consults it, and report whether the
 * underlying document operation was reached.
 */
function attemptTrackedChangeDecision(superdoc: unknown): boolean {
  const acceptTrackedChange = vi.fn(() => true);
  const host = superdoc as Record<string, Record<string, unknown>>;
  (host.activeEditor as Record<string, unknown>).doc = {
    trackChanges: { accept: acceptTrackedChange, acceptTrackedChange },
  };
  const ui = createSuperDocUI({ superdoc } as never) as unknown as Record<string, Record<string, unknown>>;
  const route = ui.trackChanges?.accept as ((id: string) => unknown) | undefined;
  route?.('t1');
  return acceptTrackedChange.mock.calls.length > 0;
}

const hostWithPolicy = (readOnly: boolean) => ({
  interactionConfig: { comments: { readOnly, allowResolve: true } },
  // `ui: false` leaves `modules.comments === false`, so the legacy block
  // carries no policy at all.
  config: { modules: { comments: false } },
  activeEditor: { editorVersion: 2, doc: {} },
});

describe('review guard with the built-in comments UI disabled', () => {
  it('does not reach the document operation when readOnly is set', () => {
    expect(attemptTrackedChangeDecision(hostWithPolicy(true))).toBe(false);
  });

  it('reaches it when the policy permits writes', () => {
    expect(attemptTrackedChangeDecision(hostWithPolicy(false))).toBe(true);
  });
});
