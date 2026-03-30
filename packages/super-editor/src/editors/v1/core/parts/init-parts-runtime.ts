/**
 * Bootstrap the parts runtime: descriptor registration + revision init.
 *
 * Called from Editor.ts after converter initialization. Safe to call
 * multiple times — both `registerPartDescriptor` and `initRevision`
 * are idempotent.
 */

import type { Editor } from '../Editor.js';
import { registerPartDescriptor } from './registry/part-registry.js';
import { stylesPartDescriptor } from './adapters/styles-part-descriptor.js';
import { settingsPartDescriptor } from './adapters/settings-part-descriptor.js';
import { relsPartDescriptor } from './adapters/rels-part-descriptor.js';
import { numberingPartDescriptor } from './adapters/numbering-part-descriptor.js';
import { contentTypesPartDescriptor } from './adapters/content-types-part-descriptor.js';
import { footnotesPartDescriptor, endnotesPartDescriptor } from './adapters/notes-part-descriptor.js';
import { registerStaticInvalidationHandlers } from './invalidation/invalidation-handlers.js';
import { initRevision, trackRevisions } from '../../document-api-adapters/plan-engine/revision-tracker.js';

export function initPartsRuntime(editor: Editor): void {
  registerPartDescriptor(stylesPartDescriptor);
  registerPartDescriptor(settingsPartDescriptor);
  registerPartDescriptor(relsPartDescriptor);
  registerPartDescriptor(numberingPartDescriptor);
  registerPartDescriptor(contentTypesPartDescriptor);
  registerPartDescriptor(footnotesPartDescriptor);
  registerPartDescriptor(endnotesPartDescriptor);
  registerStaticInvalidationHandlers();
  initRevision(editor);
  trackRevisions(editor);
}
