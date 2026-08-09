import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import type { LayoutStoryLocator } from '@superdoc/contracts';
import {
  classifyRequirement,
  createPositionValidationCollector,
  resolveStoryKind,
  type PositionRunKind,
  type PositionValidationSection,
  type RunPositionObservation,
} from './pm-position-validation.js';

const obs = (over: Partial<RunPositionObservation> = {}): RunPositionObservation => ({
  runKind: 'text',
  section: 'body',
  pmStart: 1,
  pmEnd: 4,
  ...over,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolveStoryKind', () => {
  it('prefers the story locator kind when present', () => {
    expect(resolveStoryKind('body', { kind: 'header', id: 'rId3' })).toBe('header');
    expect(resolveStoryKind('header', { kind: 'footnote' })).toBe('footnote');
  });

  it('falls back to the section, never defaulting a non-body section to body', () => {
    expect(resolveStoryKind('body', undefined)).toBe('body');
    expect(resolveStoryKind('header', undefined)).toBe('header');
    expect(resolveStoryKind('footer', undefined)).toBe('footer');
  });
});

describe('classifyRequirement', () => {
  it('requires legacy PM for every run under the legacy-pm model', () => {
    expect(classifyRequirement('legacy-pm', 'body', false)).toBe('legacy-pm-required');
    // Even a named furniture story is PM-required under v1 semantics.
    expect(classifyRequirement('legacy-pm', 'header', false)).toBe('legacy-pm-required');
  });

  it('keeps v2 body on the compatibility-PM requirement', () => {
    expect(classifyRequirement('editor-neutral-story', 'body', false)).toBe('legacy-pm-required');
  });

  it('treats v2 named stories as story-identity, not PM', () => {
    for (const kind of ['header', 'footer', 'footnote', 'endnote', 'textbox'] as const) {
      expect(classifyRequirement('editor-neutral-story', kind, false)).toBe('story-identity-required');
    }
  });

  it('fails closed on an unknown story (never defaults to body)', () => {
    expect(classifyRequirement('editor-neutral-story', 'unknown', false)).toBe('not-addressable');
  });

  it('classifies render-only fields as visual-only regardless of model/story', () => {
    expect(classifyRequirement('legacy-pm', 'body', true)).toBe('visual-only');
    expect(classifyRequirement('editor-neutral-story', 'footer', true)).toBe('visual-only');
  });
});

describe('PositionValidationCollector — dark by default', () => {
  it('records nothing and reports empty when disabled', () => {
    const c = createPositionValidationCollector();
    expect(c.isEnabled).toBe(false);
    c.record(obs({ pmStart: null, pmEnd: null }));
    const s = c.consume();
    expect(s.enabled).toBe(false);
    expect(s.checked).toBe(0);
    expect(s.issues).toBe(0);
  });
});

describe('PositionValidationCollector — legacy-pm body coverage', () => {
  it('passes a body run with a complete PM span', () => {
    const c = createPositionValidationCollector({ enabled: true, coordinateModel: 'legacy-pm' });
    c.record(obs());
    const s = c.consume();
    expect(s.checked).toBe(1);
    expect(s.valid).toBe(1);
    expect(s.issues).toBe(0);
    expect(s.byRequirement['legacy-pm-required'].valid).toBe(1);
  });

  it('flags missing-both / missing-start / missing-end / invalid-range', () => {
    const c = createPositionValidationCollector({ enabled: true, coordinateModel: 'legacy-pm' });
    c.record(obs({ pmStart: null, pmEnd: null }));
    c.record(obs({ pmStart: null }));
    c.record(obs({ pmEnd: null }));
    c.record(obs({ pmStart: 9, pmEnd: 4 }));
    const s = c.consume();
    expect(s.checked).toBe(4);
    expect(s.issues).toBe(4);
    expect(s.issuesByCode['missing-both']).toBe(1);
    expect(s.issuesByCode['missing-start']).toBe(1);
    expect(s.issuesByCode['missing-end']).toBe(1);
    expect(s.issuesByCode['invalid-range']).toBe(1);
  });
});

