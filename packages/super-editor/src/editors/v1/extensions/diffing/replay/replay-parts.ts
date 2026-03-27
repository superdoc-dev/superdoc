import { ReplayResult } from './replay-types';
import type { PartsDiff } from '../algorithm/parts-diffing';

type ReplayPartsEditor = {
  commands?: {
    addImageToCollaboration?: (params: { mediaPath: string; fileData: string }) => boolean;
  };
  emit?: (event: string, payload?: unknown) => void;
  options?: {
    mediaFiles?: Record<string, unknown>;
  };
  storage?: {
    image?: {
      media?: Record<string, unknown>;
    };
  };
  converter?: {
    convertedXml?: Record<string, unknown>;
    documentModified?: boolean;
  } | null;
};

/**
 * Placeholder parts replay.
 *
 * This first slice applies coarse upserts/deletes directly into staged
 * XML/media state. It currently assumes the payload contains authoritative
 * snapshots for the affected parts.
 */
export function replayPartsDiff({
  partsDiff,
  editor,
}: {
  partsDiff: PartsDiff | null;
  editor?: ReplayPartsEditor;
}): ReplayResult {
  const result: ReplayResult = {
    applied: 0,
    skipped: 0,
    warnings: [],
  };

  if (!partsDiff) {
    return result;
  }

  if (!editor?.converter?.convertedXml) {
    result.skipped += 1;
    result.warnings.push('Parts replay skipped: editor converter is unavailable.');
    return result;
  }

  editor.options ??= {};
  editor.options.mediaFiles ??= {};
  const optionMediaStore = editor.options.mediaFiles;

  editor.storage ??= {};
  editor.storage.image ??= {};
  editor.storage.image.media ??= {};
  const storageMediaStore = editor.storage.image.media;
  const changedParts: Array<{
    partId: string;
    operation: 'mutate' | 'create' | 'delete';
    changedPaths: string[];
  }> = [];

  for (const [partPath, snapshot] of Object.entries(partsDiff.upserts)) {
    if (snapshot.kind === 'xml') {
      const operation = partPath in editor.converter.convertedXml ? 'mutate' : 'create';
      editor.converter.convertedXml[partPath] = structuredClone(snapshot.content);
      changedParts.push({ partId: partPath, operation, changedPaths: [] });
    } else {
      const operation =
        partPath in optionMediaStore || partPath in storageMediaStore || partPath in editor.converter.convertedXml
          ? 'mutate'
          : 'create';
      const value = structuredClone(snapshot.content);
      optionMediaStore[partPath] = value;
      storageMediaStore[partPath] = structuredClone(value);
      if (partPath.startsWith('word/media/') && typeof value === 'string') {
        editor.commands?.addImageToCollaboration?.({
          mediaPath: partPath,
          fileData: value,
        });
      }
      changedParts.push({ partId: partPath, operation, changedPaths: [] });
    }
    result.applied += 1;
  }

  for (const partPath of partsDiff.deletes) {
    if (partPath in editor.converter.convertedXml) {
      delete editor.converter.convertedXml[partPath];
      changedParts.push({ partId: partPath, operation: 'delete', changedPaths: [] });
      result.applied += 1;
      continue;
    }
    const hadOptionMedia = partPath in optionMediaStore;
    const hadStorageMedia = partPath in storageMediaStore;
    if (hadOptionMedia) {
      delete optionMediaStore[partPath];
    }
    if (hadStorageMedia) {
      delete storageMediaStore[partPath];
    }
    if (hadOptionMedia || hadStorageMedia) {
      changedParts.push({ partId: partPath, operation: 'delete', changedPaths: [] });
      result.applied += 1;
    }
  }

  if (changedParts.length > 0) {
    editor.converter.documentModified = true;
    editor.emit?.('partChanged', { parts: changedParts, source: 'diff-replay' });
  }

  return {
    applied: result.applied,
    skipped: result.skipped,
    warnings: result.warnings,
  };
}
