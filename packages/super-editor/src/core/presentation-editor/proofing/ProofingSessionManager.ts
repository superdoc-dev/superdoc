/**
 * ProofingSessionManager
 *
 * Runtime owner for the proofing lifecycle in PresentationEditor mode.
 * Coordinates provider calls, dirty-segment tracking, result caching,
 * and visible-first scheduling.
 */

import type {
  ProofingConfig,
  ProofingProvider,
  ProofingCapabilities,
  ProofingStatus,
  ProofingCheckRequest,
  ProofingSegment,
  ProofingIssue,
  ProofingError,
  StoredIssue,
  ProofingPaintSlice,
  SegmentOffsetMap,
} from './types.js';
import { ProofingStore } from './proofing-store.js';
import { extractSegmentsWithMaps, type PageResolver } from './segment-extractor.js';
import { resolveIssuePmRangeFromSlices } from './range-map.js';
import { computeDirtySegmentIds } from './dirty-ranges.js';
import { hashSegmentText } from './hash.js';
import { prioritizeByVisibility } from './visibility-priority.js';
import { buildPaintSlices, findSliceAtPosition } from './proofing-ranges.js';
import type { VisibilitySource } from './visibility-source.js';
import type { Node as PmNode } from 'prosemirror-model';

// =============================================================================
// Defaults
// =============================================================================

const DEFAULT_DEBOUNCE_MS = 500;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_CONCURRENT = 2;
const DEFAULT_MAX_SEGMENTS_PER_BATCH = 20;
const DEFAULT_MAX_SUGGESTIONS = 5;

// =============================================================================
// Resolved Config Type
// =============================================================================

type ResolvedProofingConfig = Required<
  Pick<
    ProofingConfig,
    | 'enabled'
    | 'debounceMs'
    | 'maxSuggestions'
    | 'visibleFirst'
    | 'allowAddToDictionary'
    | 'allowIgnoreWord'
    | 'timeoutMs'
    | 'maxConcurrentRequests'
    | 'maxSegmentsPerBatch'
  >
> & {
  defaultLanguage: string | null;
  ignoredWords: string[];
  onProofingError: ((error: ProofingError) => void) | null;
  onStatusChange: ((status: ProofingStatus) => void) | null;
};

// =============================================================================
// Manager
// =============================================================================

export class ProofingSessionManager {
  // -- Config state -----------------------------------------------------------
  #config: ResolvedProofingConfig;

  #provider: ProofingProvider | null = null;
  #capabilities: ProofingCapabilities | null = null;
  #status: ProofingStatus = 'disabled';

  // -- Stores -----------------------------------------------------------------
  #store = new ProofingStore();
  /** Pre-computed offset maps from the latest extraction, keyed by segment ID. */
  #offsetMaps = new Map<string, SegmentOffsetMap>();
  #segmentHashes = new Map<string, string>();

  // -- Scheduling state -------------------------------------------------------
  #debounceTimer: ReturnType<typeof setTimeout> | null = null;
  #pendingAbortControllers = new Set<AbortController>();
  #inFlightCount = 0;
  #documentEpoch = 0;
  #disposed = false;
  /** Segments still waiting to be sent (overflow from concurrency cap). */
  #pendingSegments: ProofingSegment[] = [];

  // -- External adapters ------------------------------------------------------
  #visibilitySource: VisibilitySource | null = null;
  #documentId: string | null = null;
  /** Resolves a PM position to a page index for visible-first scheduling. */
  #pageResolver: PageResolver | null = null;

  /**
   * Called whenever the proofing store changes (new results, cleared, etc.).
   * PresentationEditor hooks this to re-run the decoration pass.
   */
  onResultsChanged: (() => void) | null = null;

  // -- Cached document state --------------------------------------------------
  #lastDoc: PmNode | null = null;
  #lastSegments: ProofingSegment[] = [];