describe('PositionValidationCollector — v2 story awareness', () => {
  const header: LayoutStoryLocator = { kind: 'header', id: 'rId5' };

  it('does NOT flag a named furniture run that lacks a document-global PM span', () => {
    const c = createPositionValidationCollector({ enabled: true, coordinateModel: 'editor-neutral-story' });
    // The exact shape of the 18,323 warnings: header text, no PM. Now a non-issue.
    c.record(obs({ section: 'header', story: header, pmStart: null, pmEnd: null }));
    const s = c.consume();
    expect(s.checked).toBe(1);
    expect(s.issues).toBe(0);
    expect(s.valid).toBe(1);
    expect(s.byRequirement['story-identity-required'].valid).toBe(1);
    expect(s.byRequirement['legacy-pm-required'].checked).toBe(0);
  });

  it('still requires compatibility PM on a v2 body run', () => {
    const c = createPositionValidationCollector({ enabled: true, coordinateModel: 'editor-neutral-story' });
    c.record(obs({ pmStart: null, pmEnd: null }));
    const s = c.consume();
    expect(s.issues).toBe(1);
    expect(s.issuesByCode['missing-both']).toBe(1);
  });

  it('fails closed on an unknown story', () => {
    const c = createPositionValidationCollector({ enabled: true, coordinateModel: 'editor-neutral-story' });
    c.record(obs({ section: 'body', story: { kind: 'unknown' }, pmStart: null, pmEnd: null }));
    const s = c.consume();
    expect(s.issues).toBe(1);
    expect(s.issuesByCode['unexpected-story']).toBe(1);
    expect(s.byRequirement['not-addressable'].issues).toBe(1);
  });

  it('requires a non-empty identity for named stories', () => {
    const c = createPositionValidationCollector({ enabled: true, coordinateModel: 'editor-neutral-story' });
    c.record(obs({ section: 'header', story: { kind: 'header', id: '' }, pmStart: null, pmEnd: null }));
    const s = c.consume();
    expect(s.issuesByCode['identity-missing']).toBe(1);
  });

  it('fails closed when furniture section and story disagree', () => {
    const c = createPositionValidationCollector({ enabled: true, coordinateModel: 'editor-neutral-story' });
    c.record(obs({ section: 'body', story: header, pmStart: null, pmEnd: null }));
    const s = c.consume();
    expect(s.issuesByCode['story-section-mismatch']).toBe(1);
  });

  it('accepts a named textbox as a nested story in page furniture', () => {
    const c = createPositionValidationCollector({ enabled: true, coordinateModel: 'editor-neutral-story' });
    c.record(
      obs({
        section: 'header',
        story: { kind: 'textbox', id: 'header1-tb0' },
        pmStart: null,
        pmEnd: null,
      }),
    );
    const s = c.consume();
    expect(s.issues).toBe(0);
    expect(s.byRequirement['story-identity-required'].valid).toBe(1);
  });

  it('treats a render-only page-number field as visual-only (no coordinate claim)', () => {
    const c = createPositionValidationCollector({ enabled: true, coordinateModel: 'editor-neutral-story' });
    c.record(
      obs({
        section: 'footer',
        story: { kind: 'footer', id: 'rId9' },
        renderOnly: true,
        pmStart: null,
        pmEnd: null,
      }),
    );
    const s = c.consume();
    expect(s.issues).toBe(0);
    expect(s.byRequirement['visual-only'].valid).toBe(1);
  });
});

describe('PositionValidationCollector — isolation and reset', () => {
  it('keeps two collectors independent', () => {
    const a = createPositionValidationCollector({
      enabled: true,
      coordinateModel: 'legacy-pm',
      paintKind: 'persistent-page',
    });
    const b = createPositionValidationCollector({
      enabled: true,
      coordinateModel: 'legacy-pm',
      paintKind: 'persistent-page-oracle',
    });
    a.record(obs({ pmStart: null, pmEnd: null }));
    b.record(obs());
    const sa = a.consume();
    const sb = b.consume();
    expect(sa.issues).toBe(1);
    expect(sa.paintKind).toBe('persistent-page');
    expect(sb.issues).toBe(0);
    expect(sb.paintKind).toBe('persistent-page-oracle');
  });

  it('resets on consume', () => {
    const c = createPositionValidationCollector({ enabled: true });
    c.record(obs());
    expect(c.consume().checked).toBe(1);
    expect(c.consume().checked).toBe(0);
  });
});

