import { describe, it, expect } from 'vitest';

import { Editor } from '@core/Editor.js';
import { getStarterExtensions } from '@extensions/index.js';
import { getTrackChanges } from '@extensions/track-changes/trackChangesHelpers/getTrackChanges.js';
import { getTestDataAsBuffer } from '@tests/export/export-helpers/export-helpers.js';
import { computeDiff } from './computeDiff';
import { replayDiffs } from './replayDiffs';

/**
 * Loads a DOCX fixture and returns a headless editor instance.
 * @param {string} name DOCX fixture filename.
 * @returns {Promise<import('@core/Editor.js').Editor>}
 */
const getEditorFromFixture = async (name) => {
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
  });
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
  if (diff.oldText !== diff.newText || diff.attrsDiff) {
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
    const initialDiffs = computeDiff(beforeEditor.state.doc, afterEditor.state.doc, beforeEditor.schema).docDiffs;
    const originalDocJSON = beforeEditor.state.doc.toJSON();
    const diff = beforeEditor.commands.compareDocuments(afterEditor.state.doc, afterEditor.converter?.comments ?? []);
    const { tr } = replayDiffs({
      state: beforeEditor.state,
      diff,
      schema: beforeEditor.schema,
      options: { user: { name: 'Test User', email: 'test@example.com' }, applyTrackedChanges: false },
    });
    beforeEditor.view.dispatch(tr);

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
 * Replays diffs with tracked changes enabled and verifies acceptance matches the updated fixture.
 * @param {string} beforeName DOCX fixture filename for the baseline.
 * @param {string} afterName DOCX fixture filename for the updated doc.
 * @returns {Promise<void>}
 */
const expectTrackedReplayMatchesFixture = async (beforeName, afterName) => {
  const beforeEditor = await getEditorFromFixture(beforeName);
  const afterEditor = await getEditorFromFixture(afterName);

  try {
    const originalDocJSON = beforeEditor.state.doc.toJSON();
    const diff = beforeEditor.commands.compareDocuments(afterEditor.state.doc, afterEditor.converter?.comments ?? []);
    const { tr } = replayDiffs({
      state: beforeEditor.state,
      diff,
      schema: beforeEditor.schema,
      options: { user: { name: 'Test User', email: 'test@example.com' }, applyTrackedChanges: true },
    });
    beforeEditor.view.dispatch(tr);

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
  ['diff_before8.docx', 'diff_after8.docx'],
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
describe('replayDiffs tracked changes', runTrackedReplayDiffsSuite);
describe('investigate replay issues', () => {
  it('investigate diff_before10.docx', async () => {
    const beforeEditor = await getEditorFromFixture('diff_before10.docx');
    const afterEditor = await getEditorFromFixture('diff_after10.docx');

    try {
      const originalDocJSON = beforeEditor.state.doc.toJSON();
      const diff = beforeEditor.commands.compareDocuments(afterEditor.state.doc, afterEditor.converter?.comments ?? []);
      const success = beforeEditor.commands.replayDifferences(diff, {
        user: { user: { name: 'Test User', email: 'test@example.com' }, applyTrackedChanges: true },
      });
      console.log('Replay success:', success);

      expect(beforeEditor.state.doc.toJSON()).not.toEqual(originalDocJSON);
      expect(beforeEditor.state.doc.textContent).toBe(afterEditor.state.doc.textContent);
      console.log(JSON.stringify(beforeEditor.state.doc.toJSON(), null, 2));
      const replayDiffsResult = computeDiff(
        beforeEditor.state.doc,
        afterEditor.state.doc,
        beforeEditor.schema,
      ).docDiffs;
      // expect(replayDiffsResult.every(isAcceptableRemainingDiff)).toBe(true);
    } finally {
      beforeEditor.destroy?.();
      afterEditor.destroy?.();
    }
  });
});
