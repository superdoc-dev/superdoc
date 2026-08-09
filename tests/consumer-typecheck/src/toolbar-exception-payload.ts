/**
 * Consumer typecheck: a toolbar diagnostic is reachable without a cast.
 *
 * The built-in toolbar reports a custom entry it could not build through the
 * `exception` channel, and forwards it to the host so a consumer can receive
 * it -- entries are built inside the toolbar constructor, before anything can
 * subscribe to the toolbar itself. That payload carries `itemName` and
 * `originalError`, which `SuperDocExceptionPayload` did not describe, so
 * reading either required an unsafe cast (#1098 review).
 */
import type { Config, SuperDocExceptionPayload, SuperDocExceptionToolbarPayload } from 'superdoc';

// Narrowing by `'itemName' in payload`, the rule the union documents.
const _onException: Config = {
  selector: '#editor',
  onException: (payload: SuperDocExceptionPayload) => {
    if ('itemName' in payload) {
      // Both members are readable here without a cast, which is the point.
      const name: string | null = payload.itemName;
      const original: unknown = payload.originalError;
      const message: string = payload.error.message;
      return [name, original, message];
    }
    // The other variants still narrow the way they always did.
    if ('code' in payload) return payload.code;
    if ('stage' in payload) return payload.stage;
    return undefined;
  },
};

// Reachable by name too, so an application can type its own handler.
const _handler = (payload: SuperDocExceptionToolbarPayload): string | null => payload.itemName;

export { _onException, _handler };