  constructor(config: ProofingConfig = {}) {
    this.#config = {
      enabled: config.enabled ?? false,
      debounceMs: config.debounceMs ?? DEFAULT_DEBOUNCE_MS,
      maxSuggestions: config.maxSuggestions ?? DEFAULT_MAX_SUGGESTIONS,
      visibleFirst: config.visibleFirst ?? true,
      allowAddToDictionary: config.allowAddToDictionary ?? false,
      allowIgnoreWord: config.allowIgnoreWord ?? true,
      defaultLanguage: config.defaultLanguage ?? null,
      ignoredWords: config.ignoredWords ?? [],
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxConcurrentRequests: config.maxConcurrentRequests ?? DEFAULT_MAX_CONCURRENT,
      maxSegmentsPerBatch: config.maxSegmentsPerBatch ?? DEFAULT_MAX_SEGMENTS_PER_BATCH,
      onProofingError: config.onProofingError ?? null,
      onStatusChange: config.onStatusChange ?? null,
    };

    if (config.provider) {
      this.#provider = config.provider;
    }

    if (this.#config.enabled && this.#provider) {
      this.#setStatus('idle');
    }
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  get status(): ProofingStatus {
    return this.#status;
  }

  get isEnabled(): boolean {
    return this.#config.enabled && this.#provider !== null;
  }

  get config(): Readonly<ResolvedProofingConfig> {
    return this.#config;
  }

  setVisibilitySource(source: VisibilitySource | null): void {
    this.#visibilitySource = source;
  }

  setDocumentId(id: string | null): void {
    this.#documentId = id;
  }

  setPageResolver(resolver: PageResolver | null): void {
    this.#pageResolver = resolver;
  }

  /**
   * Returns non-overlapping paint slices for rendering, filtered by suppression
   * (ignored words) and restricted to spelling issues in v1.
   */
  getPaintSlices(): ProofingPaintSlice[] {
    if (!this.isEnabled) return [];
    const displayIssues = this.#store.getDisplayIssues(this.#config.ignoredWords);
    return buildPaintSlices(displayIssues);
  }

  /**
   * Find the proofing issue at a given PM position (for context menu).
   * Returns the primary issue for the paint slice at that position, or null.
   */
  getIssueAtPosition(pmPos: number): StoredIssue | null {
    const slices = this.getPaintSlices();
    return findSliceAtPosition(slices, pmPos)?.issue ?? null;
  }

  // ===========================================================================
  // Config updates
  // ===========================================================================

  /**
   * Apply a partial config update. Follows the invalidation rules from the plan:
   * - provider change → full recheck
   * - defaultLanguage change → full recheck
   * - enabled toggle → clear or full check
   * - ignoredWords change → re-filter only (notify for repaint)
   * - UI flags → no recheck
   */
  updateConfig(patch: Partial<ProofingConfig>, doc?: PmNode): void {
    const prevEnabled = this.#config.enabled;
    const prevProvider = this.#provider;
    const needsRecheck = patch.provider !== undefined || patch.defaultLanguage !== undefined;

    // Apply simple config values
    if (patch.debounceMs !== undefined) this.#config.debounceMs = patch.debounceMs;
    if (patch.maxSuggestions !== undefined) this.#config.maxSuggestions = patch.maxSuggestions;
    if (patch.visibleFirst !== undefined) this.#config.visibleFirst = patch.visibleFirst;
    if (patch.allowAddToDictionary !== undefined) this.#config.allowAddToDictionary = patch.allowAddToDictionary;
    if (patch.allowIgnoreWord !== undefined) this.#config.allowIgnoreWord = patch.allowIgnoreWord;
    if (patch.timeoutMs !== undefined) this.#config.timeoutMs = patch.timeoutMs;
    if (patch.maxConcurrentRequests !== undefined) this.#config.maxConcurrentRequests = patch.maxConcurrentRequests;
    if (patch.maxSegmentsPerBatch !== undefined) this.#config.maxSegmentsPerBatch = patch.maxSegmentsPerBatch;
    if (patch.onProofingError !== undefined) this.#config.onProofingError = patch.onProofingError ?? null;
    if (patch.onStatusChange !== undefined) this.#config.onStatusChange = patch.onStatusChange ?? null;
    if (patch.defaultLanguage !== undefined) this.#config.defaultLanguage = patch.defaultLanguage ?? null;

    // ignoredWords change → re-filter only (notify to repaint with new suppression)
    if (patch.ignoredWords !== undefined) {
      this.#config.ignoredWords = patch.ignoredWords ?? [];
      this.onResultsChanged?.();
    }

    // Provider change: dispose old, register new
    if (patch.provider !== undefined) {
      if (prevProvider && prevProvider !== patch.provider) {
        prevProvider.dispose?.();
      }
      this.#provider = patch.provider ?? null;
      this.#capabilities = null;
    }

    // Enabled toggle
    if (patch.enabled !== undefined) {
      this.#config.enabled = patch.enabled;
      if (!patch.enabled) {
        this.#cancelAll();
        this.#store.clear();
        this.#segmentHashes.clear();
        this.#offsetMaps.clear();
        this.#setStatus('disabled');
        this.onResultsChanged?.(); // Notify so DOM markers get cleared
        return;
      }
      if (patch.enabled && !prevEnabled && doc) {
        this.#setStatus('idle');
        this.#scheduleFullCheck(doc);
        return;
      }
    }

    if (needsRecheck && this.isEnabled && doc) {
      // Cancel in-flight requests from the old provider/language and bump
      // epoch so any stragglers that resolve are discarded as stale.
      this.#cancelAll();
      this.#documentEpoch++;
      this.#store.clear();
      this.#segmentHashes.clear();
      this.onResultsChanged?.(); // Clear stale markers before recheck
      this.#scheduleFullCheck(doc);
    }
  }

