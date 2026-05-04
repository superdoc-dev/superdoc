/**
 * Consumer typecheck: SuperDoc.canPerformPermission must accept the wide
 * payloads consumers produce (SD-2867 phase B).
 *
 * The method forwards `comment` and `trackedChange` to `isAllowed()`
 * unchanged, and the editor produces tracked-change objects with `type`,
 * `attrs`, `from`, `to`, `segments`, etc. A typedef that closes the shape
 * to only `{ id, commentId, comment }` rejects valid payloads under
 * strict TS even though the runtime accepts them.
 *
 * This fixture pins the contract: each call below must compile under
 * strict mode. If a future change re-narrows `comment` or `trackedChange`,
 * the line stops compiling and CI fails.
 */
import { SuperDoc } from 'superdoc';

declare const sd: SuperDoc;

// Wide trackedChange payload like the editor's permission helper produces.
sd.canPerformPermission({
  permission: 'edit',
  trackedChange: {
    id: 'tc-1',
    type: 'insert',
    attrs: { color: 'red' },
    from: 0,
    to: 5,
    segments: [],
    comment: { id: 'c-1', body: 'note' },
  },
});

// Wide comment payload (consumer-defined comment shapes).
sd.canPerformPermission({
  permission: 'edit',
  comment: { id: 'c-1', body: 'note', author: { name: 'A' } },
});

// No-args / empty payload — function defaults `= {}` and bails on missing
// permission via `if (!permission) return false`.
sd.canPerformPermission();
sd.canPerformPermission({});

// Common minimal payload.
sd.canPerformPermission({ permission: 'comment' });
