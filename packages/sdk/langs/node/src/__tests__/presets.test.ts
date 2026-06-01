import { describe, expect, test } from 'bun:test';
import {
  chooseTools,
  DEFAULT_PRESET,
  getPreset,
  getMcpPrompt,
  getSystemPrompt,
  getSystemPromptForProvider,
  getToolCatalog,
  listPresets,
  listTools,
} from '../tools.ts';
import { SuperDocCliError } from '../runtime/errors.js';

const PROVIDERS = ['openai', 'anthropic', 'vercel', 'generic'] as const;

describe('preset registry', () => {
  test('DEFAULT_PRESET is "legacy"', () => {
    expect(DEFAULT_PRESET).toBe('legacy');
  });

  test('listPresets() includes "legacy"', () => {
    const presets = listPresets();
    expect(presets).toContain('legacy');
  });

  test('getPreset() (no arg) returns the legacy preset', () => {
    const preset = getPreset();
    expect(preset.id).toBe('legacy');
  });

  test('getPreset("legacy") returns the legacy preset', () => {
    const preset = getPreset('legacy');
    expect(preset.id).toBe('legacy');
    expect(preset.description).toBeDefined();
    expect(preset.supportsCacheControl).toBe(true);
  });

  test('getPreset("nonexistent") throws PRESET_NOT_FOUND', () => {
    try {
      getPreset('nonexistent-preset');
      throw new Error('Expected getPreset to throw.');
    } catch (error) {
      expect(error).toBeInstanceOf(SuperDocCliError);
      const cliError = error as SuperDocCliError;
      expect(cliError.code).toBe('PRESET_NOT_FOUND');
      expect(cliError.message).toContain('nonexistent-preset');
      const details = cliError.details as { id: string; availablePresets: string[] };
      expect(details.id).toBe('nonexistent-preset');
      expect(details.availablePresets).toContain('legacy');
    }
  });

  test('getPreset("") throws PRESET_NOT_FOUND (empty string is not the default)', () => {
    try {
      getPreset('');
      throw new Error('Expected getPreset("") to throw.');
    } catch (error) {
      expect(error).toBeInstanceOf(SuperDocCliError);
      expect((error as SuperDocCliError).code).toBe('PRESET_NOT_FOUND');
    }
  });

  test('chooseTools({preset: ""}) throws PRESET_NOT_FOUND (cross-lang parity)', async () => {
    await expect(chooseTools({ provider: 'openai', preset: '' })).rejects.toMatchObject({
      code: 'PRESET_NOT_FOUND',
    });
  });
});

describe('public ToolCatalog type — structural access', () => {
  test('getToolCatalog().tools entries expose typed properties', async () => {
    const catalog = await getToolCatalog();
    expect(catalog.tools.length).toBeGreaterThan(0);
    const first = catalog.tools[0]!;
    // These property accesses validate that ToolCatalog.tools is structurally
    // typed (ToolCatalogEntry[]) — not unknown[]. Compile failure here means
    // the public catalog row type regressed.
    expect(typeof first.toolName).toBe('string');
    expect(typeof first.description).toBe('string');
    expect(typeof first.mutates).toBe('boolean');
    expect(Array.isArray(first.operations)).toBe(true);
    expect(typeof first.operations[0]?.operationId).toBe('string');
    expect(typeof first.operations[0]?.intentAction).toBe('string');
  });
});

describe('chooseTools — default preset equivalence', () => {
  for (const provider of PROVIDERS) {
    test(`omitting preset equals preset: 'legacy' (${provider})`, async () => {
      const implicit = await chooseTools({ provider });
      const explicit = await chooseTools({ provider, preset: 'legacy' });
      // Tools content identical
      expect(implicit.tools).toEqual(explicit.tools);
      // Same tool count
      expect(implicit.meta.toolCount).toBe(explicit.meta.toolCount);
      // Same provider, same cache strategy
      expect(implicit.meta.provider).toBe(explicit.meta.provider);
      expect(implicit.meta.cacheStrategy).toBe(explicit.meta.cacheStrategy);
      // Both echo legacy as resolved preset
      expect(implicit.meta.preset).toBe('legacy');
      expect(explicit.meta.preset).toBe('legacy');
    });
  }

  test(`chooseTools(provider, preset: 'nonexistent') throws PRESET_NOT_FOUND`, async () => {
    await expect(chooseTools({ provider: 'openai', preset: 'nonexistent-preset' })).rejects.toMatchObject({
      code: 'PRESET_NOT_FOUND',
    });
  });

  test('meta.preset field is included', async () => {
    const { meta } = await chooseTools({ provider: 'openai' });
    expect(meta.preset).toBe('legacy');
  });
});

describe('catalog + listings — default preset equivalence', () => {
  test(`getToolCatalog() equals getToolCatalog('legacy')`, async () => {
    const implicit = await getToolCatalog();
    const explicit = await getToolCatalog('legacy');
    expect(implicit).toEqual(explicit);
  });

  for (const provider of PROVIDERS) {
    test(`listTools(${provider}) equals listTools(${provider}, 'legacy')`, async () => {
      const implicit = await listTools(provider);
      const explicit = await listTools(provider, 'legacy');
      expect(implicit).toEqual(explicit);
    });
  }

  test(`getToolCatalog('nonexistent') throws PRESET_NOT_FOUND`, async () => {
    await expect(getToolCatalog('nonexistent-preset')).rejects.toMatchObject({
      code: 'PRESET_NOT_FOUND',
    });
  });
});

describe('system prompts — default preset equivalence', () => {
  test(`getSystemPrompt() equals getSystemPrompt('legacy')`, async () => {
    const implicit = await getSystemPrompt();
    const explicit = await getSystemPrompt('legacy');
    expect(implicit).toBe(explicit);
  });

  test(`getMcpPrompt() equals getMcpPrompt('legacy')`, async () => {
    const implicit = await getMcpPrompt();
    const explicit = await getMcpPrompt('legacy');
    expect(implicit).toBe(explicit);
  });

  test(`getSystemPromptForProvider({provider}) equals preset: 'legacy'`, async () => {
    const implicit = await getSystemPromptForProvider({ provider: 'anthropic', cache: true });
    const explicit = await getSystemPromptForProvider({
      provider: 'anthropic',
      preset: 'legacy',
      cache: true,
    });
    expect(implicit).toEqual(explicit);
  });
});

describe('legacy preset direct access', () => {
  test('getPreset("legacy").getCatalog() matches getToolCatalog()', async () => {
    const direct = await getPreset('legacy').getCatalog();
    const viaTopLevel = await getToolCatalog();
    expect(direct).toEqual(viaTopLevel);
  });

  for (const provider of PROVIDERS) {
    test(`getPreset("legacy").getTools(${provider}) matches chooseTools({provider}).tools`, async () => {
      const direct = await getPreset('legacy').getTools(provider);
      const viaTopLevel = await chooseTools({ provider });
      expect(direct.tools).toEqual(viaTopLevel.tools);
      expect(direct.cacheStrategy).toBe(viaTopLevel.meta.cacheStrategy);
    });
  }
});
