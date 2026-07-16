import { describe, it, expect, vi } from 'vitest';

import { Editor } from '@core/Editor.js';
import { BLANK_DOCX_BASE64 } from '@core/blank-docx.js';
import { getStarterExtensions } from '@extensions/index.js';
import { getTrackChanges } from '@extensions/track-changes/trackChangesHelpers/getTrackChanges.js';
import { getTestDataAsBuffer } from '@tests/export/export-helpers/export-helpers.js';
import DocxZipper from '@core/DocxZipper.js';
import { parseXmlToJson } from '@converter/v2/docxHelper.js';
import { computeDiff } from './computeDiff';

/**
 * Loads a DOCX fixture and returns a headless editor instance.
 * @param {string} name DOCX fixture filename.
 * @param {{ name: string; email: string } | undefined} user Optional user for tracked-change replay.
 * @returns {Promise<import('@core/Editor.js').Editor>}
 */
const getEditorFromFixture = async (name, user = undefined) => {
  const buffer = await getTestDataAsBuffer(`diffing/${name}`);
  const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(buffer, true);

  return new Editor({
    isHeadless: true,
    extensions: getStarterExtensions(),
    documentId: `test-${name}`,
    content: docx,
    mode: 'docx',
    media,
    mediaFiles,
    fonts,
    annotations: true,
    user,
  });
};

/**
 * Collects tracked text grouped by mark id so multi-run changes can be asserted
 * as whole replacement fragments.
 *
 * @param {import('prosemirror-state').EditorState} state
 * @returns {Array<{ type: string; text: string; id: string }>}
 */
const collectTrackedTextChanges = (state) => {
  const grouped = new Map();

  getTrackChanges(state).forEach(({ mark, node }) => {
    const key = `${mark.type.name}:${mark.attrs.id}`;
    const existing = grouped.get(key);

    if (existing) {
      existing.text += node.textContent;
      return;
    }

    grouped.set(key, {
      type: mark.type.name,
      id: mark.attrs.id,
      text: node.textContent,
    });
  });

  return [...grouped.values()];
};

/**
 * Determines whether a remaining diff is an acceptable formatting-only delta.
 * @param {import('./algorithm/generic-diffing.ts').NodeDiff} diff
 * @returns {boolean}
 */
const isAcceptableRemainingDiff = (diff) => {
  if (diff.action !== 'modified' || diff.nodeType !== 'paragraph') {
    return false;
  }
  const attrsDiff = diff.attrsDiff;
  const modifiedAttrs = Object.keys(attrsDiff?.modified ?? {});
  const allowedParagraphMetadataAttrs = new Set(['sdBlockRev', 'textId', 'rsidR']);
  const hasOnlyAllowedParagraphAttrsDiff =
    modifiedAttrs.every((key) => allowedParagraphMetadataAttrs.has(key)) &&
    Object.keys(attrsDiff?.added ?? {}).length === 0 &&
    Object.keys(attrsDiff?.deleted ?? {}).length === 0;
  if (diff.oldText !== diff.newText || (attrsDiff && !hasOnlyAllowedParagraphAttrsDiff)) {
    return false;
  }
  return (diff.contentDiff || []).every((change) => {
    if (change.kind === 'inlineNode') {
      return (
        ['added', 'deleted'].includes(change.action) &&
        ['tab', 'image', 'commentRangeStart', 'commentRangeEnd'].includes(change.nodeType)
      );
    }
    return (
      change.action === 'modified' &&
      change.kind === 'text' &&
      change.oldText === change.newText &&
      (change.runAttrsDiff || change.marksDiff)
    );
  });
};

/**
 * Replays diffs between two DOCX fixtures and asserts the content matches.
 * @param {string} beforeName DOCX fixture filename for the baseline.
 * @param {string} afterName DOCX fixture filename for the updated doc.
 * @returns {Promise<void>}
 */
