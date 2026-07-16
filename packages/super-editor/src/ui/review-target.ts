import type { AffectedRef, AffectedRefRemapping, CommentAddress, TrackedChangeAddress } from '@superdoc/document-api';
import { DATA_ATTRS, DOM_CLASS_NAMES } from '@superdoc/dom-contract';
import { BODY_STORY_KEY, buildStoryKey } from '../editors/v1/document-api-adapters/story-runtime/story-key.js';
import {
  findRenderedCommentElements,
  findRenderedTrackedChangeElementsStrict,
} from '../editors/v1/core/presentation-editor/dom/EntityRectFinder.js';
import { COMMENT_THREAD_HIT_SAMPLE_OFFSETS } from '../editors/v1/core/presentation-editor/pointer-events/comment-thread-hit-samples.js';

const ATTR_COMMENT_IDS = 'data-comment-ids';
const ATTR_TRACK_CHANGE_ID = 'data-track-change-id';
const ATTR_STORY_KEY = 'data-story-key';
const ATTR_SDT_ID = 'data-sdt-id';
const ATTR_SDT_TYPE = 'data-sdt-type';
const ATTR_SDT_SCOPE = 'data-sdt-scope';
const ATTR_REVIEW_TARGET_KIND = 'data-review-target-kind';
const ATTR_PLACEHOLDER_ID = 'data-placeholder-id';
const ATTR_PLACEHOLDER_REASON = 'data-placeholder-reason';

