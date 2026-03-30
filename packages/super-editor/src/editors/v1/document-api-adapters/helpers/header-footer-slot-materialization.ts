/**
 * Shared header/footer slot materialization helper.
 *
 * Single source of truth for "make this section have an explicit
 * header/footer slot". Used by both the PresentationEditor UI bootstrap
 * and the story-runtime inherited-slot materialization path.
 *
 * Wraps the entire sequence (part creation + sectPr mutation) in a
 * `compoundMutation()` so that failure at any step rolls back all state
 * including header/footer caches.
 */

import type { SectionHeaderFooterKind, SectionHeaderFooterVariant } from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';
import type { SectionProjection } from './sections-resolver.js';
import { resolveSectionProjections } from './sections-resolver.js';
import { readTargetSectPr } from './section-projection-access.js';
import { ensureSectPrElement, setSectPrHeaderFooterRef, readSectPrHeaderFooterRefs } from './sections-xml.js';
import { createHeaderFooterPart } from './header-footer-parts.js';
import { resolveEffectiveRef } from './header-footer-refs-mutation.js';
import { applySectPrToProjection } from './section-mutation-wrapper.js';
import { compoundMutation } from '../../core/parts/mutation/compound-mutation.js';
import { removePart, hasPart } from '../../core/parts/store/part-store.js';
import { removeInvalidationHandler } from '../../core/parts/invalidation/part-invalidation-registry.js';
import type { PartId } from '../../core/parts/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EnsureExplicitHeaderFooterSlotInput = {
  sectionId: string;
  kind: SectionHeaderFooterKind;
  variant: SectionHeaderFooterVariant;
  /** Optional source part to clone from. If omitted, clones from inherited or creates empty. */
  sourceRefId?: string;
};

export type EnsureExplicitHeaderFooterSlotResult = {
  refId: string;
  createdPartPath: string;
  sectionId: string;
  kind: SectionHeaderFooterKind;
  variant: SectionHeaderFooterVariant;
  /** The refId of the inherited source that was cloned, if any. */
  materializedFromRefId: string | null;
  /** Whether a new slot was actually created (false means it already existed). */
  created: boolean;
};

// ---------------------------------------------------------------------------
// Variant normalization
// ---------------------------------------------------------------------------

const VALID_VARIANTS: ReadonlySet<string> = new Set(['default', 'first', 'even']);

/**
 * Normalize a section type from the UI to a valid OOXML variant.
 *
 * In Word's OOXML model, odd-page headers are represented by the `default`
 * slot — there is no explicit `w:headerReference` with `w:type="odd"`.
 *
 * This is the caller's responsibility — the materialization helper rejects
 * unrecognized variants rather than silently mapping them.
 */
export function normalizeVariant(sectionType: string): SectionHeaderFooterVariant {
  if (sectionType === 'odd') return 'default';
  if (!VALID_VARIANTS.has(sectionType)) {
    throw new Error(`Unrecognized header/footer variant: "${sectionType}". Expected default, first, or even.`);
  }
  return sectionType as SectionHeaderFooterVariant;
}

// ---------------------------------------------------------------------------
// Rollback cleanup
// ---------------------------------------------------------------------------

/**
 * Remove dynamically created parts and invalidation handlers that
 * `compoundMutation`'s snapshot doesn't cover. Called on failure after
 * `createHeaderFooterPart` has already committed its parts.
 */
function cleanupCreatedPart(editor: Editor, partPath: string): void {
  const partId = partPath as PartId;
  if (hasPart(editor, partId)) removePart(editor, partId);
  removeInvalidationHandler(partId);
  const relsPath = `word/_rels/${partPath.split('/').pop()}.rels` as PartId;
  if (hasPart(editor, relsPath)) removePart(editor, relsPath);
}

// ---------------------------------------------------------------------------
// Materialization helper
// ---------------------------------------------------------------------------

/**
 * Ensure a section has an explicit header/footer slot, materializing it if necessary.
 *
 * Idempotent: if the slot already has an explicit ref, returns it immediately.
 *
 * When creating a new slot:
 * 1. Resolves inherited effective ref if present
 * 2. Creates a new header/footer part (cloning from inherited source when available)
 * 3. Adds the relationship to `word/_rels/document.xml.rels`
 * 4. Writes the explicit ref into the section's `sectPr`
 *
 * The entire sequence is wrapped in `compoundMutation()` so that failure
 * rolls back parts, relationships, and header/footer caches atomically.
 */
export function ensureExplicitHeaderFooterSlot(
  editor: Editor,
  input: EnsureExplicitHeaderFooterSlotInput,
): EnsureExplicitHeaderFooterSlotResult | null {
  const { sectionId, kind, variant, sourceRefId } = input;

  // Step 1–2: Resolve section projections and find the target section.
  // This is done BEFORE any mutations as a pre-validation gate.
  const sections = resolveSectionProjections(editor);
  const projection = sections.find((s) => s.sectionId === sectionId);
  if (!projection) {
    console.warn(`[header-footer-slot-materialization] Section "${sectionId}" not found.`);
    return null;
  }

  // Step 3: Read current sectPr and check for an existing explicit ref.
  const currentSectPr = readTargetSectPr(editor, projection);
  if (currentSectPr) {
    const existingRefs = readSectPrHeaderFooterRefs(currentSectPr, kind);
    const existingRefId = existingRefs?.[variant];
    if (existingRefId) {
      return {
        refId: existingRefId,
        createdPartPath: '',
        sectionId,
        kind,
        variant,
        materializedFromRefId: null,
        created: false,
      };
    }
  }

  // Step 4: Resolve inherited effective ref for potential cloning.
  const sectionIndex = sections.indexOf(projection);
  const inheritedRef = resolveEffectiveRef(editor, sections, sectionIndex, kind, variant);
  const effectiveSourceRefId = sourceRefId ?? inheritedRef?.refId ?? undefined;

  // Step 5–11: Create part + update sectPr, wrapped in compoundMutation
  // for atomicity (including header/footer cache rollback).
  let result: EnsureExplicitHeaderFooterSlotResult | null = null;

  const mutationResult = compoundMutation({
    editor,
    source: 'ensureExplicitHeaderFooterSlot',
    affectedParts: ['word/_rels/document.xml.rels'],
    execute: () => {
      // Create the header/footer part (also registers relationship).
      // createHeaderFooterPart is self-contained: it wraps its own mutations
      // in compoundMutation and rolls back on degraded afterCommit. If it
      // throws, no orphan state is left behind.
      let created: { refId: string; relationshipTarget: string };
      try {
        created = createHeaderFooterPart(editor, {
          kind,
          variant,
          sourceRefId: effectiveSourceRefId,
        });
      } catch {
        return false;
      }

      try {
        // Clone/ensure sectPr and add the new reference
        const nextSectPr = ensureSectPrElement(currentSectPr);
        setSectPrHeaderFooterRef(nextSectPr, kind, variant, created.refId);
        applySectPrToProjection(editor, projection, nextSectPr);
      } catch {
        // createHeaderFooterPart committed parts not tracked by this
        // compoundMutation's snapshot. Clean them up before signalling
        // failure so rollback doesn't leave orphan part files.
        cleanupCreatedPart(editor, created.relationshipTarget);
        return false;
      }

      result = {
        refId: created.refId,
        createdPartPath: created.relationshipTarget,
        sectionId,
        kind,
        variant,
        materializedFromRefId: effectiveSourceRefId ?? null,
        created: true,
      };

      return true;
    },
  });

  if (!mutationResult.success) {
    console.warn('[header-footer-slot-materialization] Materialization failed, state rolled back.');
    return null;
  }

  return result;
}