const expectReplayMatchesFixture = async (beforeName, afterName) => {
  const beforeEditor = await getEditorFromFixture(beforeName);
  const afterEditor = await getEditorFromFixture(afterName);

  try {
    const originalDocJSON = beforeEditor.state.doc.toJSON();
    const diff = beforeEditor.commands.compareDocuments(afterEditor);
    const success = beforeEditor.commands.replayDifferences(diff, { applyTrackedChanges: false });

    expect(success).toBe(true);
    const replayDiffsResult = computeDiff(beforeEditor.state.doc, afterEditor.state.doc, beforeEditor.schema).docDiffs;
    expect(beforeEditor.state.doc.toJSON()).not.toEqual(originalDocJSON);
    expect(beforeEditor.state.doc.textContent).toBe(afterEditor.state.doc.textContent);
    expect(replayDiffsResult.every(isAcceptableRemainingDiff)).toBe(true);
  } finally {
    beforeEditor.destroy?.();
    afterEditor.destroy?.();
  }
};

/**
 * Replays diffs through the direct compare/replay command path using the
 * compare editor instance so part closures can be captured.
 *
 * @param {string} beforeName DOCX fixture filename for the baseline.
 * @param {string} afterName DOCX fixture filename for the updated doc.
 * @returns {Promise<void>}
 */
const expectDirectReplayPopulatesBodyMedia = async (beforeName, afterName, applyTrackedChanges = false) => {
  const testUser = { name: 'Test User', email: 'test@example.com' };
  const beforeEditor = await getEditorFromFixture(beforeName, applyTrackedChanges ? testUser : undefined);
  const afterEditor = await getEditorFromFixture(afterName);

  try {
    const diff = beforeEditor.commands.compareDocuments(afterEditor);

    const mediaUpserts = Object.keys(diff.partsDiff?.upserts ?? {}).filter((path) => path.startsWith('word/media/'));
    expect(mediaUpserts.length).toBeGreaterThan(0);

    const success = beforeEditor.commands.replayDifferences(diff, { applyTrackedChanges });
    expect(success).toBe(true);

    for (const path of mediaUpserts) {
      expect(beforeEditor.storage.image.media?.[path]).toBeDefined();
    }
  } finally {
    beforeEditor.destroy?.();
    afterEditor.destroy?.();
  }
};

/**
 * Replays diffs with applyTrackedChanges disabled while track changes mode is active,
 * asserting replay does not create tracked marks.
 *
 * @param {string} beforeName DOCX fixture filename for the baseline.
 * @param {string} afterName DOCX fixture filename for the updated doc.
 * @returns {Promise<void>}
 */
const expectReplaySkipsTrackingWhenDisabled = async (beforeName, afterName) => {
  const testUser = { name: 'Test User', email: 'test@example.com' };
  const beforeEditor = await getEditorFromFixture(beforeName, testUser);
  const afterEditor = await getEditorFromFixture(afterName);

  try {
    expect(beforeEditor.commands.enableTrackChanges()).toBe(true);

    const diff = beforeEditor.commands.compareDocuments(afterEditor);
    const success = beforeEditor.commands.replayDifferences(diff, { applyTrackedChanges: false });

    expect(success).toBe(true);
    expect(getTrackChanges(beforeEditor.state)).toHaveLength(0);
    expect(beforeEditor.state.doc.textContent).toBe(afterEditor.state.doc.textContent);
  } finally {
    beforeEditor.destroy?.();
    afterEditor.destroy?.();
  }
};

/**
 * Replays diffs without providing replay options and asserts it does not throw.
 *
 * @param {string} beforeName DOCX fixture filename for the baseline.
 * @param {string} afterName DOCX fixture filename for the updated doc.
 * @returns {Promise<void>}
 */
const expectReplayMatchesFixtureWithDefaultOptions = async (beforeName, afterName) => {
  const beforeEditor = await getEditorFromFixture(beforeName);
  const afterEditor = await getEditorFromFixture(afterName);

  try {
    const diff = beforeEditor.commands.compareDocuments(afterEditor);
    const success = beforeEditor.commands.replayDifferences(diff);

    expect(success).toBe(true);
    expect(beforeEditor.state.doc.textContent).toBe(afterEditor.state.doc.textContent);
  } finally {
    beforeEditor.destroy?.();
    afterEditor.destroy?.();
  }
};

/**
 * Ensures `editor.can().replayDifferences(...)` is side-effect free.
 *
 * @param {string} beforeName DOCX fixture filename for the baseline.
 * @param {string} afterName DOCX fixture filename for the updated doc.
 * @returns {Promise<void>}
 */