describe('PositionValidationCollector — console policy', () => {
  it('off: never touches the console even with issues', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const c = createPositionValidationCollector({ enabled: true, policy: 'off' });
    c.record(obs({ pmStart: null, pmEnd: null }));
    c.consume();
    expect(warn).not.toHaveBeenCalled();
  });

  it('summary: exactly one content-free line per pass, only when issues > 0', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const c = createPositionValidationCollector({ enabled: true, policy: 'summary' });
    c.record(obs()); // valid
    c.consume();
    expect(warn).not.toHaveBeenCalled();
    c.record(obs({ pmStart: null, pmEnd: null }));
    c.consume();
    expect(warn).toHaveBeenCalledTimes(1);
    // Content-free: the payload carries no document text.
    const payload = warn.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(payload)).not.toContain('text');
    expect(Object.keys(payload)).not.toContain('textPreview');
  });

  it('verbose: caps at 20 structural warnings, then counts the rest as suppressed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const c = createPositionValidationCollector({ enabled: true, coordinateModel: 'legacy-pm', policy: 'verbose' });
    const kinds: PositionRunKind[] = ['text', 'image', 'field', 'math'];
    const sections: PositionValidationSection[] = ['body', 'header', 'footer'];
    const storyKinds = ['body', 'header', 'footer', 'footnote', 'endnote', 'textbox', 'unknown'] as const;
    let count = 0;
    // Emit 25 distinct issue-bearing structural keys.
    outer: for (const sk of storyKinds) {
      for (const section of sections) {
        for (const runKind of kinds) {
          c.record(
            obs({
              runKind,
              section,
              story: { kind: sk },
              pmStart: null,
              pmEnd: null,
            }),
          );
          if (++count >= 25) break outer;
        }
      }
    }
    const s = c.consume();
    expect(warn.mock.calls.length).toBe(21);
    expect(s.suppressedConsole).toBe(5);
    // Independent of pages/runs: the same key repeated does not add warnings.
    warn.mockClear();
    const c2 = createPositionValidationCollector({ enabled: true, coordinateModel: 'legacy-pm', policy: 'verbose' });
    for (let i = 0; i < 1000; i++) c2.record(obs({ pmStart: null, pmEnd: null }));
    c2.consume();
    expect(warn.mock.calls.length).toBe(1);
  });
});

describe('PositionValidationCollector — bounds and privacy', () => {
  it('retains each unexpected structural key once in off mode', () => {
    const c = createPositionValidationCollector({ enabled: true, policy: 'off' });
    for (let index = 0; index < 100; index += 1) c.record(obs({ pmStart: null, pmEnd: null }));
    const s = c.consume();
    expect(s.issues).toBe(100);
    expect(s.unexpectedKeys).toHaveLength(1);
  });

  it('caps retained structural groups and counts the overflow', () => {
    const c = createPositionValidationCollector({ enabled: true, coordinateModel: 'editor-neutral-story' });
    const kinds: PositionRunKind[] = ['text', 'image', 'field', 'math'];
    const sections: PositionValidationSection[] = ['body', 'header', 'footer'];
    const storyKinds = ['body', 'header', 'footer', 'footnote', 'endnote', 'textbox', 'unknown'] as const;
    for (const sk of storyKinds) {
      for (const named of [true, false]) {
        for (const section of sections) {
          for (const runKind of kinds) {
            c.record(obs({ runKind, section, story: { kind: sk, ...(named ? { id: 'x' } : {}) } }));
          }
        }
      }
    }
    const s = c.consume();
    expect(s.groupCount).toBeLessThanOrEqual(64);
    expect(s.groupsOverflowed).toBeGreaterThan(0);
    expect(s.unexpectedKeys.length).toBeLessThanOrEqual(20);
    // Privacy: the serialized summary carries no text preview or document
    // content. `runKind: "text"` is a structural enum value, not content — the
    // real guard is that no preview/content field exists (and the observation
    // type has no text field, so document text cannot enter by construction).
    const serialized = JSON.stringify(s);
    expect(serialized).not.toContain('textPreview');
    expect(serialized).not.toContain('preview');
  });

  it('cannot carry document text: a sentinel run value never reaches the summary or console', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const SENTINEL = 'CONFIDENTIAL_CUSTOMER_STRING_9f3a';
    const c = createPositionValidationCollector({ enabled: true, coordinateModel: 'legacy-pm', policy: 'verbose' });
    // The observation API accepts no text field; the closest a caller could get
    // is a story id. Even that must never be echoed.
    c.record(obs({ story: { kind: 'header', id: SENTINEL }, pmStart: null, pmEnd: null }));
    const s = c.consume();
    expect(JSON.stringify(s)).not.toContain(SENTINEL);
    for (const call of warn.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(SENTINEL);
    }
  });
});
