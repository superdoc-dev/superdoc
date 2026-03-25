import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import { Slice } from 'prosemirror-model';
import { ySyncPluginKey } from 'y-prosemirror';

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

  /** settings.xml content with enforced readOnly protection. */
  const protectedSettingsXml = {
    type: 'element',
    name: 'w:settings',
    elements: [
      {
        type: 'element',
        name: 'w:documentProtection',
        attributes: { 'w:edit': 'readOnly', 'w:enforcement': '1' },
        elements: [],
      },
    ],
  };

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

  /**
   * Create an editor with enforced read-only protection.
   * Injects a w:documentProtection element into the converter so
   * #initProtectionState() parses it during construction.
   */
  const createProtectedEditor = (content, extraOptions = {}) => {
    const converter = new SuperConverter();
    converter.translatedLinkedStyles = getMinimalTranslatedLinkedStyles();
    converter.translatedNumbering = { abstracts: {}, definitions: {} };
    converter.convertedXml = { 'word/settings.xml': protectedSettingsXml };

    return createEditor(content, { ...extraOptions, converter });
  };

  it('keeps protected viewing mode editable when the document contains an everyone range', () => {
    const instance = createProtectedEditor(docWithPermissionRange);
    expect(instance.options.documentMode).toBe(VIEWING_MODE);
    const storedRanges = instance.storage.permissionRanges?.ranges ?? [];
    expect(storedRanges.length).toBeGreaterThan(0);
    expect(instance.isEditable).toBe(true);
  });

  it('keeps protected viewing mode editable when the document contains a block-level everyone range', () => {
    const instance = createProtectedEditor(docWithBlockPermissionRange);
    expect(instance.options.documentMode).toBe(VIEWING_MODE);
    const storedRanges = instance.storage.permissionRanges?.ranges ?? [];
    expect(storedRanges.length).toBeGreaterThan(0);
    expect(instance.isEditable).toBe(true);
  });

  it('keeps protected viewing mode editable in headless mode when the document contains an everyone range', () => {
    const instance = createProtectedEditor(docWithPermissionRange, { isHeadless: true });
    expect(instance.options.isHeadless).toBe(true);
    expect(instance.options.documentMode).toBe(VIEWING_MODE);
    const storedRanges = instance.storage.permissionRanges?.ranges ?? [];
    expect(storedRanges.length).toBeGreaterThan(0);
    expect(instance.storage.permissionRanges?.hasAllowedRanges).toBe(true);
  });

  it('stays read-only when there are no approved ranges', () => {
    const instance = createProtectedEditor(docWithoutPermissionRange);
    expect(instance.options.documentMode).toBe(VIEWING_MODE);
    expect(instance.isEditable).toBe(false);
  });

  it('permission ranges are inactive when protection is not enforced', () => {
    const instance = createEditor(docWithPermissionRange);
    expect(instance.options.documentMode).toBe(VIEWING_MODE);
    // allRanges should have entries but allowedRanges should be empty
    const allRanges = instance.storage.permissionRanges?.allRanges ?? [];
    expect(allRanges.length).toBeGreaterThan(0);
    expect(instance.storage.permissionRanges?.hasAllowedRanges).toBe(false);
    expect(instance.isEditable).toBe(false);
  });

  it('blocks edits outside the permission range but allows edits inside it', () => {
    const instance = createProtectedEditor(docWithPermissionRange);
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

  it('allows remote collaboration replacements that span permission ranges', () => {
    const instance = createEditor(docWithPermissionRange);
    const replacementDoc = instance.schema.nodes.doc.create(null, [
      instance.schema.nodes.paragraph.create(null, [instance.schema.text('Remote replacement')]),
    ]);
    const tr = instance.state.tr
      .replace(0, instance.state.doc.content.size, new Slice(replacementDoc.content, 0, 0))
      .setMeta(ySyncPluginKey, { isChangeOrigin: true });

    instance.view.dispatch(tr);

    expect(instance.state.doc.textContent).toContain('Remote replacement');
  });

  it('does not reinsert stale permission tags on snapshot-exit replace (no isChangeOrigin)', () => {
    const instance = createEditor(docWithPermissionRange);

    // Verify the original doc has permStart and permEnd
    let hasPermStart = false;
    let hasPermEnd = false;
    instance.state.doc.descendants((node) => {
      if (node.type?.name === 'permStart') hasPermStart = true;
      if (node.type?.name === 'permEnd') hasPermEnd = true;
    });
    expect(hasPermStart).toBe(true);
    expect(hasPermEnd).toBe(true);

    // Simulate y-prosemirror's unrenderSnapshot() — full-doc replace with
    // { snapshot: null, prevSnapshot: null } and NO isChangeOrigin flag.
    const replacementDoc = instance.schema.nodes.doc.create(null, [
      instance.schema.nodes.paragraph.create(null, [instance.schema.text('Snapshot exit content')]),
    ]);
    const tr = instance.state.tr
      .replace(0, instance.state.doc.content.size, new Slice(replacementDoc.content, 0, 0))
      .setMeta(ySyncPluginKey, { snapshot: null, prevSnapshot: null });

    instance.view.dispatch(tr);

    // The resulting doc must NOT contain stale permission markers
    let permStartCount = 0;
    let permEndCount = 0;
    instance.state.doc.descendants((node) => {
      if (node.type?.name === 'permStart') permStartCount++;
      if (node.type?.name === 'permEnd') permEndCount++;
    });
    expect(permStartCount).toBe(0);
    expect(permEndCount).toBe(0);
    expect(instance.state.doc.textContent).toBe('Snapshot exit content');
  });

  it('does not reinsert stale permission tags when Yjs replaces content that had them', () => {
    const instance = createEditor(docWithPermissionRange);

    // Verify the original doc has permStart and permEnd
    let hasPermStart = false;
    let hasPermEnd = false;
    instance.state.doc.descendants((node) => {
      if (node.type?.name === 'permStart') hasPermStart = true;
      if (node.type?.name === 'permEnd') hasPermEnd = true;
    });
    expect(hasPermStart).toBe(true);
    expect(hasPermEnd).toBe(true);

    // Simulate a Yjs sync that replaces the whole doc with content lacking perm tags
    const replacementDoc = instance.schema.nodes.doc.create(null, [
      instance.schema.nodes.paragraph.create(null, [instance.schema.text('Clean remote content')]),
    ]);
    const tr = instance.state.tr
      .replace(0, instance.state.doc.content.size, new Slice(replacementDoc.content, 0, 0))
      .setMeta(ySyncPluginKey, { isChangeOrigin: true });

    instance.view.dispatch(tr);

    // The resulting doc must NOT contain stale permission markers
    let permStartCount = 0;
    let permEndCount = 0;
    instance.state.doc.descendants((node) => {
      if (node.type?.name === 'permStart') permStartCount++;
      if (node.type?.name === 'permEnd') permEndCount++;
    });
    expect(permStartCount).toBe(0);
    expect(permEndCount).toBe(0);
    expect(instance.state.doc.textContent).toBe('Clean remote content');
  });

  it('blocks edits outside the block permission range but allows edits inside it', () => {
    const instance = createProtectedEditor(docWithBlockPermissionRange);
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
    const instance = createProtectedEditor(docWithPermissionRange);
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
    const instance = createProtectedEditor(docWithPermissionRange);
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
    const instance = createProtectedEditor(docWithPermissionRange);
    const editablePos = findTextPos(instance.state.doc, 'Editable');
    expect(editablePos).toBeGreaterThan(0);
    instance.view.dispatch(instance.state.tr.setSelection(TextSelection.create(instance.state.doc, editablePos)));
    const splitTr = instance.state.tr.split(editablePos);
    instance.view.dispatch(splitTr);
    expect(instance.state.doc.childCount).toBeGreaterThan(1);
  });

  it('allows inserting a newline at the end of the permission range', () => {
    const instance = createProtectedEditor(docWithPermissionRange);
    const editablePos = findTextPos(instance.state.doc, 'Editable section. ');
    expect(editablePos).toBeGreaterThan(0);
    const splitPos = editablePos + 'Editable section. '.length;
    instance.view.dispatch(instance.state.tr.setSelection(TextSelection.create(instance.state.doc, splitPos)));
    const splitTr = instance.state.tr.split(splitPos);
    instance.view.dispatch(splitTr);
    expect(instance.state.doc.childCount).toBeGreaterThan(1);
  });

  it('allows editing ranges assigned to the current user via w:ed attribute', () => {
    const instance = createProtectedEditor(docWithUserSpecificPermission, {
      user: { name: 'Gabriel', email: 'gabriel@superdoc.dev' },
    });
    expect(instance.isEditable).toBe(true);
    expect(instance.storage.permissionRanges?.ranges?.length).toBeGreaterThan(0);
  });

  it('blocks w:ed ranges when the current user does not match', () => {
    const instance = createProtectedEditor(docWithUserSpecificPermission, {
      user: { name: 'Viewer', email: 'viewer@example.com' },
    });
    expect(instance.isEditable).toBe(false);
    expect(instance.storage.permissionRanges?.ranges?.length ?? 0).toBe(0);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Protection clear → mode transition regression tests
  // ──────────────────────────────────────────────────────────────────────

  it('restores editability when protection is cleared in editing mode', () => {
    // Start with protection enforced + no allowed ranges → locked
    const instance = createProtectedEditor(docWithoutPermissionRange);
    expect(instance.isEditable).toBe(false);

    // Clear protection by removing enforcement from storage
    instance.storage.protection.state = {
      editingRestriction: {
        mode: 'readOnly',
        enforced: false,
        runtimeEnforced: false,
        passwordProtected: false,
        formattingRestricted: false,
      },
      writeProtection: { enabled: false, passwordProtected: false },
      readOnlyRecommended: false,
    };

    // Switch to editing mode — should restore editability
    instance.setDocumentMode('editing');
    expect(instance.isEditable).toBe(true);
  });

  it('does not let stale baseline override host-controlled read-only after mode transitions', () => {
    // Start protected (no allowed ranges → locked)
    const instance = createProtectedEditor(docWithoutPermissionRange);
    expect(instance.isEditable).toBe(false);

    // Clear protection
    instance.storage.protection.state = {
      editingRestriction: {
        mode: 'readOnly',
        enforced: false,
        runtimeEnforced: false,
        passwordProtected: false,
        formattingRestricted: false,
      },
      writeProtection: { enabled: false, passwordProtected: false },
      readOnlyRecommended: false,
    };

    // Switch to viewing
    instance.setDocumentMode('viewing');
    expect(instance.isEditable).toBe(false);

    // Switch to editing — baseline should be cleared, normal mode behavior
    instance.setDocumentMode('editing');
    expect(instance.isEditable).toBe(true);

    // Back to viewing — should be locked again, not overridden by stale baseline
    instance.setDocumentMode('viewing');
    expect(instance.isEditable).toBe(false);
    expect(instance.storage.protection?.editableBaseline).toBe(null);
  });

  it('does not override host-controlled read-only when protection is cleared', () => {
    // Host disables editing explicitly via setEditable(false), without
    // a mode transition. This simulates a custom UI lock.
    const instance = createEditor(docWithoutPermissionRange, { documentMode: 'editing' });
    instance.setEditable(false, false);
    expect(instance.isEditable).toBe(false);

    // Apply protection via applyEffectiveEditability (e.g., remote part sync).
    // The editor is already non-editable, so protection must NOT claim it.
    instance.storage.protection.state = {
      editingRestriction: {
        mode: 'readOnly',
        enforced: true,
        runtimeEnforced: true,
        passwordProtected: false,
        formattingRestricted: false,
      },
      writeProtection: { enabled: false, passwordProtected: false },
      readOnlyRecommended: false,
    };
    instance.storage.protection.initialized = true;

    // Trigger recompute WITHOUT setDocumentMode (which would call setEditable(true))
    const { applyEffectiveEditability } = require('../protection/editability.js');
    applyEffectiveEditability(instance);
    expect(instance.isEditable).toBe(false);
    // Baseline captured the host's false — protection didn't change it
    expect(instance.storage.protection?.editableBaseline).toBe(false);

    // Clear protection — should NOT restore editability (baseline was false)
    instance.storage.protection.state = {
      editingRestriction: {
        mode: 'readOnly',
        enforced: false,
        runtimeEnforced: false,
        passwordProtected: false,
        formattingRestricted: false,
      },
      writeProtection: { enabled: false, passwordProtected: false },
      readOnlyRecommended: false,
    };
    applyEffectiveEditability(instance);
    expect(instance.isEditable).toBe(false);
  });

  it('restores host read-only when protection with allowed ranges is cleared', () => {
    // Host disables editing explicitly
    const instance = createEditor(docWithPermissionRange, { documentMode: 'editing' });
    instance.setEditable(false, false);
    expect(instance.isEditable).toBe(false);

    // Apply protection with an everyone range — protection forces editable
    instance.storage.protection.state = {
      editingRestriction: {
        mode: 'readOnly',
        enforced: true,
        runtimeEnforced: true,
        passwordProtected: false,
        formattingRestricted: false,
      },
      writeProtection: { enabled: false, passwordProtected: false },
      readOnlyRecommended: false,
    };
    instance.storage.protection.initialized = true;

    const { applyEffectiveEditability } = require('../protection/editability.js');
    applyEffectiveEditability(instance);
    expect(instance.isEditable).toBe(true);
    // Baseline captured the host's false before protection overrode it
    expect(instance.storage.protection?.editableBaseline).toBe(false);

    // Clear protection — should restore host's read-only, not stay editable
    instance.storage.protection.state = {
      editingRestriction: {
        mode: 'readOnly',
        enforced: false,
        runtimeEnforced: false,
        passwordProtected: false,
        formattingRestricted: false,
      },
      writeProtection: { enabled: false, passwordProtected: false },
      readOnlyRecommended: false,
    };
    applyEffectiveEditability(instance);
    expect(instance.isEditable).toBe(false);
  });

  it('preserves host baseline through multiple protection-state flips', () => {
    // Baseline: editing mode, editable
    const instance = createEditor(docWithPermissionRange, { documentMode: 'editing' });
    expect(instance.isEditable).toBe(true);

    const { applyEffectiveEditability } = require('../protection/editability.js');

    // Enforce protection with NO allowed ranges → locks editor.
    // Use refilterRanges: false so the everyone ranges don't auto-populate.
    instance.storage.protection.state = {
      editingRestriction: {
        mode: 'readOnly',
        enforced: true,
        runtimeEnforced: true,
        passwordProtected: false,
        formattingRestricted: false,
      },
      writeProtection: { enabled: false, passwordProtected: false },
      readOnlyRecommended: false,
    };
    instance.storage.protection.initialized = true;
    instance.storage.permissionRanges.hasAllowedRanges = false;
    applyEffectiveEditability(instance, { refilterRanges: false });
    expect(instance.isEditable).toBe(false);
    expect(instance.storage.protection?.editableBaseline).toBe(true);

    // A matching range is added → protection unlocks editor
    // (simulate by manually setting allowedRanges)
    instance.storage.permissionRanges.hasAllowedRanges = true;
    applyEffectiveEditability(instance, { refilterRanges: false });
    expect(instance.isEditable).toBe(true);
    // Baseline must still be the original host value, not overwritten
    expect(instance.storage.protection?.editableBaseline).toBe(true);

    // Range is removed → protection re-locks editor
    instance.storage.permissionRanges.hasAllowedRanges = false;
    applyEffectiveEditability(instance, { refilterRanges: false });
    expect(instance.isEditable).toBe(false);
    expect(instance.storage.protection?.editableBaseline).toBe(true);

    // Protection cleared → must restore host's original editable=true
    instance.storage.protection.state = {
      editingRestriction: {
        mode: 'readOnly',
        enforced: false,
        runtimeEnforced: false,
        passwordProtected: false,
        formattingRestricted: false,
      },
      writeProtection: { enabled: false, passwordProtected: false },
      readOnlyRecommended: false,
    };
    applyEffectiveEditability(instance);
    expect(instance.isEditable).toBe(true);
    expect(instance.storage.protection?.editableBaseline).toBe(null);
  });

  it('preserves host read-only baseline through multiple protection-state flips', () => {
    // Baseline: editing mode, host-locked
    const instance = createEditor(docWithPermissionRange, { documentMode: 'editing' });
    instance.setEditable(false, false);
    expect(instance.isEditable).toBe(false);

    const { applyEffectiveEditability } = require('../protection/editability.js');

    // Enforce protection with allowed ranges → forces editable
    instance.storage.protection.state = {
      editingRestriction: {
        mode: 'readOnly',
        enforced: true,
        runtimeEnforced: true,
        passwordProtected: false,
        formattingRestricted: false,
      },
      writeProtection: { enabled: false, passwordProtected: false },
      readOnlyRecommended: false,
    };
    instance.storage.protection.initialized = true;
    applyEffectiveEditability(instance);
    expect(instance.isEditable).toBe(true);
    expect(instance.storage.protection?.editableBaseline).toBe(false);

    // Ranges removed → protection re-locks
    instance.storage.permissionRanges.hasAllowedRanges = false;
    applyEffectiveEditability(instance, { refilterRanges: false });
    expect(instance.isEditable).toBe(false);
    // Baseline is still the host's original false
    expect(instance.storage.protection?.editableBaseline).toBe(false);

    // Ranges re-added → protection unlocks again
    instance.storage.permissionRanges.hasAllowedRanges = true;
    applyEffectiveEditability(instance, { refilterRanges: false });
    expect(instance.isEditable).toBe(true);

    // Protection cleared → must restore host's read-only (false)
    instance.storage.protection.state = {
      editingRestriction: {
        mode: 'readOnly',
        enforced: false,
        runtimeEnforced: false,
        passwordProtected: false,
        formattingRestricted: false,
      },
      writeProtection: { enabled: false, passwordProtected: false },
      readOnlyRecommended: false,
    };
    applyEffectiveEditability(instance);
    expect(instance.isEditable).toBe(false);
  });

  // ──────────────────────────────────────────────────────────────────────
  // permissionPrincipals edge cases
  // ──────────────────────────────────────────────────────────────────────

  it('treats empty permissionPrincipals array as explicit no-match (no email fallback)', () => {
    // User with email that would match the ed attribute, but explicit empty principals
    const instance = createProtectedEditor(docWithUserSpecificPermission, {
      user: { name: 'Gabriel', email: 'gabriel@superdoc.dev', permissionPrincipals: [] },
    });
    // Empty array disables email fallback, so the named range should NOT match
    expect(instance.isEditable).toBe(false);
    expect(instance.storage.permissionRanges?.ranges?.length ?? 0).toBe(0);
  });

  it('falls back to email when permissionPrincipals is undefined', () => {
    const instance = createProtectedEditor(docWithUserSpecificPermission, {
      user: { name: 'Gabriel', email: 'gabriel@superdoc.dev' },
    });
    // No permissionPrincipals → email fallback should match the ed range
    expect(instance.isEditable).toBe(true);
    expect(instance.storage.permissionRanges?.ranges?.length).toBeGreaterThan(0);
  });
});