const expectReplayCanHasNoSideEffects = async (beforeName, afterName) => {
  const beforeEditor = await getEditorFromFixture(beforeName);
  const afterEditor = await getEditorFromFixture(afterName);

  try {
    const originalDocJSON = beforeEditor.state.doc.toJSON();
    const originalCommentsJSON = JSON.parse(JSON.stringify(beforeEditor.converter?.comments ?? []));
    const emitSpy = vi.spyOn(beforeEditor, 'emit');

    const diff = beforeEditor.commands.compareDocuments(afterEditor);
    const canReplay = beforeEditor.can().replayDifferences(diff);

    expect(canReplay).toBe(true);
    expect(beforeEditor.state.doc.toJSON()).toEqual(originalDocJSON);
    expect(beforeEditor.converter?.comments ?? []).toEqual(originalCommentsJSON);
    expect(emitSpy).not.toHaveBeenCalledWith('commentsUpdate', { type: 'replayCompleted' });
  } finally {
    beforeEditor.destroy?.();
    afterEditor.destroy?.();
  }
};

/**
 * Replays diffs with tracked changes enabled and verifies acceptance matches the updated fixture.
 * @param {string} beforeName DOCX fixture filename for the baseline.
 * @param {string} afterName DOCX fixture filename for the updated doc.
 * @returns {Promise<void>}
 */
const expectTrackedReplayMatchesFixture = async (beforeName, afterName) => {
  const testUser = { name: 'Test User', email: 'test@example.com' };
  const beforeEditor = await getEditorFromFixture(beforeName, testUser);
  const afterEditor = await getEditorFromFixture(afterName);

  try {
    const originalDocJSON = beforeEditor.state.doc.toJSON();
    const diff = beforeEditor.commands.compareDocuments(afterEditor);
    const success = beforeEditor.commands.replayDifferences(diff, { applyTrackedChanges: true });

    expect(success).toBe(true);
    expect(beforeEditor.state.doc.toJSON()).not.toEqual(originalDocJSON);
    expect(getTrackChanges(beforeEditor.state).length).toBeGreaterThan(0);
    expect(beforeEditor.commands.acceptAllTrackedChanges()).toBe(true);
    expect(getTrackChanges(beforeEditor.state).length).toBe(0);

    const replayDiffsResult = computeDiff(beforeEditor.state.doc, afterEditor.state.doc, beforeEditor.schema).docDiffs;
    expect(beforeEditor.state.doc.textContent).toBe(afterEditor.state.doc.textContent);
    expect(replayDiffsResult.every(isAcceptableRemainingDiff)).toBe(true);
  } finally {
    beforeEditor.destroy?.();
    afterEditor.destroy?.();
  }
};

/**
 * Replays a fixture pair with tracked changes enabled and asserts tracked marks keep stable ids.
 *
 * This guards comment-thread creation for tracked changes: comments are keyed by tracked mark id,
 * so replayed marks with empty ids become invisible in the UI.
 *
 * @param {string} beforeName DOCX fixture filename for the baseline.
 * @param {string} afterName DOCX fixture filename for the updated doc.
 * @returns {Promise<void>}
 */
const expectTrackedReplayMarksHaveIds = async (beforeName, afterName) => {
  const testUser = { name: 'Test User', email: 'test@example.com' };
  const beforeEditor = await getEditorFromFixture(beforeName, testUser);
  const afterEditor = await getEditorFromFixture(afterName);

  try {
    const diff = beforeEditor.commands.compareDocuments(afterEditor);
    const success = beforeEditor.commands.replayDifferences(diff, { applyTrackedChanges: true });

    expect(success).toBe(true);

    const trackedChanges = getTrackChanges(beforeEditor.state);
    expect(trackedChanges.length).toBeGreaterThan(0);
    expect(
      trackedChanges.every(({ mark }) => typeof mark?.attrs?.id === 'string' && mark.attrs.id.trim().length > 0),
    ).toBe(true);

    const deletionChanges = trackedChanges.filter(({ mark }) => mark?.type?.name === 'trackDelete');
    expect(deletionChanges.length).toBeGreaterThan(0);
    expect(deletionChanges.every(({ mark }) => mark.attrs.id.trim().length > 0)).toBe(true);
  } finally {
    beforeEditor.destroy?.();
    afterEditor.destroy?.();
  }
};

