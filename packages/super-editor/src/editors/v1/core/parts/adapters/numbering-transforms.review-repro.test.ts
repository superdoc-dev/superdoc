import { describe, it, expect } from 'vitest';
import { cloneListDefinitionWithLevelStyle, type NumberingModel } from './numbering-transforms';

const findLvl = (abstractDef: any, ilvl: string) =>
  abstractDef?.elements?.find((el: any) => el.name === 'w:lvl' && el.attributes?.['w:ilvl'] === ilvl);
const findChild = (parent: any, name: string) => parent?.elements?.find((el: any) => el.name === name);

/**
 * Repro tests for two findings raised in PR #2873 round-2 review.
 *
 * These tests document the CURRENT (buggy) behavior. They pass on the PR head;
 * they will fail once the bugs are fixed - rename the assertions then.
 */

describe('[review-repro] cloneListDefinitionWithLevelStyle - lvlOverride drop', () => {
  it('drops w:lvlOverride / w:startOverride from the source num when cloning', () => {
    // Numbering model: one abstract with a single ordered level, one num with
    // a w:startOverride that says "this list restarts at 5".
    const numbering: NumberingModel = {
      abstracts: {
        0: {
          type: 'element',
          name: 'w:abstractNum',
          attributes: { 'w:abstractNumId': '0' },
          elements: [
            {
              type: 'element',
              name: 'w:lvl',
              attributes: { 'w:ilvl': '0' },
              elements: [
                { type: 'element', name: 'w:numFmt', attributes: { 'w:val': 'decimal' } },
                { type: 'element', name: 'w:lvlText', attributes: { 'w:val': '%1.' } },
              ],
            },
          ],
        },
      },
      definitions: {
        5: {
          type: 'element',
          name: 'w:num',
          attributes: { 'w:numId': '5' },
          elements: [
            { type: 'element', name: 'w:abstractNumId', attributes: { 'w:val': '0' } },
            // The user's source num has a level override saying "restart at 5".
            {
              type: 'element',
              name: 'w:lvlOverride',
              attributes: { 'w:ilvl': '0' },
              elements: [{ type: 'element', name: 'w:startOverride', attributes: { 'w:val': '5' } }],
            },
          ],
        },
      },
    } as any;

    const result = cloneListDefinitionWithLevelStyle(numbering, 5, 0, { orderedStyle: 'upper-roman' });

    expect(result).not.toBeNull();
    const newNumDef = numbering.definitions[result!.newNumId];
    const newOverrides = newNumDef.elements.filter((el: any) => el.name === 'w:lvlOverride');

    // BUG: clone path uses `buildNumDef` which creates a bare num pointing at
    // the new abstract. Source `w:lvlOverride` / `w:startOverride` entries are
    // discarded, so the restyled list silently restarts at 1 instead of 5.
    expect(newOverrides).toHaveLength(0);

    // What the fix should produce instead (uncomment when the bug is fixed):
    // expect(newOverrides).toHaveLength(1);
    // expect(findChild(newOverrides[0], 'w:startOverride').attributes['w:val']).toBe('5');
  });
});

describe('[review-repro] cloneListDefinitionWithLevelStyle - numStyleLink no-op', () => {
  it('returns success but never writes the requested style on a numStyleLink list', () => {
    // Real-world shape: an abstract that is a `w:numStyleLink` wrapper (no
    // w:lvl elements - the actual levels live on the linked numbering style).
    // Word's built-in "List Bullet" / "List Number" styles use this construct,
    // and listImporter.js:138-143 follows it via getListNumIdFromStyleRef.
    const numbering: NumberingModel = {
      abstracts: {
        // The link wrapper - no w:lvl, just w:numStyleLink pointing elsewhere.
        0: {
          type: 'element',
          name: 'w:abstractNum',
          attributes: { 'w:abstractNumId': '0' },
          elements: [{ type: 'element', name: 'w:numStyleLink', attributes: { 'w:val': 'ListBullet' } }],
        },
        // The real abstract carrying the levels (would normally be reached
        // via the style-id lookup in listImporter).
        1: {
          type: 'element',
          name: 'w:abstractNum',
          attributes: { 'w:abstractNumId': '1' },
          elements: [
            {
              type: 'element',
              name: 'w:lvl',
              attributes: { 'w:ilvl': '0' },
              elements: [
                { type: 'element', name: 'w:numFmt', attributes: { 'w:val': 'bullet' } },
                { type: 'element', name: 'w:lvlText', attributes: { 'w:val': '•' } },
              ],
            },
          ],
        },
      },
      definitions: {
        5: {
          type: 'element',
          name: 'w:num',
          attributes: { 'w:numId': '5' },
          elements: [{ type: 'element', name: 'w:abstractNumId', attributes: { 'w:val': '0' } }],
        },
      },
    } as any;

    const result = cloneListDefinitionWithLevelStyle(numbering, 5, 0, { orderedStyle: 'upper-roman' });

    // BUG #1: the function reports success even though the requested style
    // was never written. Toolbar callers (toggleList.js:199) treat non-null
    // as "migrate paragraphs to the new numId", so the user clicks the style
    // picker, paragraphs migrate to a clone of the link wrapper, and the
    // marker text is unchanged. From the user's POV: silent no-op.
    expect(result).not.toBeNull();

    // BUG #2: the cloned abstract is still a link wrapper - no w:lvl element
    // for the requested style to land on.
    const newAbstract = numbering.abstracts[result!.newAbstractId];
    expect(findLvl(newAbstract, '0')).toBeUndefined();

    // BUG #3: the requested upperRoman style is nowhere in the cloned model.
    const allLvlsAcrossAbstracts = Object.values(numbering.abstracts).flatMap(
      (a: any) => a.elements?.filter((el: any) => el.name === 'w:lvl') ?? [],
    );
    const requestedFmtPresent = allLvlsAcrossAbstracts.some((lvl: any) => {
      const numFmt = findChild(lvl, 'w:numFmt');
      return numFmt?.attributes?.['w:val'] === 'upperRoman';
    });
    expect(requestedFmtPresent).toBe(false);

    // What a fix should produce: either return null (so toggleList.js
    // continues without migrating), or resolve the numStyleLink target via
    // getListDefinitionDetails and write the style onto the linked abstract's
    // clone. Either way the toolbar should never silently no-op on
    // style-linked lists.
  });
});