const CSS_NEEDS_ESCAPE = /["\\\n\r\t]/g;

export type ReviewTargetDiagnosticCode =
  | 'review-target-unsupported'
  | 'review-target-stale-layout'
  | 'review-target-story-mismatch'
  | 'review-target-ambiguous-overlap';

export type ReviewTargetDiagnostic = {
  code: ReviewTargetDiagnosticCode;
  detail?: string;
};

export type ReviewTargetEntityKind = 'comment' | 'trackedChange' | 'contentControl' | 'placeholder';

export type ReviewTargetHitCandidate = {
  type: ReviewTargetEntityKind;
  id: string;
  layoutEpoch: number;
  storyKey?: string;
  placeholderReason?: string;
  scope?: 'block' | 'inline';
};

export type ReviewTargetPointResult =
  | {
      status: 'resolved';
      candidates: ReviewTargetHitCandidate[];
      target: CommentAddress | TrackedChangeAddress;
      diagnostics?: ReviewTargetDiagnostic[];
    }
  | {
      status: 'no-target' | 'rejected';
      candidates: ReviewTargetHitCandidate[];
      diagnostics?: ReviewTargetDiagnostic[];
    };

export type ResolveReviewTargetAtPointInput = {
  host: Element;
  clientX: number;
  clientY: number;
  currentLayoutEpoch?: number;
};

export type ResolveReviewTargetReverseInput = {
  host: Element;
  target: CommentAddress | TrackedChangeAddress;
  resolveParentCommentId?: (commentId: string) => string | null | undefined;
};

export type ReviewTargetReverseLookupResult =
  | {
      status: 'resolved';
      target: CommentAddress | TrackedChangeAddress;
      elements: HTMLElement[];
      storyKey: string;
    }
  | {
      status: 'rejected';
      target: CommentAddress | TrackedChangeAddress;
      elements: HTMLElement[];
      diagnostics: ReviewTargetDiagnostic[];
    };

export type ReviewTargetReceiptMatch =
  | { kind: 'preserved' }
  | { kind: 'invalidated'; matchedRef: AffectedRef }
  | { kind: 'remapped'; from: AffectedRef; to: CommentAddress | TrackedChangeAddress };

export type MatchReviewTargetAgainstReceiptInput = {
  target: CommentAddress | TrackedChangeAddress;
  invalidatedRefs?: readonly AffectedRef[];
  remappedRefs?: readonly AffectedRefRemapping[];
};

export const REVIEW_TARGET_PAINTED_ATTRS = {
  COMMENT_IDS: ATTR_COMMENT_IDS,
  TRACK_CHANGE_ID: ATTR_TRACK_CHANGE_ID,
  STORY_KEY: ATTR_STORY_KEY,
  LAYOUT_EPOCH: DATA_ATTRS.LAYOUT_EPOCH,
  SDT_ID: ATTR_SDT_ID,
  SDT_TYPE: ATTR_SDT_TYPE,
  SDT_SCOPE: ATTR_SDT_SCOPE,
  REVIEW_TARGET_KIND: ATTR_REVIEW_TARGET_KIND,
  PLACEHOLDER_ID: ATTR_PLACEHOLDER_ID,
  PLACEHOLDER_REASON: ATTR_PLACEHOLDER_REASON,
} as const;

function getAttr(el: Element | null, name: string): string | null {
  if (!el || typeof (el as { getAttribute?: unknown }).getAttribute !== 'function') {
    return null;
  }
  return (el as { getAttribute(attr: string): string | null }).getAttribute(name);
}

function readFiniteEpoch(el: Element | null): number | null {
  const raw = getAttr(el, DATA_ATTRS.LAYOUT_EPOCH);
  if (raw == null) return null;
  const epoch = Number(raw);
  return Number.isFinite(epoch) ? epoch : null;
}

export function readReviewLayoutEpochFromChain(start: Element | null, host?: Element): number | null {
  let current = start;
  let max: number | null = null;
  while (current) {
    const epoch = readFiniteEpoch(current);
    if (epoch != null && (max == null || epoch > max)) {
      max = epoch;
    }
    if (host && current === host) {
      break;
    }
    current = current.parentElement;
  }
  return max;
}

export function readCurrentReviewLayoutEpoch(host: Element): number | null {
  const hostEpoch = readFiniteEpoch(host);
  let max = hostEpoch;

  const pageSelector = `.${DOM_CLASS_NAMES.PAGE}[${DATA_ATTRS.LAYOUT_EPOCH}]`;
  for (const page of Array.from(host.querySelectorAll<HTMLElement>(pageSelector))) {
    const epoch = readFiniteEpoch(page);
    if (epoch != null && (max == null || epoch > max)) {
      max = epoch;
    }
  }

  if (max != null) {
    return max;
  }

  const firstStamped = host.querySelector<HTMLElement>(`[${DATA_ATTRS.LAYOUT_EPOCH}]`);
  return readFiniteEpoch(firstStamped);
}

export function collectReviewTargetCandidatesFromChain(
  start: Element | null,
  host: Element,
): ReviewTargetHitCandidate[] {
  if (!start || (start !== host && !host.contains(start))) {
    return [];
  }

  const layoutEpoch = readReviewLayoutEpochFromChain(start, host) ?? Number.NaN;
  const candidates: ReviewTargetHitCandidate[] = [];
  const seen = new Set<string>();
  let current: Element | null = start;

  while (current) {
    const reviewTargetKind = getAttr(current, ATTR_REVIEW_TARGET_KIND);
    if (reviewTargetKind === 'placeholder') {
      const placeholderId = getAttr(current, ATTR_PLACEHOLDER_ID) ?? '';
      const key = `placeholder:${placeholderId}`;
      if (!seen.has(key)) {
        seen.add(key);
        const candidate: ReviewTargetHitCandidate = {
          type: 'placeholder',
          id: placeholderId,
          layoutEpoch,
        };
        const reason = getAttr(current, ATTR_PLACEHOLDER_REASON);
        if (reason) {
          candidate.placeholderReason = reason;
        }
        candidates.push(candidate);
      }
    }

    const trackChangeId = getAttr(current, ATTR_TRACK_CHANGE_ID);
    if (trackChangeId) {
      const key = `trackedChange:${trackChangeId}`;
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push({
          type: 'trackedChange',
          id: trackChangeId,
          layoutEpoch,
          storyKey: getAttr(current, ATTR_STORY_KEY) ?? BODY_STORY_KEY,
        });
      }
    }

    const commentIds = getAttr(current, ATTR_COMMENT_IDS);
    if (commentIds) {
      for (const raw of commentIds.split(',')) {
        const id = raw.trim();
        if (!id) continue;
        const key = `comment:${id}`;
        if (!seen.has(key)) {
          seen.add(key);
          candidates.push({
            type: 'comment',
            id,
            layoutEpoch,
          });
        }
      }
    }

    const sdtType = getAttr(current, ATTR_SDT_TYPE);
    const sdtId = getAttr(current, ATTR_SDT_ID);
    if (sdtId && sdtType === 'structuredContent') {
      const key = `contentControl:${sdtId}`;
      if (!seen.has(key)) {
        seen.add(key);
        const candidate: ReviewTargetHitCandidate = {
          type: 'contentControl',
          id: sdtId,
          layoutEpoch,
        };
        const scope = getAttr(current, ATTR_SDT_SCOPE);
        if (scope === 'block' || scope === 'inline') {
          candidate.scope = scope;
        }
        candidates.push(candidate);
      }
    }

    if (current === host) {
      break;
    }
    current = current.parentElement;
  }

  return candidates;
}

