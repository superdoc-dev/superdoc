import type { Editor } from 'superdoc/super-editor';
import { markContextUpdated, type ContextMetadata, type ContextPaths, writeContextMetadata } from './context';
import { exportToPath, getFileChecksum } from './document';
import { CliError } from './errors';
import type { CliIO } from './types';

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