/**
 * Reads the first table style id found in a document.
 *
 * @param {import('prosemirror-model').Node} doc
 * @returns {string | null}
 */
const getFirstTableStyleId = (doc) => {
  let tableStyleId = null;
  doc.descendants((node) => {
    if (node.type.name !== 'table') {
      return true;
    }
    tableStyleId = node.attrs?.tableStyleId ?? null;
    return false;
  });
  return tableStyleId;
};

/**
 * Reads normalized table row properties from the first table in document order.
 *
 * @param {import('prosemirror-model').Node} doc
 * @returns {Array<Record<string, unknown> | null>}
 */
const getFirstTableRowProperties = (doc) => {
  const rows = [];
  let collectedFromFirstTable = false;

  doc.descendants((node) => {
    if (node.type.name === 'table') {
      if (collectedFromFirstTable) {
        return false;
      }
      collectedFromFirstTable = true;
      return true;
    }
    if (collectedFromFirstTable && node.type.name === 'tableRow') {
      rows.push(node.attrs?.tableRowProperties ?? null);
    }
    return true;
  });

  return rows;
};

/**
 * Replays fixture diffs and asserts first-table style fidelity.
 *
 * @param {string} beforeName DOCX fixture filename for the baseline.
 * @param {string} afterName DOCX fixture filename for the updated doc.
 * @param {boolean} applyTrackedChanges Whether replay should run in tracked mode.
 * @returns {Promise<void>}
 */
const expectReplayPreservesTableStyle = async (beforeName, afterName, applyTrackedChanges) => {
  const testUser = { name: 'Test User', email: 'test@example.com' };
  const beforeEditor = await getEditorFromFixture(beforeName, applyTrackedChanges ? testUser : undefined);
  const afterEditor = await getEditorFromFixture(afterName);

  try {
    const diff = beforeEditor.commands.compareDocuments(afterEditor);
    const success = beforeEditor.commands.replayDifferences(diff, { applyTrackedChanges });

    expect(success).toBe(true);
    if (applyTrackedChanges) {
      expect(beforeEditor.commands.acceptAllTrackedChanges()).toBe(true);
    }

    expect(getFirstTableStyleId(beforeEditor.state.doc)).toBe(getFirstTableStyleId(afterEditor.state.doc));
    expect(getFirstTableRowProperties(beforeEditor.state.doc)).toEqual(
      getFirstTableRowProperties(afterEditor.state.doc),
    );

    const remainingTableStyleDiffs = computeDiff(
      beforeEditor.state.doc,
      afterEditor.state.doc,
      beforeEditor.schema,
    ).docDiffs.filter(
      (entry) =>
        entry.nodeType === 'table' && entry.action === 'modified' && Boolean(entry.attrsDiff?.modified?.tableStyleId),
    );
    expect(remainingTableStyleDiffs).toHaveLength(0);
    const remainingTableRowPropertyDiffs = computeDiff(
      beforeEditor.state.doc,
      afterEditor.state.doc,
      beforeEditor.schema,
    ).docDiffs.filter(
      (entry) =>
        entry.nodeType === 'tableRow' &&
        entry.action === 'modified' &&
        Object.keys(entry.attrsDiff?.added ?? {}).some((key) => key.startsWith('tableRowProperties.')),
    );
    expect(remainingTableRowPropertyDiffs).toHaveLength(0);
  } finally {
    beforeEditor.destroy?.();
    afterEditor.destroy?.();
  }
};

/**
 * Fixture pairs used for replay coverage.
 * @returns {Array<[string, string]>}
 */
