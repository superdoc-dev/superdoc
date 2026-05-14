/* @vitest-environment jsdom */

/**
 * Regression coverage for `editor.doc.create.contentControl({ at })`
 * wrapping by explicit text offsets.
 *
 * Locks in two behaviors:
 *   1. A single wrap targets the exact offsets passed in.
 *   2. Multiple wraps inserted in reverse position order (the pattern
 *      AI-driven citation tooling uses to anchor several phrases in one
 *      paragraph) each land on the correct phrase.
 *
 * Originated from SD-3108, which reported an off-by-one shift on the
 * harvey-anchor-experiment branch. The bug did not reproduce on main;
 * these tests stay to guard against a regression.
 */

import { describe, expect, it } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';

const HOST = 'The court ruled in Alpha Corp v. SEC today.';
const PHRASE = 'Alpha Corp v. SEC';

function resolveBlockId(receipt: unknown): string | null {
  if (!receipt || typeof receipt !== 'object') return null;
  const v = receipt as {
    target?: { blockId?: unknown };
    resolution?: { target?: { blockId?: unknown } };
  };
  if (typeof v.target?.blockId === 'string' && v.target.blockId) return v.target.blockId;
  if (typeof v.resolution?.target?.blockId === 'string' && v.resolution.target.blockId) {
    return v.resolution.target.blockId;
  }
  return null;
}

describe('content control wrap by text offset (regression)', () => {
  it('wraps exactly the phrase indicated by the start/end offsets', async () => {
    const docData = await loadTestDataForEditorTests('blank-doc.docx');
    const { editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
      isHeadless: true,
      user: { name: 'Test', email: 'test@example.com' },
    });

    const seed = await Promise.resolve(editor.doc.insert({ value: HOST }));
    const blockId = resolveBlockId(seed);
    expect(blockId).toBeTruthy();
    if (!blockId) return;

    const start = HOST.indexOf(PHRASE);
    const end = start + PHRASE.length;
    expect(HOST.slice(start, end)).toBe(PHRASE);

    const result = await Promise.resolve(
      editor.doc.create.contentControl({
        kind: 'inline',
        controlType: 'text',
        at: {
          kind: 'selection',
          start: { kind: 'text', blockId, offset: start },
          end: { kind: 'text', blockId, offset: end },
        },
        tag: '_sd_test_wrap',
        alias: 'Test wrap',
      }),
    );
    expect(result.success).toBe(true);

    // Inspect what the SDT actually wraps. Walk the PM tree for the SDT
    // with our tag and read its text content.
    let wrappedText: string | null = null;
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'structuredContent' && node.attrs?.tag === '_sd_test_wrap') {
        wrappedText = node.textContent;
        return false;
      }
      return true;
    });

    expect(wrappedText).toBe(PHRASE);

    editor.destroy();
  });

  it('wraps the correct text when multiple SDTs are inserted into the same paragraph', async () => {
    // Mirrors the Harvey demo: three citations in one paragraph, wrapped
    // in reverse position order (so earlier offsets stay valid as wraps
    // accumulate). Each wrap should land on its phrase exactly.
    const HOST_MULTI =
      'The court in Alpha Corp v. SEC established the standard for ' +
      'disclosure obligations. Our standard indemnification clause governs ' +
      'allocation of risks.';
    const PHRASES = ['Alpha Corp v. SEC', 'standard indemnification clause'];

    const docData = await loadTestDataForEditorTests('blank-doc.docx');
    const { editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
      isHeadless: true,
      user: { name: 'Test', email: 'test@example.com' },
    });

    const seed = await Promise.resolve(editor.doc.insert({ value: HOST_MULTI }));
    const blockId = resolveBlockId(seed);
    expect(blockId).toBeTruthy();
    if (!blockId) return;

    const insertionOrder = PHRASES.map((phrase, i) => ({
      phrase,
      tag: `_sd_multi_${i}`,
      start: HOST_MULTI.indexOf(phrase),
      end: HOST_MULTI.indexOf(phrase) + phrase.length,
    })).sort((a, b) => b.start - a.start);

    for (const { phrase, tag, start, end } of insertionOrder) {
      const result = await Promise.resolve(
        editor.doc.create.contentControl({
          kind: 'inline',
          controlType: 'text',
          at: {
            kind: 'selection',
            start: { kind: 'text', blockId, offset: start },
            end: { kind: 'text', blockId, offset: end },
          },
          tag,
          alias: 'Test multi wrap',
        }),
      );
      expect(result.success, `wrap for "${phrase}"`).toBe(true);
    }

    const wrappedTexts = new Map<string, string>();
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'structuredContent' && typeof node.attrs?.tag === 'string') {
        const tag = node.attrs.tag as string;
        if (tag.startsWith('_sd_multi_')) wrappedTexts.set(tag, node.textContent);
      }
      return true;
    });

    for (const { phrase, tag } of insertionOrder) {
      expect(wrappedTexts.get(tag), `tag ${tag} should wrap "${phrase}"`).toBe(phrase);
    }

    editor.destroy();
  });
});
