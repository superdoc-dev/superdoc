import type { Editor } from 'superdoc/super-editor';
import { markContextUpdated, type ContextMetadata, type ContextPaths, writeContextMetadata } from './context';
import { exportToPath, getFileChecksum, type OpenedRuntimeDocument } from './document';
import { CliError } from './errors';
import type { CliIO } from './types';

/**
 * v1-only helper. Collaborative sync depends on the live Yjs editor; v2
 * collaboration is not implemented at this plan close, so v2 sessions never
 * reach this function (they reject at open).
 */
export async function syncCollaborativeSessionSnapshot(
  io: CliIO,
  metadata: ContextMetadata,
  paths: ContextPaths,
  editor: Editor,
): Promise<{
  output: { path: string; byteLength: number };
  updatedMetadata: ContextMetadata;
  changed: boolean;
}> {
  if (metadata.sessionType !== 'collab') {
    throw new CliError('COMMAND_FAILED', 'syncCollaborativeSessionSnapshot called for a non-collaborative session.');
  }

  const beforeChecksum = await getFileChecksum(paths.workingDocPath);
  const output = await exportToPath(editor, paths.workingDocPath, true);
  const afterChecksum = await getFileChecksum(paths.workingDocPath);
  const changed = beforeChecksum !== afterChecksum;

  const updatedMetadata = markContextUpdated(io, metadata, {
    dirty: false,
    revision: changed ? metadata.revision + 1 : metadata.revision,
  });
  await writeContextMetadata(paths, updatedMetadata);

  return {
    output,
    updatedMetadata,
    changed,
  };
}

/**
 * Runtime-neutral entry: accepts an {@link OpenedRuntimeDocument} and routes
 * to the runtime's own export path. This keeps v1 and v2 collaborative
 * sessions aligned at the CLI sync checkpoint seam.
 */
export async function syncCollaborativeSessionSnapshotFromOpened(
  io: CliIO,
  metadata: ContextMetadata,
  paths: ContextPaths,
  opened: OpenedRuntimeDocument,
): Promise<{
  output: { path: string; byteLength: number };
  updatedMetadata: ContextMetadata;
  changed: boolean;
}> {
  if (metadata.sessionType !== 'collab') {
    throw new CliError('COMMAND_FAILED', 'syncCollaborativeSessionSnapshot called for a non-collaborative session.');
  }

  const beforeChecksum = await getFileChecksum(paths.workingDocPath);
  const output = await opened.exportToPath(paths.workingDocPath, true);
  const afterChecksum = await getFileChecksum(paths.workingDocPath);
  const changed = beforeChecksum !== afterChecksum;

  const updatedMetadata = markContextUpdated(io, metadata, {
    dirty: false,
    revision: changed ? metadata.revision + 1 : metadata.revision,
  });
  await writeContextMetadata(paths, updatedMetadata);

  return {
    output,
    updatedMetadata,
    changed,
  };
}
