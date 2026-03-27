/**
 * Integration tests for header/footer slot materialization.
 *
 * Unlike the unit tests in header-footer-slot-materialization.test.ts, these
 * tests use the REAL compoundMutation, mutateParts, and createHeaderFooterPart
 * implementations with a parts-backed test editor. Only the section/projection
 * layer (which requires a live ProseMirror document) is mocked.
 *
 * These tests prove:
 * - Materialization creates real parts in the store and populates converter caches
 * - Rollback cleans up all created parts, invalidation handlers, and converter state
 * - A degraded commit (afterCommit hook failure) is detected and propagated
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ensureExplicitHeaderFooterSlot } from './header-footer-slot-materialization.js';
import { createHeaderFooterPart } from './header-footer-parts.js';
import { createTestEditor, withPart, cleanupParts, withDescriptor } from '../../core/parts/testing/test-helpers.js';
import { initRevision, getRevision } from '../plan-engine/revision-tracker.js';
import { relsPartDescriptor } from '../../core/parts/adapters/rels-part-descriptor.js';
import type { Editor } from '../../core/Editor.js';

// ---------------------------------------------------------------------------
// Mocks — only section/projection helpers (need real PM doc)
// ---------------------------------------------------------------------------

const mockSectionProjections = vi.fn();
vi.mock('./sections-resolver.js', () => ({
  resolveSectionProjections: (...args: unknown[]) => mockSectionProjections(...args),
}));

const mockReadTargetSectPr = vi.fn();
vi.mock('./section-projection-access.js', () => ({
  readTargetSectPr: (...args: unknown[]) => mockReadTargetSectPr(...args),
}));

const mockApplySectPrToProjection = vi.fn();
vi.mock('./section-mutation-wrapper.js', () => ({
  applySectPrToProjection: (...args: unknown[]) => mockApplySectPrToProjection(...args),
}));

// resolveEffectiveRef — returns null (no inherited ref to clone from)
vi.mock('./header-footer-refs-mutation.js', () => ({
  resolveEffectiveRef: () => null,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RELS_XMLNS = 'http://schemas.openxmlformats.org/package/2006/relationships';

function createMinimalRels() {
  return {
    elements: [
      {
        type: 'element',
        name: 'Relationships',
        attributes: { xmlns: RELS_XMLNS },
        elements: [],
      },
    ],
  };
}

function createProjection(sectionId: string) {
  return {
    sectionId,
    address: { kind: 'section', sectionId },
    range: { sectionIndex: 0 },
    target: { kind: 'body' },
    domain: {},
  };
}

function asEditor(mock: ReturnType<typeof createTestEditor>): Editor {
  return mock as unknown as Editor;
}

function getRelationshipElements(editor: ReturnType<typeof createTestEditor>) {
  const rels = editor.converter.convertedXml['word/_rels/document.xml.rels'] as any;
  return rels?.elements?.[0]?.elements ?? [];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ensureExplicitHeaderFooterSlot (integration)', () => {
  let editor: ReturnType<typeof createTestEditor>;

  beforeEach(() => {
    vi.clearAllMocks();

    editor = createTestEditor();

    // Extend converter with header/footer caches
    const conv = editor.converter as any;
    conv.headers = {};
    conv.footers = {};
    conv.headerIds = { ids: [] };
    conv.footerIds = { ids: [] };
    conv.headerFooterModified = false;

    // Seed the rels part with an empty Relationships element
    withPart(editor, 'word/_rels/document.xml.rels' as any, createMinimalRels());

    // Register the rels descriptor so afterCommit fires
    withDescriptor(relsPartDescriptor);

    // Initialize revision tracking
    initRevision(asEditor(editor));

    // Default projection setup
    mockSectionProjections.mockReturnValue([createProjection('section-0')]);
    mockReadTargetSectPr.mockReturnValue(null); // blank doc, no existing sectPr
    mockApplySectPrToProjection.mockImplementation(() => {});
  });

  afterEach(() => {
    cleanupParts();
  });

  it('creates a real part, populates converter caches, and returns the new refId', () => {
    const result = ensureExplicitHeaderFooterSlot(asEditor(editor), {
      sectionId: 'section-0',
      kind: 'header',
      variant: 'default',
    });

    expect(result).not.toBeNull();
    expect(result!.created).toBe(true);

    // Part should exist in the store
    const partPath = result!.createdPartPath;
    expect(editor.converter.convertedXml[partPath]).toBeDefined();

    // Rels should contain the new relationship
    const rels = getRelationshipElements(editor);
    const newRel = rels.find((el: any) => el.attributes?.Id === result!.refId);
    expect(newRel).toBeDefined();

    // Converter caches should be populated by the afterCommit hook
    const conv = editor.converter as any;
    expect(conv.headerIds.ids).toContain(result!.refId);
    expect(conv.headers[result!.refId]).toBeDefined();
    expect(conv.headerFooterModified).toBe(true);
  });

  it('rolls back all state when applySectPrToProjection throws', () => {
    const conv = editor.converter as any;
    const revisionBefore = getRevision(asEditor(editor));
    const modifiedBefore = editor.converter.documentModified;
    const headerIdsBefore = [...conv.headerIds.ids];
    const relsElementsBefore = getRelationshipElements(editor).length;

    mockApplySectPrToProjection.mockImplementation(() => {
      throw new Error('PM dispatch failed');
    });

    const result = ensureExplicitHeaderFooterSlot(asEditor(editor), {
      sectionId: 'section-0',
      kind: 'header',
      variant: 'default',
    });

    expect(result).toBeNull();

    // No orphan parts should exist (only the rels part we seeded)
    const partKeys = Object.keys(editor.converter.convertedXml);
    expect(partKeys).toEqual(['word/_rels/document.xml.rels']);

    // Rels should be unchanged
    expect(getRelationshipElements(editor).length).toBe(relsElementsBefore);

    // Converter caches should be restored
    expect(conv.headerIds.ids).toEqual(headerIdsBefore);
    expect(conv.headers).toEqual({});

    // Revision and documentModified should be restored
    expect(getRevision(asEditor(editor))).toBe(revisionBefore);
    expect(editor.converter.documentModified).toBe(modifiedBefore);
  });

  it('is idempotent — second call with existing ref returns created=false', () => {
    // First call: creates the slot
    const first = ensureExplicitHeaderFooterSlot(asEditor(editor), {
      sectionId: 'section-0',
      kind: 'header',
      variant: 'default',
    });
    expect(first!.created).toBe(true);

    // Second call: now the sectPr has the ref
    mockReadTargetSectPr.mockReturnValue({
      type: 'element',
      name: 'w:sectPr',
      elements: [
        {
          type: 'element',
          name: 'w:headerReference',
          attributes: { 'w:type': 'default', 'r:id': first!.refId },
          elements: [],
        },
      ],
    });

    const second = ensureExplicitHeaderFooterSlot(asEditor(editor), {
      sectionId: 'section-0',
      kind: 'header',
      variant: 'default',
    });

    expect(second!.created).toBe(false);
    expect(second!.refId).toBe(first!.refId);
  });

  it('creates footer parts correctly', () => {
    const result = ensureExplicitHeaderFooterSlot(asEditor(editor), {
      sectionId: 'section-0',
      kind: 'footer',
      variant: 'default',
    });

    expect(result).not.toBeNull();
    expect(result!.created).toBe(true);
    expect(result!.createdPartPath).toMatch(/^word\/footer\d+\.xml$/);

    const conv = editor.converter as any;
    expect(conv.footerIds.ids).toContain(result!.refId);
    expect(conv.footers[result!.refId]).toBeDefined();
  });

  it('propagates degraded commit when rels afterCommit hook throws', () => {
    // Replace the rels descriptor with one whose afterCommit throws
    cleanupParts();
    withDescriptor({
      id: 'word/_rels/document.xml.rels',
      ensurePart: relsPartDescriptor.ensurePart,
      afterCommit() {
        throw new Error('afterCommit hook exploded');
      },
    });
    withPart(editor, 'word/_rels/document.xml.rels' as any, createMinimalRels());
    initRevision(asEditor(editor));

    const conv = editor.converter as any;

    // The degraded commit should be caught inside createHeaderFooterPart
    // and propagated as a failure through compoundMutation's rollback.
    const result = ensureExplicitHeaderFooterSlot(asEditor(editor), {
      sectionId: 'section-0',
      kind: 'header',
      variant: 'default',
    });

    expect(result).toBeNull();

    // No orphan parts
    const partKeys = Object.keys(editor.converter.convertedXml);
    expect(partKeys).toEqual(['word/_rels/document.xml.rels']);

    // Converter caches should be clean
    expect(conv.headerIds.ids).toEqual([]);
    expect(conv.headers).toEqual({});
  });
});

// ==========================================================================
// createHeaderFooterPart — direct caller path
// ==========================================================================

describe('createHeaderFooterPart (direct call, no outer compoundMutation)', () => {
  let editor: ReturnType<typeof createTestEditor>;

  beforeEach(() => {
    editor = createTestEditor();
    const conv = editor.converter as any;
    conv.headers = {};
    conv.footers = {};
    conv.headerIds = { ids: [] };
    conv.footerIds = { ids: [] };
    conv.headerFooterModified = false;

    withPart(editor, 'word/_rels/document.xml.rels' as any, createMinimalRels());
    withDescriptor(relsPartDescriptor);
    initRevision(asEditor(editor));
  });

  afterEach(() => {
    cleanupParts();
  });

  it('creates part and populates converter caches on success', () => {
    const result = createHeaderFooterPart(asEditor(editor), {
      kind: 'header',
      variant: 'default',
    });

    expect(result.refId).toBeTruthy();
    expect(result.relationshipTarget).toMatch(/^word\/header\d+\.xml$/);

    // Part exists
    expect(editor.converter.convertedXml[result.relationshipTarget]).toBeDefined();

    // Rels contain the new relationship
    const rels = getRelationshipElements(editor);
    expect(rels.some((el: any) => el.attributes?.Id === result.refId)).toBe(true);

    // Converter caches populated
    const conv = editor.converter as any;
    expect(conv.headerIds.ids).toContain(result.refId);
    expect(conv.headers[result.refId]).toBeDefined();
  });

  it('rolls back everything on degraded afterCommit — no dangling rels entry', () => {
    // Swap in a descriptor whose afterCommit throws
    cleanupParts();
    withDescriptor({
      id: 'word/_rels/document.xml.rels',
      ensurePart: relsPartDescriptor.ensurePart,
      afterCommit() {
        throw new Error('afterCommit hook exploded');
      },
    });
    withPart(editor, 'word/_rels/document.xml.rels' as any, createMinimalRels());
    initRevision(asEditor(editor));

    const relsBefore = JSON.stringify(editor.converter.convertedXml['word/_rels/document.xml.rels']);

    expect(() =>
      createHeaderFooterPart(asEditor(editor), {
        kind: 'header',
        variant: 'default',
      }),
    ).toThrow();

    // No orphan header XML parts
    const partKeys = Object.keys(editor.converter.convertedXml);
    expect(partKeys).toEqual(['word/_rels/document.xml.rels']);

    // document.xml.rels is unchanged — no dangling Relationship entry
    expect(JSON.stringify(editor.converter.convertedXml['word/_rels/document.xml.rels'])).toBe(relsBefore);

    // Converter caches are clean
    const conv = editor.converter as any;
    expect(conv.headerIds.ids).toEqual([]);
    expect(conv.headers).toEqual({});
  });
});