const getReplayFixturePairs = () => [
  ['diff_before.docx', 'diff_after.docx'],
  ['diff_before2.docx', 'diff_after2.docx'],
  ['diff_before3.docx', 'diff_after3.docx'],
  ['diff_before4.docx', 'diff_after4.docx'],
  ['diff_before5.docx', 'diff_after5.docx'],
  ['diff_before6.docx', 'diff_after6.docx'],
  ['diff_before7.docx', 'diff_after7.docx'],
  ['diff_before8.docx', 'diff_after8.docx'],
  ['diff_before9.docx', 'diff_after9.docx'],
  // IT-1065: combined structural (table removal) + text change. Google Docs
  // renumbers paraIds across the structural change, so cell paragraphs in
  // before share paraIds with body paragraphs in after. Depth-gated identity
  // prevents false matches.
  ['diff_before_it1065.docx', 'diff_after_it1065.docx'],
];

/**
 * Fixture pairs used for replay coverage with tracked changes enabled.
 * Limited to fixtures compatible with trackedTransaction's structure constraints.
 * @returns {Array<[string, string]>}
 */
const getTrackedReplayFixturePairs = () => [
  ['diff_before3.docx', 'diff_after3.docx'],
  ['diff_before4.docx', 'diff_after4.docx'],
  ['diff_before5.docx', 'diff_after5.docx'],
  ['diff_before6.docx', 'diff_after6.docx'],
  ['diff_before9.docx', 'diff_after9.docx'],
];

/**
 * Runs the replayDiffs fixture suite.
 * @returns {void}
 */
const runReplayDiffsSuite = () => {
  getReplayFixturePairs().forEach(([beforeName, afterName]) => {
    it(`replays diffs for ${beforeName}`, async () => {
      await expectReplayMatchesFixture(beforeName, afterName);
    });
  });
};

/**
 * Runs the replayDiffs tracked changes fixture suite.
 * @returns {void}
 */
const runTrackedReplayDiffsSuite = () => {
  getTrackedReplayFixturePairs().forEach(([beforeName, afterName]) => {
    it(`replays diffs with tracked changes for ${beforeName}`, async () => {
      await expectTrackedReplayMatchesFixture(beforeName, afterName);
    });
  });
};

