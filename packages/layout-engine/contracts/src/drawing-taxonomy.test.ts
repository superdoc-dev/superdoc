/**
 * Enforcement tests that freeze the drawing support taxonomy.
 *
 * These assertions are the machine-checkable form of the drawing support
 * taxonomy decisions. If a later change adds a family, flips a
 * classification, or adds a diagnostic code without a matching deliberate
 * decision, one of these fails — that is the point of "freezing" the
 * taxonomy in code rather than prose.
 */
import { describe, it, expect } from 'vitest';

import {
  DRAWING_DIAGNOSTIC_CODES,
  DRAWING_DIAGNOSTIC_CODE_ALIASES,
  DRAWING_SUPPORT_TAXONOMY,
  DRAWING_FAMILIES,
  canonicalDrawingDiagnosticCode,
  getDrawingFamilySpec,
  isSupportedDrawingFamily,
  type DrawingFamily,
} from './drawing-taxonomy.js';

const ALL_FAMILIES = DRAWING_FAMILIES;

describe('drawing support taxonomy (frozen)', () => {
  it('every family is classified into exactly one support level', () => {
    for (const family of ALL_FAMILIES) {
      const spec = getDrawingFamilySpec(family);
      expect(spec.family).toBe(family);
      expect(['supported', 'fail-closed', 'deferred']).toContain(spec.support);
      expect(spec.description.length).toBeGreaterThan(0);
    }
  });

  it('covers the exact frozen family set (no silent additions/removals)', () => {
    // Freeze the inventory. Changing this list requires a deliberate,
    // documented taxonomy decision.
    const expected: DrawingFamily[] = [
      // supported
      'inlineBitmap',
      'anchoredBitmap',
      'imageChildInGroup',
      'vectorShape',
      'shapeGroup',
      'alternateContent',
      // fail-closed
      'externalImage',
      'missingRelationship',
      'missingMediaPart',
      'wrongRelationshipType',
      'unsupportedMime',
      'oversizedMediaPart',
      'unsafeSvg',
      'metafileOrTiff',
      'embeddedObject',
      'smartArtOrDiagram',
      'vml',
      'vmlImageLike',
      'unsupportedGeometryCommand',
      'unsupportedAnchorFields',
      'unsupportedWrapFields',
      'alternateContentNoSupportedChoice',
      'groupChildUnsupported',
      'chart',
      // deferred
      'objectEditing',
      'customWrapPolygon',
      'chartFidelity',
      'vmlFidelity',
      'decorativeAccessibilityUi',
    ];
    expect([...ALL_FAMILIES].sort()).toEqual([...expected].sort());
  });

  it('every supported family maps to a real layout contract (plan §2.1, §9)', () => {
    const supported = ALL_FAMILIES.filter(isSupportedDrawingFamily);
    expect(supported.length).toBeGreaterThan(0);
    for (const family of supported) {
      const spec = getDrawingFamilySpec(family);
      expect(spec.contract).not.toBe('none');
      expect(spec.diagnostic).toBeUndefined();
    }
  });

  it('pins the supported family -> contract mapping', () => {
    expect(getDrawingFamilySpec('inlineBitmap').contract).toBe('ImageRun');
    expect(getDrawingFamilySpec('anchoredBitmap').contract).toBe('ImageBlock');
    expect(getDrawingFamilySpec('imageChildInGroup').contract).toBe('ImageDrawing');
    expect(getDrawingFamilySpec('vectorShape').contract).toBe('DrawingBlock');
    expect(getDrawingFamilySpec('vectorShape').drawingKind).toBe('vectorShape');
    expect(getDrawingFamilySpec('shapeGroup').contract).toBe('DrawingBlock');
    expect(getDrawingFamilySpec('shapeGroup').drawingKind).toBe('shapeGroup');
    expect(getDrawingFamilySpec('alternateContent').contract).toBe('selected-choice');
  });

  it('DrawingBlock-targeted families declare a drawingKind; others do not', () => {
    for (const family of ALL_FAMILIES) {
      const spec = getDrawingFamilySpec(family);
      if (spec.contract === 'DrawingBlock') {
        expect(spec.drawingKind).toBeDefined();
      } else {
        expect(spec.drawingKind).toBeUndefined();
      }
    }
  });

  it('every fail-closed family declares a canonical diagnostic code (plan §4)', () => {
    const canonical = new Set<string>(Object.values(DRAWING_DIAGNOSTIC_CODES));
    const failClosed = ALL_FAMILIES.filter((f) => getDrawingFamilySpec(f).support === 'fail-closed');
    expect(failClosed.length).toBeGreaterThan(0);
    for (const family of failClosed) {
      const spec = getDrawingFamilySpec(family);
      expect(spec.contract).toBe('none');
      expect(spec.diagnostic).toBeDefined();
      expect(canonical.has(spec.diagnostic as string)).toBe(true);
    }
  });

  it('deferred families make no support claim', () => {
    const deferred = ALL_FAMILIES.filter((f) => getDrawingFamilySpec(f).support === 'deferred');
    expect(deferred.length).toBeGreaterThan(0);
    for (const family of deferred) {
      const spec = getDrawingFamilySpec(family);
      expect(spec.contract).toBe('none');
      expect(spec.diagnostic).toBeUndefined();
    }
  });

  it('every canonical diagnostic code is used by at least one fail-closed family (no orphans)', () => {
    const used = new Set(
      ALL_FAMILIES.map((f) => getDrawingFamilySpec(f).diagnostic).filter((c): c is string => Boolean(c)),
    );
    for (const code of Object.values(DRAWING_DIAGNOSTIC_CODES)) {
      expect(used.has(code)).toBe(true);
    }
  });

  it('diagnostic codes are unique strings', () => {
    const codes = Object.values(DRAWING_DIAGNOSTIC_CODES);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('the chart decision is fail-closed', () => {
    const spec = getDrawingFamilySpec('chart');
    expect(spec.support).toBe('fail-closed');
    expect(spec.diagnostic).toBe('render.chart-not-supported');
  });

  it('VML defaults to fail-closed preservation', () => {
    expect(getDrawingFamilySpec('vml').diagnostic).toBe('render.drawing.vml-unsupported');
    expect(getDrawingFamilySpec('vml').support).toBe('fail-closed');
  });
});

describe('drawing diagnostic code normalization', () => {
  it('canonical codes resolve to themselves', () => {
    for (const code of Object.values(DRAWING_DIAGNOSTIC_CODES)) {
      expect(canonicalDrawingDiagnosticCode(code)).toBe(code);
    }
  });

  it('compatibility aliases resolve to a canonical code', () => {
    const canonical = new Set<string>(Object.values(DRAWING_DIAGNOSTIC_CODES));
    for (const [alias, target] of Object.entries(DRAWING_DIAGNOSTIC_CODE_ALIASES)) {
      expect(canonical.has(target)).toBe(true);
      expect(canonicalDrawingDiagnosticCode(alias)).toBe(target);
      // Aliases must not collide with canonical codes.
      expect(canonical.has(alias)).toBe(false);
    }
  });

  it('unknown codes return null', () => {
    expect(canonicalDrawingDiagnosticCode('render.totally.unknown')).toBeNull();
    expect(canonicalDrawingDiagnosticCode('')).toBeNull();
  });

  it('preserves the existing live emitter codes as aliases (plan §4 compat)', () => {
    // These are emitted today by the host resolver / adapter and must keep
    // resolving until a later plan converges emitters onto canonical codes.
    expect(canonicalDrawingDiagnosticCode('render.media.missing-relationship')).toBe(
      DRAWING_DIAGNOSTIC_CODES.missingRelationship,
    );
    expect(canonicalDrawingDiagnosticCode('render.media.wrong-relationship-type')).toBe(
      DRAWING_DIAGNOSTIC_CODES.unsupportedRelationshipType,
    );
    expect(canonicalDrawingDiagnosticCode('render.media-resolver-unavailable')).toBe(
      DRAWING_DIAGNOSTIC_CODES.missingMediaPart,
    );
    expect(canonicalDrawingDiagnosticCode('render.media.invalid-image-size')).toBe(
      DRAWING_DIAGNOSTIC_CODES.imageTooLarge,
    );
    expect(canonicalDrawingDiagnosticCode('render.textbox.vml-unsupported')).toBe(
      DRAWING_DIAGNOSTIC_CODES.vmlUnsupported,
    );
  });
});
