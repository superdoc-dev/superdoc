import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import * as listsV2Migrations from '@core/migrations/0.14-listsv2/listsv2migration.js';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';
import * as Y from 'yjs';

describe('Editor list migration guard', () => {
  let migrateSpy;
  let docx;
  let media;
  let mediaFiles;
  let fonts;

  beforeAll(async () => {
    ({ docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests('blank-doc.docx'));
  });

  beforeEach(() => {
    migrateSpy = vi.spyOn(listsV2Migrations, 'migrateListsToV2IfNecessary').mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips list migration for standard DOCX imports', () => {
    const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts });

    try {
      expect(migrateSpy).not.toHaveBeenCalled();
    } finally {
      editor.destroy();
    }
  });

  it('runs list migration when initializing from HTML content', () => {
    const { editor } = initTestEditor({
      content: docx,
      media,
      mediaFiles,
      fonts,
      html: '<ol><li>One</li></ol>',
    });

    try {
      expect(migrateSpy).toHaveBeenCalledTimes(1);
    } finally {
      editor.destroy();
    }
  });

  it('runs list migration when loading from schema JSON', () => {
    const schemaDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Schema content' }],
        },
      ],
    };

    const { editor } = initTestEditor({
      loadFromSchema: true,
      content: schemaDoc,
    });

    try {
      expect(migrateSpy).toHaveBeenCalledTimes(1);
    } finally {
      editor.destroy();
    }
  });

  it('runs list migration once collaboration is ready when collaboration is enabled', () => {
    const ydoc = new Y.Doc();

    const { editor } = initTestEditor({
      content: docx,
      media,
      mediaFiles,
      fonts,
      ydoc,
    });

    try {
      expect(migrateSpy).not.toHaveBeenCalled();

      editor.emit('collaborationReady', { editor, ydoc });

      expect(migrateSpy).toHaveBeenCalledTimes(1);
    } finally {
      editor.destroy();
    }
  });
});
