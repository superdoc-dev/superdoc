import { useCallback, useEffect, useState } from 'react';
import { useSuperDocContentControls, useSuperDocHost } from 'superdoc/ui/react';
import {
  CITATIONS_NAMESPACE,
  isCitationPayload,
  type CitationInfo,
  type CitationPayload,
  type MetadataDocApi,
  type SelectionTarget,
  textTargetToSelectionTarget,
  type TextTarget,
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
function hydrate(api: MetadataDocApi): CitationInfo[] {
  const result = api.list({ namespace: CITATIONS_NAMESPACE });
  const out: CitationInfo[] = [];
  for (const summary of result.items) {
    const info = api.get({ id: summary.id });
    if (!info || !isCitationPayload(info.payload)) continue;
    out.push({ id: info.id, namespace: info.namespace, partName: info.partName, payload: info.payload });
  }
  return out;
}

export type UseCitationsResult = {
  /** Current list. Refreshes when content-controls slice ticks or after each mutation. */
  citations: CitationInfo[];
  /** True until SuperDoc is ready. */
  loading: boolean;
  /** Attach a citation to a text-range SelectionTarget. */
  attach(target: SelectionTarget, payload: Omit<CitationPayload, 'createdAt'>): { id: string } | { error: string };
  /** Attach using the current selection (from the UI controller). */
  attachAtSelection(
    textTarget: TextTarget | null,
    payload: Omit<CitationPayload, 'createdAt'>,
  ): { id: string } | { error: string };
  /** Update an existing citation's payload. */
  update(id: string, payload: Omit<CitationPayload, 'createdAt'> & { createdAt?: string }): { error?: string };
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
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    const api = readMetadataApi(host);
    if (!api) return;
    setCitations(hydrate(api));
    setLoading(false);
  }, [host]);

  // Re-run on host availability and on every contentControls slice
  // tick. ContentControlsSlice exposes `items`, `total`, `activeIds`,
  // `activeId` — keying on `items` (array reference changes on every
  // meaningful slice update per shallow-equality) plus `activeId`
  // gives us SDT-mutation + active-selection coverage. The slice has
  // no `list` field; an earlier draft referenced one and silently
  // resolved to `undefined`, leaving the effect frozen after mount.
  useEffect(() => {
    refresh();
  }, [refresh, cc.items, cc.activeId]);

  const attach = useCallback(
    (target: SelectionTarget, payload: Omit<CitationPayload, 'createdAt'>): { id: string } | { error: string } => {
      const api = readMetadataApi(host);
      if (!api) return { error: 'Editor not ready.' };
      const full: CitationPayload = { ...payload, createdAt: new Date().toISOString() };
      const result = api.attach({ target, namespace: CITATIONS_NAMESPACE, payload: full });
      if (!result.success) return { error: result.failure.message };
      refresh();
      return { id: result.id };
    },
    [host, refresh],
  );

  const attachAtSelection = useCallback(
    (textTarget: TextTarget | null, payload: Omit<CitationPayload, 'createdAt'>) => {
      const target = textTargetToSelectionTarget(textTarget);
      if (!target) {
        return { error: 'Select a non-empty text range inside a single paragraph.' };
      }
      return attach(target, payload);
    },
    [attach],
  );

  const update = useCallback(
    (id: string, payload: Omit<CitationPayload, 'createdAt'> & { createdAt?: string }) => {
      const api = readMetadataApi(host);
      if (!api) return { error: 'Editor not ready.' };
      const existing = citations.find((c) => c.id === id);
      const createdAt = payload.createdAt ?? existing?.payload.createdAt ?? new Date().toISOString();
      const full: CitationPayload = { ...payload, createdAt };
      const result = api.update({ id, payload: full });
      if (!result.success) return { error: result.failure.message };
      refresh();
      return {};
    },
    [host, citations, refresh],
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

  return { citations, loading, attach, attachAtSelection, update, remove, resolve, refresh };
}
