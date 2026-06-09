import { describe, expect, it } from 'vitest';
import {
  buildFaceReport,
  buildFontReport,
  createFontResolver,
  type FontFaceRequest,
  type FontLoadStatus,
  type FontRegistry,
} from './index';

class FakeRegistry {
  readonly statuses = new Map<string, FontLoadStatus>();
  getStatus(family: string): FontLoadStatus {
    return this.statuses.get(family) ?? 'unloaded';
  }
  asRegistry(): FontRegistry {
    return this as unknown as FontRegistry;
  }
}

describe('buildFontReport', () => {
  it('reports requested -> rendered -> reason -> loadStatus -> export', () => {
    const reg = new FakeRegistry();
    reg.statuses.set('Carlito', 'loaded');
    expect(buildFontReport(['Calibri'], reg.asRegistry())).toEqual([
      {
        logicalFamily: 'Calibri',
        physicalFamily: 'Carlito',
        reason: 'bundled_substitute',
        loadStatus: 'loaded',
        exportFamily: 'Calibri',
        missing: false,
        evidence: {
          evidenceId: 'calibri',
          policyAction: 'substitute',
          verdict: 'metric_safe',
          lineBreakSafe: true,
        },
      },
    ]);
  });

  it('flags a genuinely missing font (no substitute + not loaded)', () => {
    const reg = new FakeRegistry();
    reg.statuses.set('Aptos', 'fallback_used');
    const [rec] = buildFontReport(['Aptos'], reg.asRegistry());
    expect(rec.reason).toBe('as_requested');
    expect(rec.missing).toBe(true);
    expect(rec.exportFamily).toBe('Aptos'); // export still preserves the requested name
  });

  it('an as_requested font that did load is not missing', () => {
    const reg = new FakeRegistry();
    reg.statuses.set('Verdana', 'loaded');
    expect(buildFontReport(['Verdana'], reg.asRegistry())[0].missing).toBe(false);
  });

  it('does not mark a transient unloaded state as missing (no early-pull over-report)', () => {
    const reg = new FakeRegistry();
    reg.statuses.set('Carlito', 'unloaded'); // registered but the gate has not awaited it yet
    const [rec] = buildFontReport(['Calibri'], reg.asRegistry());
    expect(rec.loadStatus).toBe('unloaded');
    expect(rec.missing).toBe(false);
  });

  it('flags a substitute whose asset failed to load as missing (cause kept in reason/loadStatus)', () => {
    const reg = new FakeRegistry();
    reg.statuses.set('Carlito', 'failed'); // e.g. the bundled .woff2 404s from a bad assetBaseUrl
    const [rec] = buildFontReport(['Calibri'], reg.asRegistry());
    expect(rec.physicalFamily).toBe('Carlito');
    expect(rec.reason).toBe('bundled_substitute');
    expect(rec.loadStatus).toBe('failed');
    expect(rec.missing).toBe(true); // broadened: a failed substitute renders wrong, so it is missing
  });

  it('covers bundled mappings and dedupes', () => {
    const reg = new FakeRegistry();
    for (const family of [
      'Carlito',
      'Caladea',
      'Liberation Sans',
      'Liberation Serif',
      'Liberation Mono',
      'Caprasimo',
      'Gelasio',
      'Noto Sans',
    ]) {
      reg.statuses.set(family, 'loaded');
    }
    const report = buildFontReport(
      ['Calibri', 'Cambria', 'Arial', 'Times New Roman', 'Courier New', 'Cooper Black', 'Georgia', 'Tahoma', 'Calibri'],
      reg.asRegistry(),
    );
    expect(report.map((r) => r.physicalFamily)).toEqual([
      'Carlito',
      'Caladea',
      'Liberation Sans',
      'Liberation Serif',
      'Liberation Mono',
      'Caprasimo',
      'Gelasio',
      'Noto Sans',
    ]);
    expect(report.find((r) => r.logicalFamily === 'Georgia')).toMatchObject({
      reason: 'bundled_substitute',
      missing: false,
    });
    expect(report.find((r) => r.logicalFamily === 'Tahoma')).toMatchObject({
      reason: 'category_fallback',
      missing: true,
    });
  });

  it('reports Calibri Light as a non-metric category_fallback and marks it missing even when loaded', () => {
    const reg = new FakeRegistry();
    reg.statuses.set('Carlito', 'loaded'); // the fallback family itself loads fine...
    const [rec] = buildFontReport(['Calibri Light'], reg.asRegistry());
    expect(rec.physicalFamily).toBe('Carlito');
    expect(rec.reason).toBe('category_fallback');
    // ...but it is NOT a metric clone (reflows + Regular weight), so it is reported missing.
    expect(rec.missing).toBe(true);
    expect(rec.exportFamily).toBe('Calibri Light');
  });
});

