/**
 * SD-3400 fuzzer: drives a long randomized (seeded) sequence of REAL
 * keystrokes inside a note session and asserts after every step that
 * (a) no paragraph ever loses its FootnoteText style and
 * (b) once paint settles, the caret overlay sits on the painted line that
 *     contains the selection head.
 */
import { test, expect } from '../../fixtures/superdoc.js';
import { BASIC_FOOTNOTES_DOC_PATH } from '../../helpers/story-fixtures.js';

test.use({ config: { showCaret: true, showSelection: true } });
test.setTimeout(240_000);

// Deterministic PRNG so failures replay exactly.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = ['sdfsadfsd', 'asdf', 'sadf', 'dsfadsfad', 'fasd', 'sdafasdfasdfsdaf', 'x'];

for (const seed of [0x5d3400, 0xbeef01, 0xc0ffee]) {
test(`fuzz(seed=${seed}): real keystroke ops never lose the note style or the caret`, async ({ superdoc }) => {
  await superdoc.loadDocument(BASIC_FOOTNOTES_DOC_PATH);
  await superdoc.waitForStable();

  const note = superdoc.page.locator('[data-block-id^="footnote-1-"]').first();
  await note.scrollIntoViewIfNeeded();
  const box = await note.boundingBox();
  await superdoc.page.mouse.dblclick(box!.x + 40, box!.y + box!.height / 2);
  await superdoc.waitForStable();
  await superdoc.page.keyboard.press('End');

  // Seed a LONG paragraph so the painted note has wrapped lines (the
  // user's screenshots show typing inside wrapped continuation lines).
  await superdoc.page.keyboard.press('Enter');
  await superdoc.page.keyboard.type(
    'dsfsadfsdafasdfdasfdsafasdfasdfsdafdsafdsafsdfdasfdsafsdadsaf sdfsadfsdfsdf sdf sdfs dfsdf sdf sdf sdfaf dsfadsfad sfasdfasdfas dfdsf asdfasdfas sdafasdfasdfsdaf asdf sadf',
  );
  await superdoc.waitForStable(600);

  const rand = mulberry32(seed);
  const ops: string[] = [];

  const checkStyles = async (opLog: string) => {
    const bad = await superdoc.page.evaluate(() => {
      const sed = (window as any).editor?.presentationEditor?.getActiveEditor?.();
      const out: string[] = [];
      sed?.state?.doc?.forEach((n: any) => {
        if ((n.attrs?.paragraphProperties?.styleId ?? null) !== 'FootnoteText') {
          out.push(`${n.attrs?.paragraphProperties?.styleId ?? 'NONE'}:${(n.textContent || '<empty>').slice(0, 12)}`);
        }
      });
      return out;
    });
    expect(bad, `style lost after ops: ${opLog}`).toEqual([]);
  };

  const checkCaret = async (opLog: string) => {
    const evalCheck = () =>
      superdoc.page.evaluate(() => {
        const sed = (window as any).editor?.presentationEditor?.getActiveEditor?.();
        const doc = sed?.state?.doc;
        const head = sed?.state?.selection?.head ?? -1;
        if (!doc || head < 0) return { ok: false, why: 'no editor', head };
        const caret = document.querySelector('.presentation-editor__selection-caret');
        const cr = caret?.getBoundingClientRect();
        if (!cr || cr.height === 0) return { ok: false, why: 'no caret', head };

        // Ground truth from the SESSION doc: block identity + local text offset.
        const $pos = doc.resolve(Math.min(head, doc.content.size));
        let blockDepth = 0;
        for (let d = $pos.depth; d >= 1; d -= 1) if ($pos.node(d).isBlock) blockDepth = d;
        if (!blockDepth) return { ok: true, why: 'no block', head };
        const blockNode = $pos.node(blockDepth);
        const sdBlockId = blockNode.attrs?.sdBlockId ?? '';
        const blockPos = $pos.before(blockDepth);
        let firstLeaf: number | null = null;
        doc.nodesBetween(blockPos, blockPos + blockNode.nodeSize, (n: any, p: number) => {
          if (firstLeaf != null) return false;
          if (n.isInline && (n.isLeaf || n.isText)) { firstLeaf = p; return false; }
          return true;
        });
        const localOff = Math.max(0, head - (firstLeaf ?? head));

        const fragments = Array.from(
          document.querySelectorAll(`[data-block-id$="${sdBlockId}"]`),
        ) as HTMLElement[];
        if (!fragments.length) return { ok: true, why: 'fragment unpainted', head };
        const lines = fragments
          .flatMap((f) => Array.from(f.querySelectorAll('.superdoc-line')) as HTMLElement[])
          .map((l) => ({ top: Math.round(l.getBoundingClientRect().top), el: l }))
          .sort((a, b) => a.top - b.top);
        if (!lines.length) return { ok: true, why: 'no lines', head };

        // cumulative visible text per line (pm-attr leaf spans only; the
        // synthetic marker span carries no pm attrs).
        let cum = 0;
        const acceptableTops: number[] = [];
        for (const { top, el } of lines) {
          const len = (Array.from(el.querySelectorAll('[data-pm-start][data-pm-end]')) as HTMLElement[])
            .filter((sp) => !sp.querySelector('[data-pm-start]'))
            .reduce((a, sp) => a + (sp.textContent?.length ?? 0), 0);
          // boundary tolerance: wrap points trim a space, so allow +-1 char
          if (localOff >= cum - 1 && localOff <= cum + len + 1) acceptableTops.push(top);
          cum += len;
        }
        if (!acceptableTops.length) acceptableTops.push(lines[lines.length - 1].top);
        const ok = acceptableTops.some((t) => Math.abs(cr.top - t) < 4);
        const fragDump = fragments.map((f) => ({
          top: Math.round(f.getBoundingClientRect().top),
          id: (f.getAttribute('data-block-id') ?? '').slice(9, 22),
          lines: (Array.from(f.querySelectorAll('.superdoc-line')) as HTMLElement[]).map((l) => ({
            s: l.dataset.pmStart,
            e: l.dataset.pmEnd,
            top: Math.round(l.getBoundingClientRect().top),
            text: (l.textContent ?? '').slice(0, 10),
          })),
        }));
        return {
          ok,
          why: `caret ${Math.round(cr.top)} not in block ${sdBlockId.slice(0, 8)} lines [${acceptableTops.join(',')}] localOff=${localOff} head=${head} firstLeaf=${firstLeaf} frags=${JSON.stringify(fragDump)}`,
          head,
        };
      });

    const res = await evalCheck();
    if (!res.ok) {
      await superdoc.page.waitForTimeout(700);
      const recheck = await evalCheck();
      expect(recheck.ok, `caret off after ops: ${opLog} :: first(${res.why}) recheck(PERSISTENT ${recheck.why}) head=${recheck.head}`).toBe(true);
      console.log(`TRANSIENT caret mismatch after: ${opLog} :: ${res.why}`);
    }
  };

  for (let i = 0; i < 120; i += 1) {
    const r = rand();
    let op: string;
    if (r < 0.35) {
      const word = WORDS[Math.floor(rand() * WORDS.length)];
      op = `type:${word}`;
      await superdoc.page.keyboard.type(word + (rand() < 0.5 ? ' ' : ''));
    } else if (r < 0.55) {
      op = 'Enter';
      await superdoc.page.keyboard.press('Enter');
    } else if (r < 0.7) {
      op = 'Backspace';
      await superdoc.page.keyboard.press('Backspace');
    } else if (r < 0.78) {
      op = 'ArrowUp';
      await superdoc.page.keyboard.press('ArrowUp');
    } else if (r < 0.86) {
      op = 'ArrowDown';
      await superdoc.page.keyboard.press('ArrowDown');
    } else if (r < 0.92) {
      op = 'ArrowLeft';
      await superdoc.page.keyboard.press('ArrowLeft');
    } else if (r < 0.96) {
      op = 'End';
      await superdoc.page.keyboard.press('End');
    } else {
      op = 'Home';
      await superdoc.page.keyboard.press('Home');
    }
    ops.push(op);

    // Style integrity is checked EVERY step (cheap).
    await checkStyles(ops.slice(-12).join(' > '));

    // Caret correctness checked every 5 steps after settle (RAF paint).
    if (i % 5 === 4) {
      await superdoc.waitForStable(400);
      await checkCaret(ops.slice(-12).join(' > '));
    }
  }

  // Final full settle check.
  await superdoc.waitForStable(800);
  await checkCaret(ops.slice(-15).join(' > '));
  await checkStyles('final');
});
}