describe('replayDiffs', runReplayDiffsSuite);
describe('replayDifferences options', () => {
  it('accepts omitted options object', async () => {
    await expectReplayMatchesFixtureWithDefaultOptions('diff_before.docx', 'diff_after.docx');
  });

  it('does not create tracked marks when applyTrackedChanges is false and track changes is active', async () => {
    await expectReplaySkipsTrackingWhenDisabled('diff_before3.docx', 'diff_after3.docx');
  });
});
describe('compareDocuments', () => {
  it('derives comments from the target editor without dispatch side effects', async () => {
    const beforeEditor = await getEditorFromFixture('diff_before8.docx');
    const afterEditor = await getEditorFromFixture('diff_after8.docx');

    try {
      const emitSpy = vi.spyOn(beforeEditor, 'emit');
      const diff = beforeEditor.commands.compareDocuments(afterEditor);
      expect(diff.commentDiffs.length).toBeGreaterThan(0);
      expect(emitSpy).not.toHaveBeenCalledWith('transaction', expect.anything());
    } finally {
      beforeEditor.destroy?.();
      afterEditor.destroy?.();
    }
  });
});
describe('replayDifferences can()', () => {
  it('does not replay or emit when evaluated through can()', async () => {
    await expectReplayCanHasNoSideEffects('diff_before8.docx', 'diff_after8.docx');
  });
});
describe('replayDiffs tracked changes', runTrackedReplayDiffsSuite);
describe('replayDiffs tracked structural replay', () => {
  it('replays the IT-1065 table/text collision fixture with tracked changes enabled', async () => {
    const testUser = { name: 'Test User', email: 'test@example.com' };
    const beforeEditor = await getEditorFromFixture('diff_before_it1065.docx', testUser);
    const afterEditor = await getEditorFromFixture('diff_after_it1065.docx');

    try {
      const diff = beforeEditor.commands.compareDocuments(afterEditor);
      const success = beforeEditor.commands.replayDifferences(diff, { applyTrackedChanges: true });

      expect(success).toBe(true);
      expect(getTrackChanges(beforeEditor.state).length).toBeGreaterThan(0);
      expect(beforeEditor.commands.acceptAllTrackedChanges()).toBe(true);
      expect(beforeEditor.state.doc.textContent).toBe(afterEditor.state.doc.textContent);
    } finally {
      beforeEditor.destroy?.();
      afterEditor.destroy?.();
    }
  });
});
describe('replayDiffs tracked-change ids', () => {
  it('keeps tracked mark ids populated for diff_before8 replay', async () => {
    await expectTrackedReplayMarksHaveIds('diff_before8.docx', 'diff_after8.docx');
  });
});
describe('replayDiffs tracked append regression', () => {
  it('tracks appended text in a simple paragraph diff', async () => {
    const user = { name: 'Test User', email: 'test@example.com' };
    const openBlankDocx = async (text) => {
      const editor = await Editor.open(Buffer.from(BLANK_DOCX_BASE64, 'base64'), {
        isHeadless: true,
        extensions: getStarterExtensions(),
        user,
      });
      editor.dispatch(editor.state.tr.insertText(text, 1));
      return editor;
    };
    const beforeEditor = await openBlankDocx('Section 1. Payment is due within thirty days.');
    const afterEditor = await openBlankDocx(
      'Section 1. Payment is due within thirty days. Renewal requires written approval.',
    );

    try {
      const diff = beforeEditor.commands.compareDocuments(afterEditor);
      const success = beforeEditor.commands.replayDifferences(diff, { applyTrackedChanges: true });

      expect(success).toBe(true);
      expect(beforeEditor.state.doc.textContent).toBe(afterEditor.state.doc.textContent);
      expect(getTrackChanges(beforeEditor.state).length).toBeGreaterThan(0);
    } finally {
      beforeEditor.destroy?.();
      afterEditor.destroy?.();
    }
  });
});
describe('replayDiffs SD-2787', () => {
  it('replays word replacements as tracked delete/insert text changes', async () => {
    const testUser = { name: 'Test User', email: 'test@example.com' };
    const beforeEditor = await getEditorFromFixture('word/sd_2787_source.docx', testUser);
    const afterEditor = await getEditorFromFixture('word/sd_2787_target.docx');

    try {
      const diff = beforeEditor.commands.compareDocuments(afterEditor);
      const success = beforeEditor.commands.replayDifferences(diff, { applyTrackedChanges: true });

      expect(success).toBe(true);

      const trackedTextChanges = collectTrackedTextChanges(beforeEditor.state);
      const deletedTexts = trackedTextChanges.filter(({ type }) => type === 'trackDelete').map(({ text }) => text);
      const insertedTexts = trackedTextChanges.filter(({ type }) => type === 'trackInsert').map(({ text }) => text);

      expect(deletedTexts).toEqual(expect.arrayContaining(['sentence', 'a test', 'some ', 'neighborhood']));
      expect(insertedTexts).toEqual(expect.arrayContaining(['phrase', 'an examination', 'barrio']));

      expect(beforeEditor.commands.acceptAllTrackedChanges()).toBe(true);
      expect(beforeEditor.state.doc.textContent).toBe(afterEditor.state.doc.textContent);
    } finally {
      beforeEditor.destroy?.();
      afterEditor.destroy?.();
    }
  });
});
describe('replayDiffs multi-run word replacements', () => {
  it('tracks the full electronic to electric replacement across split runs', async () => {
    const testUser = { name: 'Test User', email: 'test@example.com' };
    const beforeEditor = await getEditorFromFixture('word/doc_a1.docx', testUser);
    const afterEditor = await getEditorFromFixture('word/doc_b1.docx');

    try {
      const diff = beforeEditor.commands.compareDocuments(afterEditor);
      const success = beforeEditor.commands.replayDifferences(diff, { applyTrackedChanges: true });

      expect(success).toBe(true);

      const trackedTextChanges = collectTrackedTextChanges(beforeEditor.state);
      const deletedTexts = trackedTextChanges.filter(({ type }) => type === 'trackDelete').map(({ text }) => text);
      const insertedTexts = trackedTextChanges.filter(({ type }) => type === 'trackInsert').map(({ text }) => text);

      expect(deletedTexts).toEqual(expect.arrayContaining(['Electronic']));
      expect(insertedTexts).toEqual(expect.arrayContaining(['Electric']));
      expect(deletedTexts).not.toEqual(expect.arrayContaining(['Electron']));

      expect(beforeEditor.commands.acceptAllTrackedChanges()).toBe(true);
      expect(beforeEditor.state.doc.textContent).toBe(afterEditor.state.doc.textContent);
    } finally {
      beforeEditor.destroy?.();
      afterEditor.destroy?.();
    }
  });
});
describe('replayDiffs table style', () => {
  it('replays table style changes when tracked replay is enabled', async () => {
    await expectReplayPreservesTableStyle('diff_before16.docx', 'diff_after16.docx', true);
  });
});
describe('investigate replay issues', () => {
  it('investigate diff_before10.docx', async () => {
    const beforeEditor = await getEditorFromFixture('diff_before10.docx');
    const afterEditor = await getEditorFromFixture('diff_after10.docx');

    try {
      const originalDocJSON = beforeEditor.state.doc.toJSON();
      const diff = beforeEditor.commands.compareDocuments(afterEditor);
      const success = beforeEditor.commands.replayDifferences(diff, {
        user: { user: { name: 'Test User', email: 'test@example.com' }, applyTrackedChanges: true },
      });
      expect(success).toBe(true);
      expect(beforeEditor.state.doc.toJSON()).not.toEqual(originalDocJSON);
      expect(beforeEditor.state.doc.textContent).toBe(afterEditor.state.doc.textContent);
      const replayDiffsResult = computeDiff(
        beforeEditor.state.doc,
        afterEditor.state.doc,
        beforeEditor.schema,
      ).docDiffs;
      expect(replayDiffsResult.every(isAcceptableRemainingDiff)).toBe(true);
    } finally {
      beforeEditor.destroy?.();
      afterEditor.destroy?.();
    }
  });
});

