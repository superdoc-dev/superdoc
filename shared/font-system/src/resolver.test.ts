import { describe, it, expect } from 'vitest';
import {
  resolveFontFamily,
  resolvePhysicalFamily,
  resolvePrimaryPhysicalFamily,
  resolvePhysicalFamilies,
  createFontResolver,
} from './index';

describe('font resolver', () => {
  it('maps the verified clean clones (bare names)', () => {
    expect(resolvePhysicalFamily('Calibri')).toBe('Carlito');
    expect(resolvePhysicalFamily('Cambria')).toBe('Caladea');
    expect(resolvePhysicalFamily('Arial')).toBe('Liberation Sans');
    expect(resolvePhysicalFamily('Times New Roman')).toBe('Liberation Serif');
    expect(resolvePhysicalFamily('Courier New')).toBe('Liberation Mono');
    expect(resolvePhysicalFamily('Helvetica')).toBe('Liberation Sans');
  });

  it('resolves the PRIMARY family of a CSS stack and keeps the fallbacks', () => {
    // The real shape reaching measure/paint (toCssFontFamily output).
    expect(resolvePhysicalFamily('Calibri, sans-serif')).toBe('Carlito, sans-serif');
    expect(resolvePhysicalFamily('Times New Roman, serif')).toBe('Liberation Serif, serif');
    expect(resolvePhysicalFamily('Calibri , Arial , sans-serif')).toBe('Carlito, Arial, sans-serif');
  });

  it('is case- and quote-insensitive on the primary name', () => {
    expect(resolvePhysicalFamily('"CAMBRIA", serif')).toBe('Caladea, serif');
    expect(resolvePhysicalFamily('courier new')).toBe('Liberation Mono');
  });

  it('passes through a family with no known substitute', () => {
    expect(resolvePhysicalFamily('Verdana, sans-serif')).toBe('Verdana, sans-serif');
    expect(resolveFontFamily('Verdana')).toEqual({
      logicalFamily: 'Verdana',
      physicalFamily: 'Verdana',
      reason: 'as_requested',
    });
    // Aptos/Georgia have no clean clone yet -> not mapped.
    expect(resolvePhysicalFamily('Aptos')).toBe('Aptos');
    expect(resolvePhysicalFamily('Georgia')).toBe('Georgia');
  });

  it('reports the substitution reason + preserves the logical family', () => {
    expect(resolveFontFamily('Cambria')).toEqual({
      logicalFamily: 'Cambria',
      physicalFamily: 'Caladea',
      reason: 'bundled_substitute',
    });
    expect(resolveFontFamily('Calibri, sans-serif').logicalFamily).toBe('Calibri, sans-serif');
  });

  it('aliases Helvetica to the already-bundled Liberation Sans (metric_safe alias, no new asset)', () => {
    // docfonts records Helvetica -> Liberation Sans as metric_safe (0.000% analytic advance, all four
    // faces; resolver-alias only, no layout proof). Resolves like a bundled substitute, not a visual
    // fallback.
    expect(resolveFontFamily('Helvetica')).toEqual({
      logicalFamily: 'Helvetica',
      physicalFamily: 'Liberation Sans',
      reason: 'bundled_substitute',
    });
    // Resolves like the other clones: CSS stack keeps fallbacks, case/quote-insensitive.
    expect(resolvePhysicalFamily('Helvetica, Arial, sans-serif')).toBe('Liberation Sans, Arial, sans-serif');
    expect(resolvePhysicalFamily('"helvetica"')).toBe('Liberation Sans');
    expect(resolvePrimaryPhysicalFamily('Helvetica, sans-serif')).toBe('Liberation Sans');
  });

  it('extracts the bare physical face the gate must await', () => {
    expect(resolvePrimaryPhysicalFamily('Arial, sans-serif')).toBe('Liberation Sans');
    expect(resolvePrimaryPhysicalFamily('Verdana, sans-serif')).toBe('Verdana');
  });

  it('resolvePhysicalFamilies dedupes to the loadable face names', () => {
    expect(resolvePhysicalFamilies(['Calibri, sans-serif', 'Cambria', 'Calibri', 'Verdana']).sort()).toEqual([
      'Caladea',
      'Carlito',
      'Verdana',
    ]);
  });
});

