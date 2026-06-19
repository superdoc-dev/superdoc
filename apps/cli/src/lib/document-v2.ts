/**
 * Public CLI V2 runtime stub.
 *
 * The OSS/public CLI does not bundle the V2 document engine yet. Keep this
 * file as the stable runtime connection point so `--runtime v2` fails with a
 * named error instead of resolving unpublished implementation packages.
 */

import type { CollaborationProfile } from './collaboration';
import type { EditorPassThroughOptions, OpenedRuntimeDocument } from './document.js';
import { CliError } from './errors.js';
import type { CliIO, UserIdentity } from './types.js';

export interface OpenV2DocumentOptions {
  /** User identity recorded as author on the v2 session. */
  user?: UserIdentity;
  /** Editor-level pass-throughs preserved for the future V2 adapter. */
  editorOpenOptions?: EditorPassThroughOptions;
}

function throwV2Unavailable(feature: string): never {
  throw new CliError(
    'RUNTIME_V2_UNAVAILABLE',
    'The public CLI does not bundle the V2 runtime yet. Install and provide a V2 runtime package when one is available.',
    { runtime: 'v2', feature },
  );
}

export async function openV2Document(
  _doc: string | undefined,
  _io: CliIO,
  _options: OpenV2DocumentOptions = {},
): Promise<OpenedRuntimeDocument> {
  throwV2Unavailable('open');
}

export async function openV2CollaborativeDocument(
  _doc: string | undefined,
  _io: CliIO,
  _profile: CollaborationProfile,
  _options: OpenV2DocumentOptions = {},
): Promise<OpenedRuntimeDocument & { bootstrap?: unknown }> {
  throwV2Unavailable('collaborative-open');
}