/** A face-aware fake: tracks per-face load status + which faces are registered (hasFace). */
class FaceRegistry {
  readonly faceStatuses = new Map<string, FontLoadStatus>();
  readonly registered = new Set<string>();
  #key(family: string, weight: string, style: string): string {
    return `${family.toLowerCase()}|${weight}|${style}`;
  }
  getStatus(): FontLoadStatus {
    return 'unloaded'; // family rollup unused by buildFaceReport
  }
  getFaceStatus(req: FontFaceRequest): FontLoadStatus {
    return this.faceStatuses.get(this.#key(req.family, req.weight, req.style)) ?? 'unloaded';
  }
  hasFace(family: string, weight: '400' | '700', style: 'normal' | 'italic'): boolean {
    return this.registered.has(this.#key(family, weight, style));
  }
  setFace(family: string, weight: '400' | '700', style: 'normal' | 'italic', status: FontLoadStatus): void {
    this.registered.add(this.#key(family, weight, style));
    this.faceStatuses.set(this.#key(family, weight, style), status);
  }
  setAwaitedFaceStatus(
    family: string,
    weight: '400' | '700',
    style: 'normal' | 'italic',
    status: FontLoadStatus,
  ): void {
    this.faceStatuses.set(this.#key(family, weight, style), status);
  }
  asRegistry(): FontRegistry {
    return this as unknown as FontRegistry;
  }
}

describe('buildFaceReport (face-level)', () => {
  it('single-face substitute: Regular substituted (faithful), Bold fallback_face_absent + missing', () => {
    const reg = new FaceRegistry();
    reg.setFace('Gelasio', '400', 'normal', 'loaded'); // custom target with only Regular registered
    // The planner adds the pass-through `Georgia 700` to requiredFaces, so the gate awaits it; an
    // unregistered family can never report `loaded` (document.fonts.load resolves only registered
    // faces, not system fonts), so in production it settles to `fallback_used` - model that, not the
    // prior unrealistic `unloaded`.
    reg.setAwaitedFaceStatus('Georgia', '700', 'normal', 'fallback_used');
    const resolver = createFontResolver();
    resolver.map('Georgia', 'Gelasio');
    const rows = buildFaceReport(
      [
        { logicalFamily: 'Georgia', weight: '400', style: 'normal' },
        { logicalFamily: 'Georgia', weight: '700', style: 'normal' },
      ],
      reg.asRegistry(),
      resolver,
    );
    expect(rows).toEqual([
      {
        logicalFamily: 'Georgia',
        physicalFamily: 'Gelasio',
        reason: 'custom_mapping',
        loadStatus: 'loaded',
        exportFamily: 'Georgia',
        missing: false, // Regular is faithfully substituted by Gelasio
        face: { weight: '400', style: 'normal' },
      },
      {
        logicalFamily: 'Georgia',
        physicalFamily: 'Georgia',
        reason: 'fallback_face_absent',
        loadStatus: 'fallback_used',
        exportFamily: 'Georgia',
        // Bold is NOT faithfully substituted (Gelasio has no Bold), so the family passes through and
        // the face is missing - deterministically, by reason. getMissingFonts() will list Georgia.
        missing: true,
        face: { weight: '700', style: 'normal' },
      },
    ]);
  });

  it('a registered real face for the logical family reports registered_face, not the bundled substitute', () => {
    const reg = new FaceRegistry();
    // A document/customer registered real Calibri faces (vs the bundled Carlito clone).
    reg.setFace('Calibri', '400', 'normal', 'loaded');
    reg.setFace('Calibri', '700', 'normal', 'loaded');
    const rows = buildFaceReport(
      [
        { logicalFamily: 'Calibri', weight: '400', style: 'normal' },
        { logicalFamily: 'Calibri', weight: '700', style: 'normal' },
      ],
      reg.asRegistry(),
    );
    expect(rows).toEqual([
      {
        logicalFamily: 'Calibri',
        physicalFamily: 'Calibri', // the real family, not Carlito
        reason: 'registered_face',
        loadStatus: 'loaded',
        exportFamily: 'Calibri',
        missing: false,
        face: { weight: '400', style: 'normal' },
      },
      {
        logicalFamily: 'Calibri',
        physicalFamily: 'Calibri',
        reason: 'registered_face',
        loadStatus: 'loaded',
        exportFamily: 'Calibri',
        missing: false,
        face: { weight: '700', style: 'normal' },
      },
    ]);
  });

  it('uses per-FACE status: a failed Bold face does not make the loaded Regular row missing', () => {
    const reg = new FaceRegistry();
    reg.setFace('Carlito', '400', 'normal', 'loaded');
    reg.setFace('Carlito', '700', 'normal', 'failed');
    const rows = buildFaceReport(
      [
        { logicalFamily: 'Calibri', weight: '400', style: 'normal' },
        { logicalFamily: 'Calibri', weight: '700', style: 'normal' },
      ],
      reg.asRegistry(),
    );
    const regular = rows.find((r) => r.face?.weight === '400');
    const bold = rows.find((r) => r.face?.weight === '700');
    expect(regular?.physicalFamily).toBe('Carlito');
    expect(regular?.loadStatus).toBe('loaded');
    expect(regular?.missing).toBe(false);
    expect(bold?.loadStatus).toBe('failed');
    expect(bold?.missing).toBe(true); // the bold face failed - reported missing, regular unaffected
  });

  it('hides the internal embedded alias: reports the logical family, but reads status via the alias', () => {
    const reg = new FaceRegistry();
    const PHYS = '__superdoc_embedded_3__0_Calibri';
    reg.setFace(PHYS, '400', 'normal', 'loaded'); // the embedded face is registered under the alias
    const resolver = createFontResolver();
    resolver.mapEmbedded('Calibri', PHYS);
    const [row] = buildFaceReport(
      [{ logicalFamily: 'Calibri', weight: '400', style: 'normal' }],
      reg.asRegistry(),
      resolver,
    );
    expect(row).toEqual({
      logicalFamily: 'Calibri',
      physicalFamily: 'Calibri', // the real name, NOT __superdoc_embedded_*
      reason: 'registered_face',
      loadStatus: 'loaded', // proves the status was looked up via the alias (where the face lives)
      exportFamily: 'Calibri',
      missing: false,
      face: { weight: '400', style: 'normal' },
    });
  });

  it('Calibri Light face resolves to Carlito (category_fallback) and stays missing though the face loaded', () => {
    const reg = new FaceRegistry();
    reg.setFace('Carlito', '400', 'normal', 'loaded'); // Carlito Regular registered + loaded
    const rows = buildFaceReport(
      [{ logicalFamily: 'Calibri Light', weight: '400', style: 'normal' }],
      reg.asRegistry(),
    );
    expect(rows[0]?.physicalFamily).toBe('Carlito');
    expect(rows[0]?.reason).toBe('category_fallback');
    // The face loaded, but it is a non-metric fallback (wrong weight), so it is still reported missing.
    expect(rows[0]?.missing).toBe(true);
  });
});

describe('verdict-aware evidence (rendered substitutes only)', () => {
  it('Calibri: metric_safe substitute, line-break safe', () => {
    const reg = new FakeRegistry();
    reg.statuses.set('Carlito', 'loaded');
    expect(buildFontReport(['Calibri'], reg.asRegistry())[0].evidence).toEqual({
      evidenceId: 'calibri',
      policyAction: 'substitute',
      verdict: 'metric_safe',
      lineBreakSafe: true,
    });
  });

  it('Calibri Light: category_fallback, visual_only, NOT line-break safe', () => {
    const reg = new FakeRegistry();
    reg.statuses.set('Carlito', 'loaded');
    expect(buildFontReport(['Calibri Light'], reg.asRegistry())[0].evidence).toEqual({
      evidenceId: 'calibri-light',
      policyAction: 'category_fallback',
      verdict: 'visual_only',
      lineBreakSafe: false,
    });
  });

  it('Cambria family: top-level worst-face verdict (visual_only), all glyph exceptions', () => {
    const reg = new FakeRegistry();
    reg.statuses.set('Caladea', 'loaded');
    const ev = buildFontReport(['Cambria'], reg.asRegistry())[0].evidence;
    expect(ev?.verdict).toBe('visual_only'); // NOT a clean clone, despite reason bundled_substitute
    expect(ev?.lineBreakSafe).toBe(false);
    expect(ev?.glyphExceptions).toMatchObject([{ slot: 'boldItalic', codepoint: 0x60 }]);
  });

  it('Cambria Regular face: per-face metric_safe, and NO unrelated (Bold Italic) glyph exception', () => {
    const reg = new FaceRegistry();
    reg.setFace('Caladea', '400', 'normal', 'loaded');
    const [row] = buildFaceReport([{ logicalFamily: 'Cambria', weight: '400', style: 'normal' }], reg.asRegistry());
    expect(row.reason).toBe('bundled_substitute');
    expect(row.evidence).toEqual({
      evidenceId: 'cambria',
      policyAction: 'substitute',
      verdict: 'metric_safe',
      lineBreakSafe: true,
    });
  });

  it('Cambria Bold Italic face: per-face visual_only, includes its grave-accent exception', () => {
    const reg = new FaceRegistry();
    reg.setFace('Caladea', '700', 'italic', 'loaded');
    const [row] = buildFaceReport([{ logicalFamily: 'Cambria', weight: '700', style: 'italic' }], reg.asRegistry());
    expect(row.reason).toBe('bundled_substitute');
    expect(row.evidence?.verdict).toBe('visual_only');
    expect(row.evidence?.lineBreakSafe).toBe(false);
    expect(row.evidence?.glyphExceptions).toMatchObject([{ slot: 'boldItalic', codepoint: 0x60 }]);
  });

  it('Cooper Black Regular face: metric_safe Caprasimo substitute', () => {
    const reg = new FaceRegistry();
    reg.setFace('Caprasimo', '400', 'normal', 'loaded');
    const [row] = buildFaceReport(
      [{ logicalFamily: 'Cooper Black', weight: '400', style: 'normal' }],
      reg.asRegistry(),
    );
    expect(row).toMatchObject({
      logicalFamily: 'Cooper Black',
      physicalFamily: 'Caprasimo',
      reason: 'bundled_substitute',
      missing: false,
    });
    expect(row.evidence).toEqual({
      evidenceId: 'cooper-black',
      policyAction: 'substitute',
      verdict: 'metric_safe',
      lineBreakSafe: true,
    });
  });

  it('Cooper Black Bold face: loads Caprasimo Regular as a qualified synthetic face', () => {
    const reg = new FaceRegistry();
    reg.setFace('Caprasimo', '400', 'normal', 'loaded');
    const [row] = buildFaceReport(
      [{ logicalFamily: 'Cooper Black', weight: '700', style: 'normal' }],
      reg.asRegistry(),
    );
    expect(row).toMatchObject({
      logicalFamily: 'Cooper Black',
      physicalFamily: 'Caprasimo',
      reason: 'bundled_substitute',
      loadStatus: 'loaded',
      missing: false,
      face: { weight: '700', style: 'normal' },
    });
    expect(row.evidence).toEqual({
      evidenceId: 'cooper-black',
      policyAction: 'substitute',
      verdict: 'visual_only',
      lineBreakSafe: false,
    });
  });

  it('attaches NO evidence for as_requested / custom_mapping / registered_face / fallback_face_absent', () => {
    // as_requested: Aptos has no substitute.
    const fam = new FakeRegistry();
    fam.statuses.set('Aptos', 'loaded');
    expect(buildFontReport(['Aptos'], fam.asRegistry())[0].evidence).toBeUndefined();

    // custom_mapping (Regular) + fallback_face_absent (Bold) via a single-face custom map.
    const face = new FaceRegistry();
    face.setFace('Gelasio', '400', 'normal', 'loaded');
    face.setAwaitedFaceStatus('Georgia', '700', 'normal', 'fallback_used');
    const resolver = createFontResolver();
    resolver.map('Georgia', 'Gelasio');
    const rows = buildFaceReport(
      [
        { logicalFamily: 'Georgia', weight: '400', style: 'normal' },
        { logicalFamily: 'Georgia', weight: '700', style: 'normal' },
      ],
      face.asRegistry(),
      resolver,
    );
    expect(rows.find((r) => r.reason === 'custom_mapping')?.evidence).toBeUndefined();
    expect(rows.find((r) => r.reason === 'fallback_face_absent')?.evidence).toBeUndefined();

    // registered_face: a real Calibri face registered for the logical family.
    const reg2 = new FaceRegistry();
    reg2.setFace('Calibri', '400', 'normal', 'loaded');
    const [calRow] = buildFaceReport([{ logicalFamily: 'Calibri', weight: '400', style: 'normal' }], reg2.asRegistry());
    expect(calRow.reason).toBe('registered_face');
    expect(calRow.evidence).toBeUndefined();
  });
});