function safeElementFromPoint(doc: Document, clientX: number, clientY: number): Element | null {
  if (typeof doc.elementFromPoint !== 'function') {
    return null;
  }
  try {
    return doc.elementFromPoint(clientX, clientY);
  } catch {
    return null;
  }
}

function safeElementsFromPoint(doc: Document, clientX: number, clientY: number): Element[] {
  const maybeDoc = doc as Document & { elementsFromPoint?: (x: number, y: number) => Element[] };
  if (typeof maybeDoc.elementsFromPoint !== 'function') {
    return [];
  }
  try {
    return maybeDoc.elementsFromPoint(clientX, clientY) ?? [];
  } catch {
    return [];
  }
}

function resolveSupportedTarget(candidate: ReviewTargetHitCandidate): CommentAddress | TrackedChangeAddress | null {
  if (!candidate.id) {
    return null;
  }
  if (candidate.type === 'comment') {
    return {
      kind: 'entity',
      entityType: 'comment',
      entityId: candidate.id,
    };
  }
  if (candidate.type !== 'trackedChange') {
    return null;
  }
  if (candidate.storyKey != null && candidate.storyKey !== BODY_STORY_KEY) {
    return null;
  }
  return {
    kind: 'entity',
    entityType: 'trackedChange',
    entityId: candidate.id,
    story: { kind: 'story', storyType: 'body' },
  };
}

function decideDirectCandidates(candidates: ReviewTargetHitCandidate[]): ReviewTargetPointResult {
  if (candidates.length === 0) {
    return { status: 'no-target', candidates };
  }

  const placeholders = candidates.filter((candidate) => candidate.type === 'placeholder');
  const supported = candidates.filter(
    (candidate) => candidate.type === 'comment' || candidate.type === 'trackedChange',
  );
  const contentControls = candidates.filter((candidate) => candidate.type === 'contentControl');

  if (placeholders.length > 0 && supported.length === 0) {
    return {
      status: 'rejected',
      candidates,
      diagnostics: placeholders.map((placeholder) => ({
        code: 'review-target-unsupported',
        detail: placeholder.placeholderReason
          ? `placeholder:${placeholder.placeholderReason}`
          : `placeholder:${placeholder.id}`,
      })),
    };
  }

  if (supported.length === 0) {
    if (contentControls.length > 0) {
      return {
        status: 'rejected',
        candidates,
        diagnostics: [{ code: 'review-target-unsupported', detail: 'content-control-only' }],
      };
    }
    return { status: 'no-target', candidates };
  }

  if (supported.length > 1) {
    return {
      status: 'rejected',
      candidates,
      diagnostics: [
        {
          code: 'review-target-ambiguous-overlap',
          detail: supported.map((candidate) => `${candidate.type}:${candidate.id}`).join(','),
        },
      ],
    };
  }

  const winner = supported[0]!;
  const target = resolveSupportedTarget(winner);
  if (!target) {
    return {
      status: 'rejected',
      candidates,
      diagnostics: [
        {
          code: 'review-target-unsupported',
          detail:
            winner.type === 'trackedChange' ? `story:${winner.storyKey ?? 'missing'}` : `missing-id:${winner.type}`,
        },
      ],
    };
  }

  const diagnostics =
    placeholders.length > 0
      ? placeholders.map((placeholder) => ({
          code: 'review-target-unsupported' as const,
          detail: placeholder.placeholderReason
            ? `placeholder-context:${placeholder.placeholderReason}`
            : `placeholder-context:${placeholder.id}`,
        }))
      : undefined;

  return diagnostics
    ? { status: 'resolved', candidates, target, diagnostics }
    : { status: 'resolved', candidates, target };
}

