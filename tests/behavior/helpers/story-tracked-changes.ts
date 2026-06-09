import { expect, type Locator, type Page } from '@playwright/test';
import type { StoryLocator, TrackChangeInfo, TrackChangeType } from '@superdoc/document-api';
import { storyLocatorToKey } from '@superdoc/document-api';
import type { SuperDocFixture } from '../fixtures/superdoc.js';
import { listTrackChanges } from './document-api.js';

type TrackedChangeCommentSnapshot = {
  commentId?: string;
  importedId?: string;
  trackedChange?: boolean;
  trackedChangeText?: string | null;
  trackedChangeType?: string | null;
  trackedChangeDisplayType?: string | null;
  trackedChangeStory?: StoryLocator | null;
  trackedChangeStoryKind?: string | null;
  trackedChangeStoryLabel?: string;
  trackedChangeAnchorKey?: string | null;
  deletedText?: string | null;
  resolvedTime?: number | null;
};

function normalizeTrackedChangeExcerpt(change: TrackChangeInfo): string {
  return String(change.excerpt ?? '').trim();
}

function matchesTrackedChangeCommentType(
  comment: TrackedChangeCommentSnapshot,
  type: TrackChangeType | undefined,
): boolean {
  if (!type) return true;

  const trackedChangeType = comment.trackedChangeType ?? null;
  const trackedChangeDisplayType = comment.trackedChangeDisplayType ?? null;
  if (type === 'insert') {
    return (
      trackedChangeType === 'trackInsert' || trackedChangeType === 'insert' || trackedChangeDisplayType === 'insert'
    );
  }
  if (type === 'delete') {
    return (
      trackedChangeType === 'trackDelete' || trackedChangeType === 'delete' || trackedChangeDisplayType === 'delete'
    );
  }
  if (type === 'replacement') {
    return (
      trackedChangeType === 'replacement' ||
      trackedChangeType === 'both' ||
      trackedChangeDisplayType === 'replacement' ||
      ((trackedChangeType === 'trackInsert' ||
        trackedChangeType === 'insert' ||
        trackedChangeDisplayType === 'insert') &&
        comment.deletedText != null)
    );
  }
  return trackedChangeType === 'trackFormat' || trackedChangeType === 'format' || trackedChangeDisplayType === 'format';
}

function sameStory(left: StoryLocator | null | undefined, right: StoryLocator | null | undefined): boolean {
  if (!left || !right) return false;
  return storyLocatorToKey(left) === storyLocatorToKey(right);
}

function trackedChangeIdMatches(comment: TrackedChangeCommentSnapshot, id: string): boolean {
  const canonicalId = String(id);
  if (comment.commentId != null && String(comment.commentId) === canonicalId) return true;
  if (comment.importedId != null && String(comment.importedId) === canonicalId) return true;
  return comment.trackedChangeAnchorKey?.endsWith(`::${canonicalId}`) === true;
}

export async function getCommentsSnapshot(page: Page): Promise<TrackedChangeCommentSnapshot[]> {
  return page.evaluate(() => {
    const harness = (window as any).behaviorHarness;
    if (typeof harness?.getCommentsSnapshot !== 'function') {
      throw new Error('behaviorHarness.getCommentsSnapshot is unavailable.');
    }

    return harness.getCommentsSnapshot();
  });
}

export async function getEditorCommentPositions(page: Page): Promise<Record<string, any>> {
  return page.evaluate(() => {
    const harness = (window as any).behaviorHarness;
    if (typeof harness?.getEditorCommentPositions !== 'function') {
      throw new Error('behaviorHarness.getEditorCommentPositions is unavailable.');
    }

    return harness.getEditorCommentPositions();
  });
}

export async function getActiveCommentId(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const harness = (window as any).behaviorHarness;
    if (typeof harness?.getActiveCommentId === 'function') {
      return harness.getActiveCommentId();
    }

    const activeComment = (window as any).superdoc?.commentsStore?.activeComment;
    return activeComment == null ? null : String(activeComment);
  });
}

export async function findTrackedChange(
  page: Page,
  input: {
    story: StoryLocator;
    id?: string;
    excerpt?: string;
    type?: TrackChangeType;
  },
): Promise<TrackChangeInfo> {
  const result = await listTrackChanges(page, { in: input.story, ...(input.type ? { type: input.type } : {}) });
  const matched = result.changes.find((change) => {
    if (input.id && change.id !== input.id) return false;
    if (input.excerpt && !normalizeTrackedChangeExcerpt(change).includes(input.excerpt)) return false;
    return true;
  });

  if (!matched) {
    throw new Error(
      `No tracked change found for ${storyLocatorToKey(input.story)} (${input.id ?? input.excerpt ?? input.type ?? 'any'}).`,
    );
  }

  return matched;
}