describe('parts-aware replay', () => {
  it('captures partsDiff when comparing against a target editor', async () => {
    const beforeEditor = await getEditorFromFixture('diff_before19.docx');
    const afterEditor = await getEditorFromFixture('diff_after19.docx');

    try {
      const diff = beforeEditor.commands.compareDocuments(afterEditor);

      expect(diff.docDiffs.length).toBeGreaterThan(0);
      expect(diff.partsDiff).not.toBeNull();
    } finally {
      beforeEditor.destroy?.();
      afterEditor.destroy?.();
    }
  });

  it('populates body media when replaying direct diffs with a compare editor', async () => {
    await expectDirectReplayPopulatesBodyMedia('diff_before6.docx', 'diff_after6.docx');
  });

  it('populates body media when replaying tracked direct diffs with a compare editor', async () => {
    await expectDirectReplayPopulatesBodyMedia('diff_before6.docx', 'diff_after6.docx', true);
  });

  it('populates body media when replaying direct diffs for diff_before19/diff_after19', async () => {
    await expectDirectReplayPopulatesBodyMedia('diff_before19.docx', 'diff_after19.docx');
  });

  it('populates body media when replaying tracked direct diffs for diff_before19/diff_after19', async () => {
    await expectDirectReplayPopulatesBodyMedia('diff_before19.docx', 'diff_after19.docx', true);
  });
});

const TARGET_TRACK_NAMES = new Set(['w:ins', 'w:del']);

const collectTrackNodes = (node, tracker) => {
  if (!node || typeof node !== 'object') return;
  if (TARGET_TRACK_NAMES.has(node.name)) tracker[node.name].push(node);
  if (Array.isArray(node.elements)) node.elements.forEach((child) => collectTrackNodes(child, tracker));
};

const getExportedDocBody = async (exportedBuffer) => {
  const zipper = new DocxZipper();
  const files = await zipper.getDocxData(exportedBuffer, true);
  const entry = files.find((f) => f.name === 'word/document.xml');
  expect(entry).toBeDefined();
  const json = parseXmlToJson(entry.content);
  const doc = json.elements?.find((el) => el.name === 'w:document');
  const body = doc?.elements?.find((el) => el.name === 'w:body');
  expect(body).toBeDefined();
  return body;
};