function decideGapCandidates(candidates: ReviewTargetHitCandidate[]): ReviewTargetPointResult {
  const supported = candidates.filter(
    (candidate) => candidate.type === 'comment' || candidate.type === 'trackedChange',
  );
  if (supported.length === 0) {
    return { status: 'no-target', candidates };
  }

  const distinct = new Set(supported.map((candidate) => `${candidate.type}:${candidate.id}`));
  if (distinct.size > 1) {
    return {
      status: 'rejected',
      candidates,
      diagnostics: [
        {
          code: 'review-target-ambiguous-overlap',
          detail: `gap:${Array.from(distinct).join(',')}`,
        },
      ],
    };
  }

  const target = resolveSupportedTarget(supported[0]!);
  if (!target) {
    const winner = supported[0]!;
    return {
      status: 'rejected',
      candidates,
      diagnostics: [
        {
          code: 'review-target-unsupported',
          detail:
            winner.type === 'trackedChange' ? `story:${winner.storyKey ?? 'missing'}` : `missing-id:${winner.type}`,
        },
      ],
    };
  }

  return { status: 'resolved', candidates, target };
}

function checkFreshness(
  host: Element,
  candidates: ReviewTargetHitCandidate[],
  currentLayoutEpoch: number | undefined,
): ReviewTargetDiagnostic | null {
  if (candidates.length === 0) {
    return null;
  }

  const captured = Math.max(...candidates.map((candidate) => candidate.layoutEpoch));
  if (!Number.isFinite(captured)) {
    return { code: 'review-target-unsupported', detail: 'missing-layout-epoch' };
  }

  const current = currentLayoutEpoch ?? readCurrentReviewLayoutEpoch(host);
  if (current == null || !Number.isFinite(current)) {
    return { code: 'review-target-unsupported', detail: 'missing-current-layout-epoch' };
  }

  if (captured !== current) {
    return {
      code: 'review-target-stale-layout',
      detail: `captured=${captured};current=${current}`,
    };
  }

  return null;
}

function collectCandidatesFromElementStack(
  host: Element,
  elements: readonly Element[],
  seen: Set<string> = new Set(),
): ReviewTargetHitCandidate[] {
  const candidates: ReviewTargetHitCandidate[] = [];
  for (const element of elements) {
    if (element !== host && !host.contains(element)) {
      continue;
    }
    for (const candidate of collectReviewTargetCandidatesFromChain(element, host)) {
      const key = candidateDedupeKey(candidate);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      candidates.push(candidate);
    }
  }
  return candidates;
}

function candidateDedupeKey(candidate: ReviewTargetHitCandidate): string {
  return [
    candidate.type,
    candidate.id,
    candidate.storyKey ?? '',
    candidate.scope ?? '',
    candidate.placeholderReason ?? '',
  ].join(':');
}

function collectGapCandidates(
  doc: Document,
  host: Element,
  clientX: number,
  clientY: number,
): ReviewTargetHitCandidate[] {
  const view = doc.defaultView;
  const maxX = view ? Math.max(view.innerWidth - 1, 0) : Number.POSITIVE_INFINITY;
  const maxY = view ? Math.max(view.innerHeight - 1, 0) : Number.POSITIVE_INFINITY;
  const candidates: ReviewTargetHitCandidate[] = [];
  const seen = new Set<string>();

  for (const [offsetX, offsetY] of COMMENT_THREAD_HIT_SAMPLE_OFFSETS) {
    const sampleX = Math.max(0, Math.min(clientX + offsetX, maxX));
    const sampleY = Math.max(0, Math.min(clientY + offsetY, maxY));
    const stack = safeElementsFromPoint(doc, sampleX, sampleY);
    const elements = stack.length > 0 ? stack : [];

    if (elements.length === 0) {
      const fallback = safeElementFromPoint(doc, sampleX, sampleY);
      if (fallback && (fallback === host || host.contains(fallback))) {
        elements.push(fallback);
      }
    }

    candidates.push(...collectCandidatesFromElementStack(host, elements, seen));
  }

  return candidates;
}

