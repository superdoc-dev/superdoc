import { ReplayResult } from './replay-types';
import type { PartsDiff } from '../algorithm/parts-diffing';

type ReplayPartsEditor = {
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

  const optionMediaStore =
    (editor.options ??= {}).mediaFiles ?? ((editor.options.mediaFiles = {}), editor.options.mediaFiles);
  const storageImage = (editor.storage ??= {}).image ?? ((editor.storage.image = {}), editor.storage.image);
  const storageMediaStore = storageImage.media ?? ((storageImage.media = {}), storageImage.media);

  for (const [partPath, snapshot] of Object.entries(partsDiff.upserts)) {
    if (snapshot.kind === 'xml') {
      editor.converter.convertedXml[partPath] = structuredClone(snapshot.content);
    } else {
      const value = structuredClone(snapshot.content);
      optionMediaStore[partPath] = value;
      storageMediaStore[partPath] = structuredClone(value);
    }
    result.applied += 1;
  }

  for (const partPath of partsDiff.deletes) {
    if (partPath in editor.converter.convertedXml) {
      delete editor.converter.convertedXml[partPath];
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
      result.applied += 1;
    }
  }

  return {
    applied: result.applied,
    skipped: result.skipped,
    warnings: result.warnings,
  };
}
