/**
 * Purpose: Verify generated reference docs and related overview block are up to date.
 * Caller: Focused local/CI check; `check-contract-outputs.ts` is the broader superset.
 * Reads: Contract snapshot + files under `apps/docs/document-api/reference` + overview markers.
 * Writes: None (exit code + console output only).
 * Fails when: Generated reference docs or overview generated block drift from contract.
 */
import {
  buildReferenceDocsArtifacts,
  checkReferenceDocsExtras,
  getReferenceDocsOutputRoot,
} from './lib/reference-docs-artifacts.js';
import { runArtifactCheck, runScript } from './lib/generation-utils.js';

runScript('generated reference docs check', () =>
  runArtifactCheck(
    'generated reference docs',
    buildReferenceDocsArtifacts,
    [getReferenceDocsOutputRoot()],
    checkReferenceDocsExtras,
  ),
);