  // ===========================================================================
  // Document change handling
  // ===========================================================================

  /**
   * Called after a PM transaction that changes the document.
   * Identifies dirty segments and schedules a debounced recheck.
   */
  onDocumentChanged(doc: PmNode, changedRanges: Array<{ from: number; to: number }>): void {
    if (!this.isEnabled) return;

    this.#documentEpoch++;
    this.#lastDoc = doc;

    const { segments, offsetMaps } = extractSegmentsWithMaps(
      doc,
      this.#config.defaultLanguage,
      this.#pageResolver ?? undefined,
    );
    this.#lastSegments = segments;
    this.#offsetMaps = offsetMaps;

    const dirtyIds = computeDirtySegmentIds(segments, changedRanges);

    // Invalidate hashes for dirty segments so they get rechecked
    for (const id of dirtyIds) {
      this.#segmentHashes.delete(id);
    }

    // Remove stale issues for dirty segments
    this.#store.removeBySegmentIds(dirtyIds);

    this.#scheduleDebouncedCheck(segments);
  }

  /**
   * Trigger a full initial check (e.g., after document load or provider change).
   */
  runInitialCheck(doc: PmNode): void {
    if (!this.isEnabled) return;
    this.#scheduleFullCheck(doc);
  }

  // ===========================================================================
  // Suppression actions
  // ===========================================================================

  /** Add a word to the session ignore list. Re-filters displayed issues. */
  ignoreWord(word: string): void {
    const normalized = word.normalize('NFC').toLowerCase();
    if (!this.#config.ignoredWords.includes(normalized)) {
      this.#config.ignoredWords = [...this.#config.ignoredWords, normalized];
      this.onResultsChanged?.();
    }
  }

  /** Add a word to the dictionary (ignoredWords). Customer can persist externally. */
  addToDictionary(word: string): void {
    this.ignoreWord(word);
  }

  /** Remove a word from the ignored list, re-surfacing any suppressed issues. */
  removeIgnoredWord(word: string): void {
    const normalized = word.normalize('NFC').toLowerCase();
    this.#config.ignoredWords = this.#config.ignoredWords.filter((w) => w !== normalized);
    this.onResultsChanged?.();
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  dispose(): void {
    this.#disposed = true;
    this.#cancelAll();
    this.#store.clear();
    this.#offsetMaps.clear();
    this.#segmentHashes.clear();
    this.#lastDoc = null;
    this.#lastSegments = [];
    this.#pendingSegments = [];
    this.#provider?.dispose?.();
    this.#provider = null;
    this.#setStatus('disabled');
  }

  // ===========================================================================
  // Internal: Scheduling
  // ===========================================================================

  #scheduleFullCheck(doc: PmNode): void {
    this.#lastDoc = doc;
    const { segments, offsetMaps } = extractSegmentsWithMaps(
      doc,
      this.#config.defaultLanguage,
      this.#pageResolver ?? undefined,
    );
    this.#lastSegments = segments;
    this.#offsetMaps = offsetMaps;
    this.#segmentHashes.clear();
    this.#store.clear();
    this.#scheduleDebouncedCheck(segments);
  }

