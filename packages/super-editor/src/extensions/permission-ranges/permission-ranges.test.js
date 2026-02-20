import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { TextSelection } from 'prosemirror-state';

import { Editor } from '@core/index.js';
import { SuperConverter } from '@core/super-converter/SuperConverter.js';
import { getStarterExtensions } from '@extensions/index.js';
import { getMinimalTranslatedLinkedStyles } from '@tests/helpers/helpers.js';

const VIEWING_MODE = 'viewing';

const docWithPermissionRange = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'permStart', attrs: { id: '1', edGrp: 'everyone' } },
        { type: 'text', text: 'Editable section. ' },
        { type: 'permEnd', attrs: { id: '1', edGrp: 'everyone' } },
        { type: 'text', text: 'Locked section.' },
      ],
    },
  ],
};

const docWithBlockPermissionRange = {
  type: 'doc',
  content: [
    { type: 'permStartBlock', attrs: { id: 'block-1', edGrp: 'everyone' } },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Editable block section. ' }],
    },
    { type: 'permEndBlock', attrs: { id: 'block-1', edGrp: 'everyone' } },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Locked block section.' }],
    },
  ],
};

const docWithoutPermissionRange = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'No editable ranges.' }],
    },
  ],
};

const docWithUserSpecificPermission = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'permStart', attrs: { id: '42', ed: 'superdoc.dev\\gabriel' } },
        { type: 'text', text: 'User specific section. ' },
        { type: 'permEnd', attrs: { id: '42', ed: 'superdoc.dev\\gabriel' } },
        { type: 'text', text: 'Locked section.' },
      ],
    },
  ],
};

const findTextPos = (doc, searchText) => {
  let found = null;
  doc.descendants((node, pos) => {
    if (node.isText && typeof node.text === 'string' && node.text.includes(searchText) && found == null) {
      found = pos;
      return false;
    }
    return;
  });
  return found;
};

