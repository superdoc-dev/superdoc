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
 * A later change will make this authoritative for parts reconstruction.
 * For now it remains a validated no-op so the rest of the diff pipeline can
 * adopt the new field safely.
 */
export function replayPartsDiff({
  partsDiff,
  editor,
}: {
  partsDiff: PartsDiff | null;
  editor?: ReplayPartsEditor;
}): ReplayResult {
  void partsDiff;
  void editor;
  return {
    applied: 0,
    skipped: 0,
    warnings: [],
  };
}
