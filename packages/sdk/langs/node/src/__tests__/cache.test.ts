import { describe, expect, test } from 'bun:test';
import { chooseTools, getSystemPromptForProvider } from '../tools.ts';

describe('chooseTools cache markers', () => {
  test('anthropic + cache: marks the last tool with cache_control', async () => {
    const { tools, meta } = await chooseTools({ provider: 'anthropic', cache: true });
    expect(meta.provider).toBe('anthropic');
    expect(meta.cacheStrategy).toBe('explicit');
    expect(tools.length).toBeGreaterThan(0);
    const last = tools[tools.length - 1] as { cache_control?: { type: string } };
    expect(last.cache_control).toEqual({ type: 'ephemeral' });
    // Earlier tools should NOT carry cache_control.
    for (let i = 0; i < tools.length - 1; i++) {
      const t = tools[i] as { cache_control?: unknown };
      expect(t.cache_control).toBeUndefined();
    }
  });

  test('anthropic without cache: returns tools unchanged', async () => {
    const { tools, meta } = await chooseTools({ provider: 'anthropic' });
    expect(meta.cacheStrategy).toBe('disabled');
    for (const t of tools) {
      expect((t as { cache_control?: unknown }).cache_control).toBeUndefined();
    }
  });

  test('openai + cache: pass-through, reports automatic strategy', async () => {
    const { tools, meta } = await chooseTools({ provider: 'openai', cache: true });
    expect(meta.cacheStrategy).toBe('automatic');
    // No mutation, no markers.
    for (const t of tools) {
      expect((t as { cache_control?: unknown }).cache_control).toBeUndefined();
    }
  });

  test('vercel + cache: reports unsupported', async () => {
    const { meta } = await chooseTools({ provider: 'vercel', cache: true });
    expect(meta.cacheStrategy).toBe('unsupported');
  });

  test('does not mutate the underlying bundle on repeated calls', async () => {
    // First call with cache marks last tool.
    const a = await chooseTools({ provider: 'anthropic', cache: true });
    // Second call WITHOUT cache must return clean tools (no leftover marker).
    const b = await chooseTools({ provider: 'anthropic' });
    for (const t of b.tools) {
      expect((t as { cache_control?: unknown }).cache_control).toBeUndefined();
    }
    // First call's marker still present in its own snapshot (sanity).
    const lastA = a.tools[a.tools.length - 1] as { cache_control?: unknown };
    expect(lastA.cache_control).toBeDefined();
  });
});

describe('getSystemPromptForProvider', () => {
  test('anthropic + cache: returns content array with cache_control', async () => {
    const result = await getSystemPromptForProvider({ provider: 'anthropic', cache: true });
    expect(result.provider).toBe('anthropic');
    expect(result.cacheStrategy).toBe('explicit');
    if (result.provider !== 'anthropic') return; // type narrow
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content.length).toBe(1);
    expect(result.content[0]?.type).toBe('text');
    expect(result.content[0]?.cache_control).toEqual({ type: 'ephemeral' });
    expect(typeof result.content[0]?.text).toBe('string');
    expect(result.content[0]!.text.length).toBeGreaterThan(0);
  });

  test('anthropic without cache: structured content, no cache_control', async () => {
    const result = await getSystemPromptForProvider({ provider: 'anthropic' });
    expect(result.cacheStrategy).toBe('disabled');
    if (result.provider !== 'anthropic') return;
    expect(result.content[0]?.cache_control).toBeUndefined();
  });

  test('openai: returns string, automatic strategy when cache requested', async () => {
    const result = await getSystemPromptForProvider({ provider: 'openai', cache: true });
    expect(result.provider).toBe('openai');
    expect(typeof result.content).toBe('string');
    expect(result.cacheStrategy).toBe('automatic');
  });

  test('vercel: returns string, unsupported strategy', async () => {
    const result = await getSystemPromptForProvider({ provider: 'vercel', cache: true });
    expect(typeof result.content).toBe('string');
    expect(result.cacheStrategy).toBe('unsupported');
  });
});
