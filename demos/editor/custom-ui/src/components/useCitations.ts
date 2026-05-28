import { useCallback, useEffect, useState } from 'react';
import { useSuperDocContentControls, useSuperDocHost } from 'superdoc/ui/react';
import {
  CITATIONS_NAMESPACE,
  isCitationPayload,
  type CitationInfo,
  type CitationPayload,
  type MetadataDocApi,
  type SelectionTarget,
} from './citations-types';

/**
 * Reach into `editor.doc.metadata` even though the published
 * SuperDocEditorLike `doc?` stub doesn't expose it yet. v1 path
 * because the metadata.* surface lands in SD-3104; the controller
 * type can catch up later.
 */
function readMetadataApi(host: ReturnType<typeof useSuperDocHost>): MetadataDocApi | null {
  if (!host) return null;
  const editor = (host as unknown as { activeEditor?: { doc?: { metadata?: MetadataDocApi } } }).activeEditor;
  return editor?.doc?.metadata ?? null;
}

/** Hydrate a list of citation entries by fetching their payloads. */
function hydrate(
  api: MetadataDocApi,
  query?: { resolvedOnly?: boolean },
): CitationInfo[] {
  const result = api.list({ namespace: CITATIONS_NAMESPACE, ...query });
  const out: CitationInfo[] = [];
  for (const summary of result.items) {
    const info = api.get({ id: summary.id });
    if (!info || !isCitationPayload(info.payload)) continue;
    out.push({
      id: info.id,
      namespace: info.namespace,
      partName: info.partName,
      anchorStatus: summary.anchorStatus,
      payload: info.payload,
    });
  }
  return out;
}

export type UseCitationsResult = {
  /** Resolved citations shown in the primary sidebar list. */
  citations: CitationInfo[];
  /** Citations whose anchor no longer resolves in the document body. */
  orphanCitations: CitationInfo[];
  /** True until SuperDoc is ready. */
  loading: boolean;
  /**
   * Attach a citation to a text-range SelectionTarget. Caller passes the
   * full payload — in the customer-shaped flow this is built by the
   * generation pipeline (mock or real), not by a manual composer.
   */
  attach(target: SelectionTarget, payload: CitationPayload, id?: string): { id: string } | { error: string };
  /** Replace an existing citation's payload (e.g. edit displayText or locator). */
  update(id: string, payload: CitationPayload): { error?: string };
  /** Remove a citation; strips both anchor + payload. */
  remove(id: string): { error?: string };
  /** Resolve a citation id to its current SelectionTarget. */
  resolve(id: string): SelectionTarget | null;
  /** Force a re-list (rarely needed; the contentControls slice usually covers it). */
  refresh(): void;
};

/**
 * One-stop hook for the citation demo. Wraps `editor.doc.metadata.*`
 * and re-lists whenever the content-controls slice changes — that
 * slice fires for every SDT mutation, so attach/remove flow automatic
 * refreshes through it. Adapter mutations also call `refresh()`
 * directly to cover the brief window before the slice tick lands.
 */
export function useCitations(): UseCitationsResult {
  const host = useSuperDocHost();
  // Subscribe to the contentControls slice so any SDT mutation re-runs us.
  const cc = useSuperDocContentControls();
  const [citations, setCitations] = useState<CitationInfo[]>([]);
  const [orphanCitations, setOrphanCitations] = useState<CitationInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    const api = readMetadataApi(host);
    if (!api) return;
    const resolved = hydrate(api, { resolvedOnly: true });
    const all = hydrate(api);
    setCitations(resolved);
    setOrphanCitations(all.filter((c) => c.anchorStatus === 'orphan'));
    setLoading(false);
  }, [host]);

  // Re-run on host availability and on every contentControls slice tick.
  useEffect(() => {
    refresh();
  }, [refresh, cc.items, cc.activeId]);

  const attach = useCallback(
    (target: SelectionTarget, payload: CitationPayload, id?: string): { id: string } | { error: string } => {
      const api = readMetadataApi(host);
      if (!api) return { error: 'Editor not ready.' };
      const result = api.attach({ target, namespace: CITATIONS_NAMESPACE, payload, id });
      if (!result.success) return { error: result.failure.message };
      refresh();
      return { id: result.id };
    },
    [host, refresh],
  );

  const update = useCallback(
    (id: string, payload: CitationPayload) => {
      const api = readMetadataApi(host);
      if (!api) return { error: 'Editor not ready.' };
      const result = api.update({ id, payload });
      if (!result.success) return { error: result.failure.message };
      refresh();
      return {};
    },
    [host, refresh],
  );

  const remove = useCallback(
    (id: string) => {
      const api = readMetadataApi(host);
      if (!api) return { error: 'Editor not ready.' };
      const result = api.remove({ id });
      if (!result.success) return { error: result.failure.message };
      refresh();
      return {};
    },
    [host, refresh],
  );

  const resolve = useCallback(
    (id: string): SelectionTarget | null => {
      const api = readMetadataApi(host);
      if (!api) return null;
      return api.resolve({ id })?.target ?? null;
    },
    [host],
  );

  return { citations, orphanCitations, loading, attach, update, remove, resolve, refresh };
}