describe('FontResolver (per-document context)', () => {
  it('is seeded with the bundled clean-clone map', () => {
    const resolver = createFontResolver();
    expect(resolver.resolvePrimaryPhysicalFamily('Calibri')).toBe('Carlito');
    expect(resolver.resolvePhysicalFamily('Arial, sans-serif')).toBe('Liberation Sans, sans-serif');
    expect(resolver.version).toBe(0);
  });

  it('map() overrides the bundled default and reports custom_mapping', () => {
    const resolver = createFontResolver();
    resolver.map('Georgia', 'Gelasio');
    expect(resolver.resolvePrimaryPhysicalFamily('Georgia, serif')).toBe('Gelasio');
    expect(resolver.resolveFontFamily('Georgia')).toEqual({
      logicalFamily: 'Georgia',
      physicalFamily: 'Gelasio',
      reason: 'custom_mapping',
    });
    // An override beats the bundled map for the same logical family.
    resolver.map('Calibri', 'MyCalibri');
    expect(resolver.resolvePrimaryPhysicalFamily('Calibri')).toBe('MyCalibri');
  });

  it('version bumps on each distinct mapping change, not on no-ops', () => {
    const resolver = createFontResolver();
    resolver.map('Georgia', 'Gelasio');
    expect(resolver.version).toBe(1);
    resolver.map('Georgia', 'Gelasio'); // same -> no bump
    expect(resolver.version).toBe(1);
    resolver.unmap('Georgia');
    expect(resolver.version).toBe(2);
    resolver.unmap('Georgia'); // absent -> no bump
    expect(resolver.version).toBe(2);
    expect(resolver.resolvePrimaryPhysicalFamily('Georgia')).toBe('Georgia'); // reverted to identity
  });

  it('identity self-map is a no-op, but an explicit pin to the bundled clone is a STORED override', () => {
    const norm = (f: string) => f.replace(/^["']|["']$/g, '').toLowerCase();
    const registeredBoth = (f: string) => norm(f) === 'calibri' || norm(f) === 'carlito';
    const resolver = createFontResolver();

    // Identity self-map (and a quoted/cased variant of it) is the ABSENCE of an override: dropped, so
    // the document keeps the shareable empty signature.
    resolver.map('Georgia', 'Georgia');
    resolver.map('"Georgia"', 'Georgia');
    expect(resolver.version).toBe(0);
    expect(resolver.signature).toBe('');

    // Mapping to the bundled CLONE is an explicit PIN, not a no-op (after provider precedence a
    // registered real Calibri would otherwise outrank the clone). It is stored as a custom_mapping.
    resolver.map('Calibri', 'Carlito');
    expect(resolver.signature).not.toBe('');
    expect(resolver.resolveFontFamily('Calibri')).toEqual({
      logicalFamily: 'Calibri',
      physicalFamily: 'Carlito',
      reason: 'custom_mapping',
    });
    // The pin wins even when a real Calibri face is registered (custom_mapping > registered_face).
    expect(resolver.resolveFace('Calibri', { weight: '400', style: 'normal' }, registeredBoth)).toMatchObject({
      physicalFamily: 'Carlito',
      reason: 'custom_mapping',
    });

    // unmap reverts to normal provider precedence (back to the shareable empty signature).
    resolver.unmap('Calibri');
    expect(resolver.signature).toBe('');
    expect(resolver.resolvePrimaryPhysicalFamily('Calibri')).toBe('Carlito');
  });

  it('isolates mappings per instance: two documents map the same logical family differently', () => {
    const docA = createFontResolver();
    const docB = createFontResolver();
    docA.map('Georgia', 'Gelasio');
    docB.map('Georgia', 'Tinos');

    expect(docA.resolvePrimaryPhysicalFamily('Georgia')).toBe('Gelasio');
    expect(docB.resolvePrimaryPhysicalFamily('Georgia')).toBe('Tinos');
    // A document with no override still gets the bundled default, unaffected by the others.
    expect(createFontResolver().resolvePrimaryPhysicalFamily('Georgia')).toBe('Georgia');
    expect(docA.resolvePrimaryPhysicalFamily('Calibri')).toBe('Carlito'); // bundled map intact
  });

  it('signature is stable, order-independent, and distinguishes different mappings at the same version', () => {
    const empty = createFontResolver();
    expect(empty.signature).toBe(''); // default docs share cache safely

    const docA = createFontResolver();
    docA.map('Georgia', 'Gelasio');
    const docB = createFontResolver();
    docB.map('Georgia', 'Tinos');
    // Same version (1), DIFFERENT mappings -> signatures MUST differ (else measure/paint collide).
    expect(docA.version).toBe(docB.version);
    expect(docA.signature).not.toBe(docB.signature);

    // Order-independent: the same set of mappings yields the same signature regardless of insertion order.
    const x = createFontResolver();
    x.map('Georgia', 'Gelasio');
    x.map('Arial', 'MyArial');
    const y = createFontResolver();
    y.map('Arial', 'MyArial');
    y.map('Georgia', 'Gelasio');
    expect(x.signature).toBe(y.signature);

    // Identical mapping -> identical signature (safe cross-document cache sharing).
    const z = createFontResolver();
    z.map('Georgia', 'Gelasio');
    expect(z.signature).toBe(docA.signature);
  });

  it('reset() drops all overrides (document swap) and reverts to the bundled-only map', () => {
    const resolver = createFontResolver();
    resolver.map('Georgia', 'Gelasio');
    resolver.map('Calibri', 'MyCalibri');
    expect(resolver.signature).not.toBe('');

    resolver.reset();
    expect(resolver.signature).toBe(''); // back to default identity
    expect(resolver.resolvePrimaryPhysicalFamily('Georgia')).toBe('Georgia'); // override gone
    expect(resolver.resolvePrimaryPhysicalFamily('Calibri')).toBe('Carlito'); // bundled default restored
    expect(resolver.version).toBe(3); // 2 maps + 1 reset

    const before = resolver.version;
    resolver.reset(); // already empty -> no-op, no version bump
    expect(resolver.version).toBe(before);
  });

  it('signature returns to empty after map()+unmap() and converges regardless of add/remove order', () => {
    const resolver = createFontResolver();

    // map then unmap the SAME family -> signature reverts to '' (the memoized signature MUST
    // invalidate on unmap, not serve a stale non-empty value). Cross-render measure reuse depends
    // on this reversibility.
    resolver.map('Georgia', 'Gelasio');
    expect(resolver.signature).not.toBe('');
    resolver.unmap('Georgia');
    expect(resolver.signature).toBe('');

    // Two maps, unmapped in REVERSE order, fully revert to ''.
    resolver.map('Calibri', 'Carlito');
    resolver.map('Cambria', 'Caladea');
    expect(resolver.signature).not.toBe('');
    resolver.unmap('Cambria');
    resolver.unmap('Calibri');
    expect(resolver.signature).toBe('');

    // Order-independent: reaching the same {Georgia, Calibri} mapping set via different add/remove
    // paths converges to ONE signature, so two documents that arrived differently still share cache.
    const viaForward = createFontResolver();
    viaForward.map('Georgia', 'Gelasio');
    viaForward.map('Calibri', 'Carlito');

    const viaDetour = createFontResolver();
    viaDetour.map('Calibri', 'WrongFont');
    viaDetour.map('Georgia', 'Gelasio');
    viaDetour.unmap('Calibri');
    viaDetour.map('Calibri', 'Carlito');

    expect(viaDetour.signature).toBe(viaForward.signature);
  });

  it('trims the physical family and ignores empty/whitespace mappings', () => {
    const resolver = createFontResolver();
    resolver.map('Georgia', '  Gelasio  ');
    expect(resolver.resolvePrimaryPhysicalFamily('Georgia')).toBe('Gelasio'); // trimmed
    expect(resolver.version).toBe(1);
    resolver.map('Georgia', 'Gelasio'); // same after trim -> no bump
    expect(resolver.version).toBe(1);
    resolver.map('Tahoma', '   '); // whitespace-only physical -> ignored
    expect(resolver.resolvePrimaryPhysicalFamily('Tahoma')).toBe('Tahoma');
    expect(resolver.version).toBe(1);
  });
});

describe('face-aware resolution (resolveFace / resolvePhysicalFamilyForFace)', () => {
  const norm = (f: string) => f.replace(/^["']|["']$/g, '').toLowerCase();
  // Realistic registries: the bundled CLONE (Carlito) is registered but the logical Calibri is NOT -
  // the normal bundled-substitute case. `registered` lets a test say a logical family has a real face.
  const cloneFaces = (f: string) => norm(f) === 'carlito';
  const registered = (...families: string[]) => {
    const set = new Set(families.map(norm));
    return (f: string) => set.has(norm(f));
  };
  const regularOnly = (_f: string, w: '400' | '700', s: 'normal' | 'italic') => w === '400' && s === 'normal';
  const noFaces = () => false;
  const FACES = [
    { weight: '400', style: 'normal' },
    { weight: '700', style: 'normal' },
    { weight: '400', style: 'italic' },
    { weight: '700', style: 'italic' },
  ] as const;

  it('four-face clones substitute on EVERY face when the logical family is NOT registered', () => {
    const r = createFontResolver();
    for (const face of FACES) {
      // Calibri has no registered real face; the bundled Carlito clone does -> bundled_substitute.
      expect(r.resolveFace('Calibri', face, cloneFaces)).toEqual({
        logicalFamily: 'Calibri',
        physicalFamily: 'Carlito',
        reason: 'bundled_substitute',
      });
      expect(r.resolvePhysicalFamilyForFace('Calibri, sans-serif', face, cloneFaces)).toBe('Carlito, sans-serif');
    }
  });

  it('a REGISTERED real face for the logical family wins over the bundled substitute (registered_face)', () => {
    const r = createFontResolver();
    // A customer fonts.add (later: an embedded document font) registered real Calibri faces.
    for (const face of FACES) {
      expect(r.resolveFace('Calibri', face, registered('Calibri'))).toEqual({
        logicalFamily: 'Calibri',
        physicalFamily: 'Calibri', // the real family, NOT Carlito
        reason: 'registered_face',
      });
      // CSS stack is unchanged (the registered Calibri face renders), no swap to the clone.
      expect(r.resolvePhysicalFamilyForFace('Calibri, sans-serif', face, registered('Calibri'))).toBe(
        'Calibri, sans-serif',
      );
    }
    // Per face: a registered Bold but Regular-only-clone family still prefers the real Bold.
    expect(r.resolveFace('Calibri', { weight: '700', style: 'normal' }, registered('Calibri')).reason).toBe(
      'registered_face',
    );
  });

  it('an explicit fonts.map override wins over a registered real face', () => {
    const r = createFontResolver();
    r.map('Calibri', 'Tinos');
    // Even though Calibri is registered, the explicit map to Tinos takes precedence (still face-aware).
    expect(r.resolveFace('Calibri', { weight: '400', style: 'normal' }, registered('Calibri', 'Tinos'))).toEqual({
      logicalFamily: 'Calibri',
      physicalFamily: 'Tinos',
      reason: 'custom_mapping',
    });
  });

  it('when the mapped target lacks the face but the logical family is registered, use the real face (not missing)', () => {
    const r = createFontResolver();
    r.map('Calibri', 'Tinos'); // Tinos is Regular-only; real Calibri is registered for every face.
    const hasFace = (f: string, w: '400' | '700', s: 'normal' | 'italic') => {
      if (norm(f) === 'calibri') return true; // real Calibri: all faces
      if (norm(f) === 'tinos') return w === '400' && s === 'normal'; // Tinos: Regular only
      return false;
    };
    // Regular: the explicit map to Tinos applies (Tinos has Regular).
    expect(r.resolveFace('Calibri', { weight: '400', style: 'normal' }, hasFace)).toMatchObject({
      physicalFamily: 'Tinos',
      reason: 'custom_mapping',
    });
    // Bold: Tinos lacks it, but real Calibri Bold is registered -> render the real face, NOT a
    // fallback_face_absent that would be reported missing.
    expect(r.resolveFace('Calibri', { weight: '700', style: 'normal' }, hasFace)).toEqual({
      logicalFamily: 'Calibri',
      physicalFamily: 'Calibri',
      reason: 'registered_face',
    });
  });

  it('single-face substitute: maps the provided face, passes other faces through (fallback_face_absent)', () => {
    const r = createFontResolver();
    r.map('Georgia', 'Gelasio'); // a single-face clone, Regular-only registered (regularOnly)
    expect(r.resolveFace('Georgia', { weight: '400', style: 'normal' }, regularOnly)).toEqual({
      logicalFamily: 'Georgia',
      physicalFamily: 'Gelasio',
      reason: 'custom_mapping',
    });
    // Bold/italic: substitute lacks the face -> pass the LOGICAL family through, reported non-metric.
    expect(r.resolveFace('Georgia', { weight: '700', style: 'normal' }, regularOnly)).toEqual({
      logicalFamily: 'Georgia',
      physicalFamily: 'Georgia',
      reason: 'fallback_face_absent',
    });
    expect(r.resolveFace('Georgia', { weight: '400', style: 'italic' }, regularOnly).reason).toBe(
      'fallback_face_absent',
    );
    // CSS-stack variant: substitute only the present face; return the value UNCHANGED for an absent
    // face (so the painter never faux-styles the substitute's Regular).
    expect(r.resolvePhysicalFamilyForFace('Georgia, serif', { weight: '400', style: 'normal' }, regularOnly)).toBe(
      'Gelasio, serif',
    );
    expect(r.resolvePhysicalFamilyForFace('Georgia, serif', { weight: '700', style: 'normal' }, regularOnly)).toBe(
      'Georgia, serif',
    );
  });

  it('map to an UNREGISTERED physical family passes through (fallback_face_absent), never faux-styled', () => {
    const r = createFontResolver();
    r.map('Georgia', 'Some System Font'); // not bundled, not added via fonts.add() -> hasFace false
    expect(r.resolveFace('Georgia', { weight: '400', style: 'normal' }, noFaces)).toEqual({
      logicalFamily: 'Georgia',
      physicalFamily: 'Georgia',
      reason: 'fallback_face_absent',
    });
    expect(r.resolvePhysicalFamilyForFace('Georgia', { weight: '400', style: 'normal' }, noFaces)).toBe('Georgia');
  });

  it('an unmapped family with no substitute is as_requested regardless of hasFace', () => {
    const r = createFontResolver();
    expect(r.resolveFace('Aptos', { weight: '400', style: 'normal' }, noFaces)).toEqual({
      logicalFamily: 'Aptos',
      physicalFamily: 'Aptos',
      reason: 'as_requested',
    });
  });

  it('strips surrounding quotes from a quoted registered family (registered_face returns the bare family)', () => {
    const r = createFontResolver();
    // A quoted CSS primary for a registered real Calibri: physicalFamily MUST be the bare 'Calibri'
    // (case preserved), not '"Calibri"'. Otherwise the load/preload probe (faceProbe -> quoteFamily)
    // quotes it again and the browser probes a literal "Calibri" that never matches the registered face.
    expect(r.resolveFace('"Calibri", sans-serif', { weight: '400', style: 'normal' }, registered('Calibri'))).toEqual({
      logicalFamily: '"Calibri", sans-serif',
      physicalFamily: 'Calibri',
      reason: 'registered_face',
    });
    // The CSS paint variant KEEPS the quoted stack (valid CSS); measure awaits the bare family above.
    expect(
      r.resolvePhysicalFamilyForFace(
        '"Calibri", sans-serif',
        { weight: '400', style: 'normal' },
        registered('Calibri'),
      ),
    ).toBe('"Calibri", sans-serif');
  });

  it('strips quotes for as_requested and fallback_face_absent structured returns (case preserved)', () => {
    const r = createFontResolver();
    // as_requested: no provider; the bare, case-preserved family passes through.
    expect(r.resolveFace('"Aptos"', { weight: '400', style: 'normal' }, noFaces)).toMatchObject({
      physicalFamily: 'Aptos',
      reason: 'as_requested',
    });
    // fallback_face_absent: a mapped substitute that cannot supply the face -> the bare logical family.
    r.map('Georgia', 'Some System Font'); // unregistered target (noFaces) -> override known but no face
    expect(r.resolveFace('"Georgia"', { weight: '400', style: 'normal' }, noFaces)).toMatchObject({
      physicalFamily: 'Georgia',
      reason: 'fallback_face_absent',
    });
  });
});

describe('category_fallback (non-metric family fallback: Calibri Light -> Carlito)', () => {
  const norm = (f: string) => f.replace(/^["']|["']$/g, '').toLowerCase();
  const carlito = (f: string) => norm(f) === 'carlito'; // bundled Carlito is registered; Calibri Light is not
  const noFaces = () => false;
  const R400 = { weight: '400', style: 'normal' } as const;

  it('family-level: Calibri Light -> Carlito with reason category_fallback (NOT bundled_substitute)', () => {
    expect(resolveFontFamily('Calibri Light')).toEqual({
      logicalFamily: 'Calibri Light',
      physicalFamily: 'Carlito',
      reason: 'category_fallback',
    });
    // Calibri (Regular) stays a metric clone, unaffected.
    expect(resolveFontFamily('Calibri').reason).toBe('bundled_substitute');
    // CSS stack keeps fallbacks; case/quote-insensitive.
    expect(resolvePhysicalFamily('Calibri Light, sans-serif')).toBe('Carlito, sans-serif');
    expect(resolvePhysicalFamily('"calibri light"')).toBe('Carlito');
    expect(resolvePrimaryPhysicalFamily('Calibri Light, sans-serif')).toBe('Carlito');
  });

  it('face-aware: resolveFace maps Calibri Light -> Carlito (category_fallback) when Carlito has the face', () => {
    const r = createFontResolver();
    expect(r.resolveFace('Calibri Light', R400, carlito)).toEqual({
      logicalFamily: 'Calibri Light',
      physicalFamily: 'Carlito',
      reason: 'category_fallback',
    });
  });

  it('paint/measure: resolvePhysicalFamilyForFace swaps the stack to Carlito (incl. a quoted primary)', () => {
    const r = createFontResolver();
    expect(r.resolvePhysicalFamilyForFace('Calibri Light, sans-serif', R400, carlito)).toBe('Carlito, sans-serif');
    // The normalized swap guard swaps a quoted/cased primary too (not a raw physical !== parts[0]).
    expect(r.resolvePhysicalFamilyForFace('"Calibri Light"', R400, carlito)).toBe('Carlito');
  });

  it('category target lacking the face falls through to as_requested (no swap, NOT fallback_face_absent)', () => {
    const r = createFontResolver();
    // Carlito provides no faces here: there is no metric substitute that could be "absent".
    expect(r.resolveFace('Calibri Light', R400, noFaces)).toEqual({
      logicalFamily: 'Calibri Light',
      physicalFamily: 'Calibri Light',
      reason: 'as_requested',
    });
    expect(r.resolvePhysicalFamilyForFace('Calibri Light, sans-serif', R400, noFaces)).toBe('Calibri Light, sans-serif');
  });

  it('a customer fonts.map still overrides the category fallback (custom_mapping wins)', () => {
    const r = createFontResolver();
    r.map('Calibri Light', 'Customer Light');
    expect(r.resolveFontFamily('Calibri Light')).toEqual({
      logicalFamily: 'Calibri Light',
      physicalFamily: 'Customer Light',
      reason: 'custom_mapping',
    });
  });
});
