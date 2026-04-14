import { describe, it, expect } from 'vitest';
import postcss from 'postcss';
import wrapInLayer from './wrap-in-layer.cjs';

async function run(input, opts) {
  const result = await postcss([wrapInLayer(opts)]).process(input, { from: undefined });
  return result.css;
}

function normalize(css) {
  return css.replace(/\s+/g, ' ').trim();
}

describe('wrap-in-layer postcss plugin', () => {
  it('wraps top-level rules in @layer superdoc by default', async () => {
    const out = await run('.foo { color: red; }');
    expect(out).toMatch(/@layer superdoc\s*\{/);
    expect(normalize(out)).toContain('.foo { color: red; }');
  });

  it('uses a custom layer name', async () => {
    const out = await run('.foo { color: red; }', { layerName: 'vendor' });
    expect(out).toMatch(/@layer vendor\s*\{/);
  });

  it('preserves @charset and @import at the top, wraps the rest', async () => {
    const input = `@charset "utf-8"; @import 'tippy.js/dist/tippy.css'; .foo { color: red; }`;
    const out = await run(input);
    const flat = normalize(out);
    expect(flat.startsWith('@charset')).toBe(true);
    const importIdx = flat.indexOf("@import 'tippy.js/dist/tippy.css'");
    const layerIdx = flat.indexOf('@layer superdoc');
    expect(importIdx).toBeGreaterThan(-1);
    expect(layerIdx).toBeGreaterThan(importIdx);
  });

  it('wraps at-rules like @media and @keyframes', async () => {
    const input = `@media (min-width: 640px) { .foo { color: red; } } @keyframes sd-spin { to { transform: rotate(360deg); } }`;
    const out = await run(input);
    expect(out).toMatch(/@layer superdoc\s*\{/);
    expect(out.indexOf('@layer superdoc')).toBeLessThan(out.indexOf('@media'));
    expect(out.indexOf('@layer superdoc')).toBeLessThan(out.indexOf('@keyframes'));
  });

  it('is idempotent when input is already a single @layer with the same name', async () => {
    const input = `@layer superdoc { .foo { color: red; } }`;
    const out = await run(input);
    const layerCount = (out.match(/@layer superdoc/g) || []).length;
    expect(layerCount).toBe(1);
  });

  it('wraps a differently-named @layer (nested layers are allowed)', async () => {
    const input = `@layer reset { .foo { color: red; } }`;
    const out = await run(input);
    expect(out).toContain('@layer superdoc');
    expect(out).toContain('@layer reset');
    expect(out.indexOf('@layer superdoc')).toBeLessThan(out.indexOf('@layer reset'));
  });

  it('is a no-op on empty input', async () => {
    const out = await run('');
    expect(out).toBe('');
  });

  it('handles mixed @import followed by rules then more at-rules', async () => {
    const input = `@import 'a.css'; .foo {} @media (x) { .b {} }`;
    const out = await run(input);
    const flat = normalize(out);
    expect(flat.startsWith("@import 'a.css';")).toBe(true);
    expect(flat).toMatch(/@layer superdoc\s*\{/);
    expect(flat).toContain('.foo');
    expect(flat).toContain('@media (x)');
  });
});