describe('replayDiffs DOCX export roundtrip — SD-3339 (IT-1132 rsid churn)', () => {
  it('produces no tracked changes in DOCX when only run-level rsid attrs differ', async () => {
    const testUser = { name: 'Test User', email: 'test@example.com' };
    const beforeEditor = await getEditorFromFixture('word/it_1132_base.docx', testUser);
    const afterEditor = await getEditorFromFixture('word/it_1132_edited.docx');

    try {
      const diff = beforeEditor.commands.compareDocuments(afterEditor);
      const success = beforeEditor.commands.replayDifferences(diff, { applyTrackedChanges: true });

      expect(success).toBe(true);
      expect(getTrackChanges(beforeEditor.state)).toHaveLength(0);

      const exportedBuffer = await beforeEditor.exportDocx({ isFinalDoc: false });
      const body = await getExportedDocBody(exportedBuffer);
      const tracker = { 'w:ins': [], 'w:del': [] };
      collectTrackNodes(body, tracker);

      expect(tracker['w:ins']).toHaveLength(0);
      expect(tracker['w:del']).toHaveLength(0);
    } finally {
      beforeEditor.destroy?.();
      afterEditor.destroy?.();
    }
  });
});

describe('replayDiffs DOCX export roundtrip — IT-1029 real edits', () => {
  it('produces tracked insert and delete marks in DOCX for real text edits', async () => {
    const testUser = { name: 'Test User', email: 'test@example.com' };
    const beforeEditor = await getEditorFromFixture('word/it_1029_source.docx', testUser);
    const afterEditor = await getEditorFromFixture('word/it_1029_target.docx');

    try {
      const diff = beforeEditor.commands.compareDocuments(afterEditor);
      const success = beforeEditor.commands.replayDifferences(diff, { applyTrackedChanges: true });

      expect(success).toBe(true);
      expect(getTrackChanges(beforeEditor.state).length).toBeGreaterThan(0);

      const exportedBuffer = await beforeEditor.exportDocx({ isFinalDoc: false });
      const body = await getExportedDocBody(exportedBuffer);
      const tracker = { 'w:ins': [], 'w:del': [] };
      collectTrackNodes(body, tracker);

      // The IT-1029 edits are text insertions — expect tracked inserts in the DOCX.
      expect(tracker['w:ins'].length).toBeGreaterThan(0);
    } finally {
      beforeEditor.destroy?.();
      afterEditor.destroy?.();
    }
  });
});

describe('replayDiffs — structuredContent (SDT) boundary leak regression', () => {
  it('sdt_a/sdt_b: replay without tracked changes produces the correct final text content', async () => {
    await expectReplayMatchesFixture('word/sdt_a.docx', 'word/sdt_b.docx');
  });

  it('sdt_a/sdt_b: tracked replay marks the changed SDT paragraph and leaves unchanged text outside the SDT untracked', async () => {
    const testUser = { name: 'Test User', email: 'test@example.com' };
    const beforeEditor = await getEditorFromFixture('word/sdt_a.docx', testUser);
    const afterEditor = await getEditorFromFixture('word/sdt_b.docx');

    try {
      const diff = beforeEditor.commands.compareDocuments(afterEditor);
      const success = beforeEditor.commands.replayDifferences(diff, { applyTrackedChanges: true });

      expect(success).toBe(true);

      const state = beforeEditor.state;

      // Find the paragraph containing "my field 2" SDT: "Linked Master [SDT]".
      // Only the SDT content changed; "Linked Master" text must not carry a track mark.
      let linkedMasterHasTrackMark = false;
      state.doc.descendants((node) => {
        if (!node.isText) return;
        if (node.text !== 'Linked' && node.text !== 'Master') return;
        const hasTrackMark = node.marks.some((m) => m.type.name === 'trackInsert' || m.type.name === 'trackDelete');
        if (hasTrackMark) linkedMasterHasTrackMark = true;
      });

      // Before the SDT boundary leak fix, the pre-fix double-tokenization path
      // caused tracked text marks to appear outside the SDT (e.g. " edit" inserted
      // at a position past the SDT closing boundary). Plain surrounding text that
      // was not part of the edit must remain untracked.
      expect(linkedMasterHasTrackMark).toBe(false);

      // The diff must have produced at least one tracked change (the SDT content changed).
      expect(getTrackChanges(state).length).toBeGreaterThan(0);
    } finally {
      beforeEditor.destroy?.();
      afterEditor.destroy?.();
    }
  });
});