  #scheduleDebouncedCheck(segments: ProofingSegment[]): void {
    if (this.#debounceTimer !== null) {
      clearTimeout(this.#debounceTimer);
    }
    this.#debounceTimer = setTimeout(() => {
      this.#debounceTimer = null;
      this.#runCheck(segments);
    }, this.#config.debounceMs);
  }

  async #runCheck(segments: ProofingSegment[]): Promise<void> {
    if (this.#disposed || !this.#provider) return;

    // Load capabilities on first call
    if (!this.#capabilities && this.#provider.getCapabilities) {
      try {
        this.#capabilities = await this.#provider.getCapabilities();
      } catch {
        // Non-fatal; proceed without capability data
      }
    }

    // Filter to segments that need checking (hash mismatch = changed or new)
    const unchecked = segments.filter((seg) => {
      const hash = hashSegmentText(seg.text);
      const prev = this.#segmentHashes.get(seg.id);
      return prev !== hash;
    });

    if (unchecked.length === 0) {
      this.#setStatus('idle');
      return;
    }

    // Prioritize visible segments first
    const ordered =
      this.#config.visibleFirst && this.#visibilitySource
        ? prioritizeByVisibility(unchecked, this.#visibilitySource)
        : unchecked;

    // Batch and send; overflow goes to #pendingSegments for continuation
    const batches = this.#batchSegments(ordered);
    const epoch = this.#documentEpoch;
    this.#pendingSegments = [];

    for (let i = 0; i < batches.length; i++) {
      if (this.#disposed || epoch !== this.#documentEpoch) return;
      if (this.#inFlightCount >= this.#config.maxConcurrentRequests) {
        // Store remaining batches for continuation after in-flight requests complete
        for (let j = i; j < batches.length; j++) {
          this.#pendingSegments.push(...batches[j]);
        }
        break;
      }
      // Intentionally not awaited — batches run concurrently up to maxConcurrentRequests.
      // Errors are handled inside #sendBatch; continuation via #schedulePendingSegments.
      this.#sendBatch(batches[i], epoch);
    }
  }

  async #sendBatch(segments: ProofingSegment[], epoch: number): Promise<void> {
    if (!this.#provider || this.#disposed) return;

    const controller = new AbortController();
    this.#pendingAbortControllers.add(controller);
    this.#inFlightCount++;
    this.#setStatus('checking');

    // Apply timeout
    const timeoutId = setTimeout(() => controller.abort(), this.#config.timeoutMs);

    const request: ProofingCheckRequest = {
      documentId: this.#documentId,
      defaultLanguage: this.#config.defaultLanguage,
      maxSuggestions: this.#config.maxSuggestions,
      segments,
      signal: controller.signal,
    };

    try {
      const result = await this.#provider.check(request);
      clearTimeout(timeoutId);

      // If this controller was already removed by #cancelAll(), this request
      // is stale — don't touch #inFlightCount or status (already reset to 0).
      if (!this.#pendingAbortControllers.delete(controller)) return;
      this.#inFlightCount--;

      // Discard if epoch changed (stale result)
      if (epoch !== this.#documentEpoch || this.#disposed) return;

      // Validate and store issues using pre-computed offset maps
      const validSegmentIds = new Set(segments.map((s) => s.id));
      const segmentTextMap = new Map(segments.map((s) => [s.id, s]));
      let addedAny = false;

      for (const issue of result.issues) {
        if (!this.#validateIssue(issue, validSegmentIds, segmentTextMap)) continue;

        const offsetMap = this.#offsetMaps.get(issue.segmentId);
        if (!offsetMap) continue;

        const segment = segmentTextMap.get(issue.segmentId);
        const storedIssue = resolveIssuePmRangeFromSlices(issue, offsetMap.slices);
        if (storedIssue) {
          // Derive the actual misspelled word from segment text using offsets
          if (segment) {
            storedIssue.word = segment.text.slice(issue.start, issue.end);
          }
          this.#store.addIssue(storedIssue);
          addedAny = true;
        }
      }

      // Update hashes for successfully checked segments
      for (const seg of segments) {
        this.#segmentHashes.set(seg.id, hashSegmentText(seg.text));
      }

      this.#setStatus(this.#inFlightCount > 0 ? 'checking' : 'idle');

      // Notify PresentationEditor to repaint proofing markers
      if (addedAny) {
        this.onResultsChanged?.();
      }

      // Continue scheduling remaining pending segments
      this.#schedulePendingSegments(epoch);
    } catch (err) {
      clearTimeout(timeoutId);

      // If this controller was already removed by #cancelAll(), this is an
      // intentional cancellation — suppress all side effects silently.
      if (!this.#pendingAbortControllers.delete(controller)) return;
      this.#inFlightCount--;

      if (this.#disposed) return;

      // At this point, abort must be from our timeout timer (not #cancelAll,
      // which is handled by the controller-removal guard above).
      const isTimeout = controller.signal.aborted;
      const proofingError: ProofingError = {
        kind: isTimeout ? 'timeout' : 'provider-error',
        message: isTimeout ? 'Provider request timed out' : String(err),
        segmentIds: segments.map((s) => s.id),
        cause: err,
      };
      this.#config.onProofingError?.(proofingError);
      this.#setStatus(this.#inFlightCount > 0 ? 'checking' : 'degraded');

      // Still try to continue with remaining pending segments
      this.#schedulePendingSegments(epoch);
    }
  }

  /** Send the next batch from #pendingSegments after an in-flight request completes. */
  #schedulePendingSegments(epoch: number): void {
    if (this.#disposed || epoch !== this.#documentEpoch) return;
    if (this.#pendingSegments.length === 0) return;
    if (this.#inFlightCount >= this.#config.maxConcurrentRequests) return;

    const nextBatch = this.#pendingSegments.splice(0, this.#config.maxSegmentsPerBatch);
    if (nextBatch.length > 0) {
      this.#sendBatch(nextBatch, epoch);
    }
  }

  // ===========================================================================
  // Internal: Validation
  // ===========================================================================

  #validateIssue(
    issue: ProofingIssue,
    validSegmentIds: Set<string>,
    segmentTextMap: Map<string, ProofingSegment>,
  ): boolean {
    if (!validSegmentIds.has(issue.segmentId)) {
      this.#reportValidationError(`Unknown segmentId: ${issue.segmentId}`, [issue.segmentId]);
      return false;
    }

    const segment = segmentTextMap.get(issue.segmentId);
    if (!segment) return false;

    if (issue.start < 0 || issue.end <= issue.start || issue.end > segment.text.length) {
      this.#reportValidationError(
        `Invalid offsets [${issue.start}, ${issue.end}) for segment "${issue.segmentId}" (length ${segment.text.length})`,
        [issue.segmentId],
      );
      return false;
    }

    return true;
  }

  #reportValidationError(message: string, segmentIds: string[]): void {
    this.#config.onProofingError?.({
      kind: 'validation-error',
      message,
      segmentIds,
    });
  }

  // ===========================================================================
  // Internal: Helpers
  // ===========================================================================

  #batchSegments(segments: ProofingSegment[]): ProofingSegment[][] {
    const batches: ProofingSegment[][] = [];
    for (let i = 0; i < segments.length; i += this.#config.maxSegmentsPerBatch) {
      batches.push(segments.slice(i, i + this.#config.maxSegmentsPerBatch));
    }
    return batches;
  }

  #cancelAll(): void {
    if (this.#debounceTimer !== null) {
      clearTimeout(this.#debounceTimer);
      this.#debounceTimer = null;
    }
    for (const controller of this.#pendingAbortControllers) {
      controller.abort();
    }
    this.#pendingAbortControllers.clear();
    this.#inFlightCount = 0;
    this.#pendingSegments = [];
  }

  #setStatus(status: ProofingStatus): void {
    if (this.#status !== status) {
      this.#status = status;
      this.#config.onStatusChange?.(status);
    }
  }
}