describe('PermissionRanges extension', () => {
  let editor;
  let originalMatchMedia;
  let debugSpy;

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
    window.matchMedia =
      window.matchMedia ||
      vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    editor?.destroy();
    editor = null;
    if (originalMatchMedia) {
      window.matchMedia = originalMatchMedia;
    } else {
      delete window.matchMedia;
    }
    debugSpy?.mockRestore();
  });

  const createEditor = (content, extraOptions = {}) => {
    const converter = new SuperConverter();
    converter.translatedLinkedStyles = getMinimalTranslatedLinkedStyles();
    converter.translatedNumbering = { abstracts: {}, definitions: {} };

    editor = new Editor({
      extensions: getStarterExtensions(),
      content,
      loadFromSchema: true,
      documentMode: VIEWING_MODE,
      converter,
      ...extraOptions,
    });
    return editor;
  };

  it('keeps viewing mode editable when the document contains an everyone range', () => {
    const instance = createEditor(docWithPermissionRange);
    expect(instance.options.documentMode).toBe(VIEWING_MODE);
    const storedRanges = instance.storage.permissionRanges?.ranges ?? [];
    expect(storedRanges.length).toBeGreaterThan(0);
    expect(instance.isEditable).toBe(true);
  });

  it('keeps viewing mode editable when the document contains a block-level everyone range', () => {
    const instance = createEditor(docWithBlockPermissionRange);
    expect(instance.options.documentMode).toBe(VIEWING_MODE);
    const storedRanges = instance.storage.permissionRanges?.ranges ?? [];
    expect(storedRanges.length).toBeGreaterThan(0);
    expect(instance.isEditable).toBe(true);
  });

  it('keeps viewing mode editable in headless mode when the document contains an everyone range', () => {
    const instance = createEditor(docWithPermissionRange, { isHeadless: true });
    expect(instance.options.isHeadless).toBe(true);
    expect(instance.options.documentMode).toBe(VIEWING_MODE);
    const storedRanges = instance.storage.permissionRanges?.ranges ?? [];
    expect(storedRanges.length).toBeGreaterThan(0);
    expect(instance.storage.permissionRanges?.hasAllowedRanges).toBe(true);
  });

  it('stays read-only when there are no approved ranges', () => {
    const instance = createEditor(docWithoutPermissionRange);
    expect(instance.options.documentMode).toBe(VIEWING_MODE);
    expect(instance.isEditable).toBe(false);
  });

  it('blocks edits outside the permission range but allows edits inside it', () => {
    const instance = createEditor(docWithPermissionRange);
    const initialJson = instance.state.doc.toJSON();

    const lockedPos = findTextPos(instance.state.doc, 'Locked');
    expect(lockedPos).toBeGreaterThan(0);
    instance.view.dispatch(instance.state.tr.setSelection(TextSelection.create(instance.state.doc, lockedPos)));
    const lockedTr = instance.state.tr.insertText('X', lockedPos, lockedPos);
    instance.view.dispatch(lockedTr);
    expect(instance.state.doc.toJSON()).toEqual(initialJson);

    const editablePos = findTextPos(instance.state.doc, 'Editable');
    expect(editablePos).toBeGreaterThan(0);
    instance.view.dispatch(instance.state.tr.setSelection(TextSelection.create(instance.state.doc, editablePos)));
    const allowedTr = instance.state.tr.insertText('Y', editablePos, editablePos);
    instance.view.dispatch(allowedTr);
    expect(instance.state.doc.textBetween(editablePos, editablePos + 2)).toContain('Y');
  });

  it('blocks edits outside the block permission range but allows edits inside it', () => {
    const instance = createEditor(docWithBlockPermissionRange);
    const initialJson = instance.state.doc.toJSON();

    const lockedPos = findTextPos(instance.state.doc, 'Locked block');
    expect(lockedPos).toBeGreaterThan(0);
    instance.view.dispatch(instance.state.tr.setSelection(TextSelection.create(instance.state.doc, lockedPos)));
    const lockedTr = instance.state.tr.insertText('X', lockedPos, lockedPos);
    instance.view.dispatch(lockedTr);
    expect(instance.state.doc.toJSON()).toEqual(initialJson);

    const editablePos = findTextPos(instance.state.doc, 'Editable block');
    expect(editablePos).toBeGreaterThan(0);
    instance.view.dispatch(instance.state.tr.setSelection(TextSelection.create(instance.state.doc, editablePos)));
    const allowedTr = instance.state.tr.insertText('Y', editablePos, editablePos);
    instance.view.dispatch(allowedTr);
    expect(instance.state.doc.textBetween(editablePos, editablePos + 2)).toContain('Y');
  });

  it('reconstructs permEndBlock nodes removed while deleting at the range boundary', () => {
    const instance = createEditor(docWithBlockPermissionRange);
    const editableText = 'Editable block section. ';
    const editablePos = findTextPos(instance.state.doc, editableText);
    expect(editablePos).toBeGreaterThan(0);

    let permEndPos = null;
    let permEndSize = null;
    instance.state.doc.descendants((node, pos) => {
      if (node.type?.name === 'permEndBlock' && node.attrs?.id === 'block-1') {
        permEndPos = pos;
        permEndSize = node.nodeSize;
        return false;
      }
      return;
    });
    expect(permEndPos).toBeGreaterThan(0);
    expect(permEndSize).toBeGreaterThan(0);

    const lastEditableCharPos = editablePos + editableText.length - 1;
    const deleteTr = instance.state.tr.delete(lastEditableCharPos, permEndPos + permEndSize);
    instance.view.dispatch(deleteTr);

    let permEndCount = 0;
    instance.state.doc.descendants((node) => {
      if (node.type?.name === 'permEndBlock' && node.attrs?.id === 'block-1') {
        permEndCount += 1;
      }
      return;
    });

    expect(permEndCount).toBe(1);
  });

  it('reconstructs permEnd nodes removed while deleting at the range boundary', () => {
    const instance = createEditor(docWithPermissionRange);
    const editableText = 'Editable section. ';
    const editablePos = findTextPos(instance.state.doc, editableText);
    expect(editablePos).toBeGreaterThan(0);

    let permEndPos = null;
    let permEndSize = null;
    instance.state.doc.descendants((node, pos) => {
      if (node.type?.name === 'permEnd' && node.attrs?.id === '1') {
        permEndPos = pos;
        permEndSize = node.nodeSize;
        return false;
      }
      return;
    });
    expect(permEndPos).toBeGreaterThan(0);
    expect(permEndSize).toBeGreaterThan(0);

    const lastEditableCharPos = editablePos + editableText.length - 1;
    const deleteTr = instance.state.tr.delete(lastEditableCharPos, permEndPos + permEndSize);
    instance.view.dispatch(deleteTr);

    let permEndCount = 0;
    instance.state.doc.descendants((node) => {
      if (node.type?.name === 'permEnd' && node.attrs?.id === '1') {
        permEndCount += 1;
      }
      return;
    });

    expect(permEndCount).toBe(1);
  });

  it('reconstructs permStart nodes deleted at the range boundary', () => {
    const instance = createEditor(docWithPermissionRange);
    const editablePos = findTextPos(instance.state.doc, 'Editable');
    instance.view.dispatch(instance.state.tr.setSelection(TextSelection.create(instance.state.doc, editablePos)));

    let permStartPos = null;
    let permStartSize = null;
    instance.state.doc.descendants((node, pos) => {
      if (node.type?.name === 'permStart' && node.attrs?.id === '1') {
        permStartPos = pos;
        permStartSize = node.nodeSize;
        return false;
      }
      return;
    });
    expect(permStartPos).toBeGreaterThan(0);
    expect(permStartSize).toBeGreaterThan(0);

    const deleteTr = instance.state.tr.delete(permStartPos, permStartPos + permStartSize + 1);
    instance.view.dispatch(deleteTr);

    let permStartCount = 0;
    instance.state.doc.descendants((node) => {
      if (node.type?.name === 'permStart' && node.attrs?.id === '1') {
        permStartCount += 1;
      }
      return;
    });
    expect(permStartCount).toBe(1);

    const entireText = instance.state.doc.textContent;
    expect(entireText).not.toContain('Editable section. Locked section.');
    expect(entireText).toContain('ditable section. Locked section.');
  });

  it('restores both tags after deleting the entire editable section', () => {
    const instance = createEditor(docWithPermissionRange);
    const editablePos = findTextPos(instance.state.doc, 'Editable');
    instance.view.dispatch(instance.state.tr.setSelection(TextSelection.create(instance.state.doc, editablePos)));
    let permStartPos = null;
    let permEndPos = null;
    let permEndSize = null;
    instance.state.doc.descendants((node, pos) => {
      if (node.type?.name === 'permStart' && node.attrs?.id === '1') {
        permStartPos = pos;
      }
      if (node.type?.name === 'permEnd' && node.attrs?.id === '1') {
        permEndPos = pos;
        permEndSize = node.nodeSize;
      }
      return;
    });

    expect(permStartPos).toBeGreaterThan(0);
    expect(permEndPos).toBeGreaterThan(0);
    const deleteTr = instance.state.tr.delete(permStartPos, permEndPos + permEndSize);
    instance.view.dispatch(deleteTr);

    let startCount = 0;
    let endCount = 0;
    instance.state.doc.descendants((node) => {
      if (node.type?.name === 'permStart' && node.attrs?.id === '1') {
        startCount += 1;
      }
      if (node.type?.name === 'permEnd' && node.attrs?.id === '1') {
        endCount += 1;
      }
      return;
    });

    expect(startCount).toBe(1);
    expect(endCount).toBe(1);
    expect(instance.state.doc.textContent.trim()).toBe('Locked section.');
  });

  it('allows inserting a newline inside the permission range', () => {
    const instance = createEditor(docWithPermissionRange);
    const editablePos = findTextPos(instance.state.doc, 'Editable');
    expect(editablePos).toBeGreaterThan(0);
    const splitPos = editablePos + 'Editable'.length;
    instance.view.dispatch(instance.state.tr.setSelection(TextSelection.create(instance.state.doc, splitPos)));
    const splitTr = instance.state.tr.split(splitPos);
    instance.view.dispatch(splitTr);
    const paragraphCount = instance.state.doc.childCount;
    expect(paragraphCount).toBeGreaterThan(1);
  });

  it('allows inserting a newline at the start of the permission range', () => {
    const instance = createEditor(docWithPermissionRange);
    const editablePos = findTextPos(instance.state.doc, 'Editable');
    expect(editablePos).toBeGreaterThan(0);
    instance.view.dispatch(instance.state.tr.setSelection(TextSelection.create(instance.state.doc, editablePos)));
    const splitTr = instance.state.tr.split(editablePos);
    instance.view.dispatch(splitTr);
    expect(instance.state.doc.childCount).toBeGreaterThan(1);
  });

  it('allows inserting a newline at the end of the permission range', () => {
    const instance = createEditor(docWithPermissionRange);
    const editablePos = findTextPos(instance.state.doc, 'Editable section. ');
    expect(editablePos).toBeGreaterThan(0);
    const splitPos = editablePos + 'Editable section. '.length;
    instance.view.dispatch(instance.state.tr.setSelection(TextSelection.create(instance.state.doc, splitPos)));
    const splitTr = instance.state.tr.split(splitPos);
    instance.view.dispatch(splitTr);
    expect(instance.state.doc.childCount).toBeGreaterThan(1);
  });

  it('allows editing ranges assigned to the current user via w:ed attribute', () => {
    const instance = createEditor(docWithUserSpecificPermission, {
      user: { name: 'Gabriel', email: 'gabriel@superdoc.dev' },
    });
    expect(instance.isEditable).toBe(true);
    expect(instance.storage.permissionRanges?.ranges?.length).toBeGreaterThan(0);
  });

  it('blocks w:ed ranges when the current user does not match', () => {
    const instance = createEditor(docWithUserSpecificPermission, {
      user: { name: 'Viewer', email: 'viewer@example.com' },
    });
    expect(instance.isEditable).toBe(false);
    expect(instance.storage.permissionRanges?.ranges?.length ?? 0).toBe(0);
  });
});