export function resolveReviewTargetAtPoint(input: ResolveReviewTargetAtPointInput): ReviewTargetPointResult {
  const doc = input.host.ownerDocument;
  if (!doc) {
    return { status: 'no-target', candidates: [] };
  }

  // Walk the full elementsFromPoint stack (overlapping siblings/cousins that
  // share a z-stack at the same coordinate but do not share a parent chain
  // must surface together so ambiguous-overlap reliably rejects). Fall back
  // to the single elementFromPoint hit when elementsFromPoint is unavailable.
  const stack = safeElementsFromPoint(doc, input.clientX, input.clientY);
  const fallback = stack.length === 0 ? safeElementFromPoint(doc, input.clientX, input.clientY) : null;
  const directElements = stack.length > 0 ? stack : fallback ? [fallback] : [];
  const insideHost = directElements.some((element) => element === input.host || input.host.contains(element));
  const directCandidates = collectCandidatesFromElementStack(input.host, directElements);
  const directDecision = decideDirectCandidates(directCandidates);

  if (directDecision.status !== 'no-target') {
    const freshness = checkFreshness(input.host, directDecision.candidates, input.currentLayoutEpoch);
    if (!freshness) {
      return directDecision;
    }
    return {
      status: 'rejected',
      candidates: directDecision.candidates,
      diagnostics: [freshness],
    };
  }

  if (!insideHost) {
    return { status: 'no-target', candidates: [] };
  }

  const gapCandidates = collectGapCandidates(doc, input.host, input.clientX, input.clientY);
  const gapDecision = decideGapCandidates(gapCandidates);
  if (gapDecision.status === 'no-target') {
    return gapDecision;
  }

  const freshness = checkFreshness(input.host, gapDecision.candidates, input.currentLayoutEpoch);
  if (!freshness) {
    return gapDecision;
  }

  return {
    status: 'rejected',
    candidates: gapDecision.candidates,
    diagnostics: [freshness],
  };
}

function cssEscape(value: string): string {
  const css = (globalThis as { CSS?: { escape?: (input: string) => string } }).CSS;
  if (typeof css?.escape === 'function') {
    return css.escape(value);
  }
  return value.replace(CSS_NEEDS_ESCAPE, (match) => `\\${match}`);
}

export function resolveReviewTargetReverse(input: ResolveReviewTargetReverseInput): ReviewTargetReverseLookupResult {
  if (input.target.entityType === 'comment') {
    const direct = findRenderedCommentElements(input.host as HTMLElement, input.target.entityId, BODY_STORY_KEY);
    if (direct.length > 0) {
      return {
        status: 'resolved',
        target: input.target,
        elements: direct,
        storyKey: BODY_STORY_KEY,
      };
    }

    if (input.resolveParentCommentId) {
      const visited = new Set<string>([input.target.entityId]);
      let current = input.resolveParentCommentId(input.target.entityId);
      while (current && !visited.has(current)) {
        visited.add(current);
        const ancestor = findRenderedCommentElements(input.host as HTMLElement, current, BODY_STORY_KEY);
        if (ancestor.length > 0) {
          return {
            status: 'resolved',
            target: { kind: 'entity', entityType: 'comment', entityId: current },
            elements: ancestor,
            storyKey: BODY_STORY_KEY,
          };
        }
        current = input.resolveParentCommentId(current);
      }
    }

    return {
      status: 'rejected',
      target: input.target,
      elements: [],
      diagnostics: [{ code: 'review-target-unsupported', detail: 'not-mounted' }],
    };
  }

  const storyKey = buildStoryKey(input.target.story ?? { kind: 'story', storyType: 'body' });
  const direct = findRenderedTrackedChangeElementsStrict(
    input.host as HTMLElement,
    input.target.entityId,
    cssEscape,
    storyKey,
  );
  if (direct.length > 0) {
    return {
      status: 'resolved',
      target: input.target,
      elements: direct,
      storyKey,
    };
  }

  return {
    status: 'rejected',
    target: input.target,
    elements: [],
    diagnostics: [{ code: 'review-target-unsupported', detail: 'not-mounted' }],
  };
}

function matchesEntityRef(ref: AffectedRef, target: CommentAddress | TrackedChangeAddress): boolean {
  return ref.kind === 'entity' && ref.entityType === target.entityType && ref.entityId === target.entityId;
}

function coerceReviewTargetRef(ref: AffectedRef): CommentAddress | TrackedChangeAddress | null {
  if (ref.kind !== 'entity') {
    return null;
  }
  if (ref.entityType !== 'comment' && ref.entityType !== 'trackedChange') {
    return null;
  }
  return ref;
}

export function matchReviewTargetAgainstReceipt(input: MatchReviewTargetAgainstReceiptInput): ReviewTargetReceiptMatch {
  for (const ref of input.invalidatedRefs ?? []) {
    if (matchesEntityRef(ref, input.target)) {
      return { kind: 'invalidated', matchedRef: ref };
    }
  }

  for (const remap of input.remappedRefs ?? []) {
    if (!matchesEntityRef(remap.from, input.target)) {
      continue;
    }
    const target = coerceReviewTargetRef(remap.to);
    if (target) {
      return { kind: 'remapped', from: remap.from, to: target };
    }
    return { kind: 'invalidated', matchedRef: remap.from };
  }

  return { kind: 'preserved' };
}
