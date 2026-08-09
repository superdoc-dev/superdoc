/**
 * Consumer typecheck: both shapes `ui.toolbar.groups` accepts.
 *
 * The runtime routes this field by shape — an array is group ordering, an
 * object is group composition — because the two v1 settings it replaces had
 * different shapes and both need somewhere to land. A typed surface that
 * accepted only one of them would reject a config the runtime honors, which is
 * the exact trap the UI config contract exists to remove.
 *
 * These assertions fail if the union is narrowed back to a single shape.
 *
 * Drained obligations (1):
 *   - UIConfig.toolbar.groups:shapes
 */
import type { Config } from 'superdoc';

// Selection: which groups render. The built-in toolbar's layout order is
// fixed, so this is membership rather than a sort.
const _orderingConfig: Config = {
  selector: '#editor',
  ui: { toolbar: { container: '#toolbar', groups: ['left', 'center', 'right'] } },
};

// Composition: what goes in a group.
const _compositionConfig: Config = {
  selector: '#editor',
  ui: { toolbar: { container: '#toolbar', groups: { right: ['bold', 'italic'] } } },
};

void [_orderingConfig, _compositionConfig];
