/**
 * Public CLI V2 collaboration runtime stub.
 *
 * Real V2 collaboration is supplied by an external V2 runtime package, not by
 * `superdoc/public`. This connection point remains so callers receive a
 * deterministic capability error when they request V2 collaboration before
 * that package is available.
 */

import { CliError } from '../errors.js';
import type { CollaborationProfile } from './types';

export type CliV2CollaborationRuntime = never;

export function createCliV2SingleDocCollaborationRuntime(
  _profile: CollaborationProfile,
): CliV2CollaborationRuntime {
  throw new CliError(
    'RUNTIME_V2_UNAVAILABLE',
    'The public CLI does not bundle the V2 collaboration runtime yet. Install and provide a V2 runtime package when one is available.',
    { runtime: 'v2', feature: 'collaboration' },
  );
}