export async function findTrackedChangeComment(
  page: Page,
  input: {
    story: StoryLocator;
    id?: string;
    excerpt?: string;
    type?: TrackChangeType;
  },
): Promise<TrackedChangeCommentSnapshot> {
  const comments = await getCommentsSnapshot(page);
  const matched = comments.find((comment) => {
    if (comment.trackedChange !== true) return false;
    if (!sameStory(comment.trackedChangeStory ?? null, input.story)) return false;
    if (input.id && !trackedChangeIdMatches(comment, input.id)) return false;
    if (!matchesTrackedChangeCommentType(comment, input.type)) return false;
    if (input.excerpt) {
      const haystack = [comment.trackedChangeText, comment.deletedText].filter(Boolean).join(' ');
      if (!haystack.includes(input.excerpt)) return false;
    }
    return true;
  });

  if (!matched) {
    throw new Error(
      `No tracked-change comment found for ${storyLocatorToKey(input.story)} (${input.id ?? input.excerpt ?? input.type ?? 'any'}).`,
    );
  }

  return matched;
}

export function getTrackedChangeDialogLocator(
  page: Page,
  input: { excerpt?: string | null; activeOnly?: boolean },
): Locator {
  const selector = input.activeOnly ? '.comments-dialog.is-active' : '.comments-dialog';
  if (input.excerpt) {
    return page.locator(selector, { hasText: input.excerpt }).first();
  }

  return page.locator(selector).first();
}

async function setActiveTrackedChangeComment(page: Page, comment: TrackedChangeCommentSnapshot): Promise<string> {
  const preferredId = comment.commentId ?? comment.importedId;
  if (preferredId == null) {
    throw new Error('Tracked-change comment is missing commentId/importedId.');
  }

  const activeId = String(preferredId);
  await page.evaluate((commentId) => {
    const store = (window as any).superdoc?.commentsStore;
    store?.$patch?.({ activeComment: commentId });
  }, activeId);

  await expect.poll(() => getActiveCommentId(page)).toBe(activeId);
  return activeId;
}

export async function activateTrackedChangeDialog(
  superdoc: SuperDocFixture,
  input: {
    story: StoryLocator;
    id?: string;
    excerpt?: string;
    type?: TrackChangeType;
  },
): Promise<{ change: TrackChangeInfo; comment: TrackedChangeCommentSnapshot; dialog: Locator }> {
  const change = await findTrackedChange(superdoc.page, input);
  const comment = await findTrackedChangeComment(superdoc.page, {
    story: input.story,
    ...(input.id ? { id: change.id } : {}),
    ...(input.excerpt ? { excerpt: input.excerpt } : {}),
    ...(input.type ? { type: input.type } : {}),
  });
  await setActiveTrackedChangeComment(superdoc.page, comment);
  const dialog = getTrackedChangeDialogLocator(superdoc.page, {
    excerpt: input.excerpt ?? change.excerpt ?? comment.trackedChangeText ?? comment.deletedText ?? null,
    activeOnly: true,
  });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await dialog.click({ position: { x: 12, y: 12 } });
  await superdoc.waitForStable();
  await expect.poll(() => getActiveCommentId(superdoc.page)).toBe(String(comment.commentId ?? comment.importedId));
  return { change, comment, dialog };
}

export async function acceptTrackedChangeFromSidebar(
  superdoc: SuperDocFixture,
  input: {
    story: StoryLocator;
    id?: string;
    excerpt?: string;
    type?: TrackChangeType;
  },
): Promise<TrackChangeInfo> {
  const { change, dialog } = await activateTrackedChangeDialog(superdoc, input);
  await dialog.locator('.comment-header .overflow-menu__icon').first().click({ force: true });
  await superdoc.waitForStable();
  return change;
}

export async function rejectTrackedChangeFromSidebar(
  superdoc: SuperDocFixture,
  input: {
    story: StoryLocator;
    id?: string;
    excerpt?: string;
    type?: TrackChangeType;
  },
): Promise<TrackChangeInfo> {
  const { change, dialog } = await activateTrackedChangeDialog(superdoc, input);
  await dialog.locator('.comment-header .overflow-menu__icon').nth(1).click({ force: true });
  await superdoc.waitForStable();
  return change;
}

export async function getTrackedChangeAnchorPosition(
  page: Page,
  input: {
    story: StoryLocator;
    id?: string;
    excerpt?: string;
    type?: TrackChangeType;
  },
): Promise<{ key: string; bounds: Record<string, number>; pageIndex: number | null } | null> {
  const comment = await findTrackedChangeComment(page, input);
  const key = comment.trackedChangeAnchorKey ?? comment.commentId ?? comment.importedId;
  if (!key) return null;

  const positions = await getEditorCommentPositions(page);
  const entry = positions[key];
  if (!entry?.bounds) return null;

  return {
    key: String(key),
    bounds: entry.bounds,
    pageIndex: Number.isFinite(entry.pageIndex) ? Number(entry.pageIndex) : null,
  };
}
