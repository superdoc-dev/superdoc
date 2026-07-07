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
import { readPromptFile } from '../presets/core.ts';
import { createAgentToolkit } from '../tools.ts';
import { SuperDocCliError } from '../runtime/errors.js';

const PROVIDERS = ['openai', 'anthropic', 'vercel', 'generic'] as const;

describe('preset registry', () => {
  test('DEFAULT_PRESET is "legacy"', () => {
    expect(DEFAULT_PRESET).toBe('legacy');
  });

  test('listPresets() includes "legacy" and "core"', () => {
    const presets = listPresets();
    expect(presets).toContain('legacy');
    expect(presets).toContain('core');
  });

  test('getPreset("core") returns the core preset', () => {
    const preset = getPreset('core');
    expect(preset.id).toBe('core');
    expect(preset.description).toBeDefined();
    expect(preset.supportsCacheControl).toBe(true);
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

  test('corev2 is gone — graduated into core', () => {
    expect(listPresets()).not.toContain('corev2');
    expect(() => getPreset('corev2')).toThrow(SuperDocCliError);
  });

  test('core advertises the graduated actions without schema patching', async () => {
    const { tools } = await chooseTools({ preset: 'core', provider: 'generic' });
    const actionTool = tools.find((tool) => (tool as { name?: string }).name === 'superdoc_perform_action') as
      | { parameters?: { properties?: Record<string, unknown> }; description?: string }
      | undefined;
    expect(actionTool).toBeDefined();
    const actionProp = actionTool!.parameters?.properties?.action as { enum?: string[] } | undefined;
    for (const name of ['convert_list', 'undo_changes', 'attach_numbering']) {
      expect(actionProp?.enum).toContain(name);
      expect(actionTool!.description).toContain(name);
    }
    for (const prop of ['likeMarker', 'untilMarker', 'fromMarker', 'fromText', 'anchorText']) {
      expect(actionTool!.parameters?.properties?.[prop]).toBeDefined();
    }
  });

  test('core catalog contract version is core/v2', async () => {
    const catalog = await getToolCatalog('core');
    expect(catalog.contractVersion).toBe('core/v2');
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
  test('getToolCatalog("legacy").tools entries expose typed properties', async () => {
    // Pin to the legacy preset: its codegen-emitted catalog has populated
    // `operations` entries (multi-action intent tools). The core preset's
    // catalog uses bespoke top-level tools (no intent-op mapping); structural
    // typing is still enforced by ToolCatalogEntry but operations[] is empty.
    const catalog = await getToolCatalog('legacy');
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

// ---------------------------------------------------------------------------
// Exclusion config — excludeActions (core preset)
// ---------------------------------------------------------------------------

type PerformActionTool = {
  name?: string;
  description?: string;
  parameters?: { properties?: Record<string, unknown> };
};

function findGenericTool(tools: unknown[], name: string): PerformActionTool | undefined {
  return tools.find((tool) => (tool as { name?: string }).name === name) as PerformActionTool | undefined;
}

describe('createAgentToolkit — coherent surface by construction', () => {
  test('core toolkit applies the same exclusions to tools, prompt, and dispatch', async () => {
    const kit = await createAgentToolkit({
      provider: 'generic',
      preset: 'core',
      excludeActions: ['add_hyperlink'],
    });
    const perform = findGenericTool(kit.tools, 'superdoc_perform_action')!;
    const actionEnum = (perform.parameters?.properties?.action as { enum?: string[] }).enum!;
    expect(actionEnum).not.toContain('add_hyperlink');
    // Prompt is narrowed with the SAME list — no stale documentation line.
    expect(kit.systemPrompt).not.toMatch(/^- add_hyperlink:/m);
    expect(await getSystemPrompt('core')).toMatch(/^- add_hyperlink:/m);
    // Dispatch is pre-bound with the guard: a guessed call is refused.
    await expect(
      kit.dispatch({} as never, 'superdoc_perform_action', {
        action: 'add_hyperlink',
        text: 'x',
        url: 'https://example.com',
      }),
    ).rejects.toThrow(/excluded/i);
    expect(kit.meta.preset).toBe('core');
  });

  test('core toolkit copies exclusions so later caller mutation cannot desync dispatch', async () => {
    const excludeActions = ['add_hyperlink'];
    const kit = await createAgentToolkit({
      provider: 'generic',
      preset: 'core',
      excludeActions,
    });
    excludeActions.push('format_text');

    try {
      await kit.dispatch({} as never, 'superdoc_perform_action', {
        action: 'format_text',
        targetText: 'x',
        bold: true,
      });
    } catch (error) {
      expect(String(error)).not.toMatch(/excluded/i);
    }
  });

  test('legacy toolkit ignores exclusions and matches the standalone calls', async () => {
    const kit = await createAgentToolkit({
      provider: 'generic',
      preset: 'legacy',
      excludeActions: ['add_hyperlink'],
    });
    const plain = await chooseTools({ provider: 'generic', preset: 'legacy' });
    expect(kit.tools).toEqual(plain.tools);
    expect(kit.systemPrompt).toBe(await getSystemPrompt('legacy'));
    expect(kit.meta.preset).toBe('legacy');
  });

  test('defaults to the legacy preset like every other entry point', async () => {
    const kit = await createAgentToolkit({ provider: 'generic' });
    expect(kit.meta.preset).toBe('legacy');
  });

  test('explicit empty preset fails fast like the standalone helpers', async () => {
    await expect(createAgentToolkit({ provider: 'generic', preset: '' })).rejects.toMatchObject({
      code: 'PRESET_NOT_FOUND',
    });
  });
});

describe('core preset — excludeActions', () => {
  test('excluded action disappears from enum, description, and private args', async () => {
    const baseline = await chooseTools({ preset: 'core', provider: 'generic' });
    const basePerform = findGenericTool(baseline.tools, 'superdoc_perform_action')!;
    const baseEnum = (basePerform.parameters?.properties?.action as { enum?: string[] }).enum!;
    // Preconditions: add_hyperlink is advertised and is the ONLY user of url/tooltip.
    expect(baseEnum).toContain('add_hyperlink');
    expect(basePerform.parameters?.properties?.url).toBeDefined();
    expect(basePerform.parameters?.properties?.tooltip).toBeDefined();

    const narrowed = await chooseTools({
      preset: 'core',
      provider: 'generic',
      excludeActions: ['add_hyperlink'],
    });
    const perform = findGenericTool(narrowed.tools, 'superdoc_perform_action')!;
    const narrowedEnum = (perform.parameters?.properties?.action as { enum?: string[] }).enum!;
    expect(narrowedEnum).not.toContain('add_hyperlink');
    expect(narrowedEnum.length).toBe(baseEnum.length - 1);
    expect(perform.description).not.toContain('add_hyperlink');
    // Args only add_hyperlink used are pruned; shared args survive.
    expect(perform.parameters?.properties?.url).toBeUndefined();
    expect(perform.parameters?.properties?.tooltip).toBeUndefined();
    expect(perform.parameters?.properties?.text).toBeDefined();
  });

  test('description drops a group whose actions are all excluded', async () => {
    const { tools } = await chooseTools({
      preset: 'core',
      provider: 'generic',
      excludeActions: ['undo_changes', 'redo_changes'],
    });
    const perform = findGenericTool(tools, 'superdoc_perform_action')!;
    expect(perform.description).not.toContain('History:');
    expect(perform.description).not.toContain('undo_changes');
  });

  test('unknown excludeActions name throws INVALID_ARGUMENT (typo protection)', async () => {
    await expect(
      chooseTools({ preset: 'core', provider: 'generic', excludeActions: ['insert_paragraph'] }),
    ).rejects.toThrow(/unknown action/);
  });

  test('excluding EVERY action drops superdoc_perform_action entirely', async () => {
    const baseline = await chooseTools({ preset: 'core', provider: 'generic' });
    const basePerform = findGenericTool(baseline.tools, 'superdoc_perform_action')!;
    const allActions = (basePerform.parameters?.properties?.action as { enum?: string[] }).enum!;
    const { tools } = await chooseTools({
      preset: 'core',
      provider: 'generic',
      excludeActions: allActions,
    });
    expect(findGenericTool(tools, 'superdoc_perform_action')).toBeUndefined();
    expect(findGenericTool(tools, 'superdoc_inspect')).toBeDefined();
  });

  for (const provider of PROVIDERS) {
    test(`exclusion applies uniformly for provider=${provider}`, async () => {
      const { tools } = await chooseTools({
        preset: 'core',
        provider,
        excludeActions: ['add_hyperlink'],
      });
      const serialized = JSON.stringify(tools);
      expect(serialized).not.toContain('add_hyperlink');
    });
  }
});

describe('core preset — actions-only default surface', () => {
  test('superdoc_execute_code is NOT advertised (WIP behind a future safety flag)', async () => {
    const { tools } = await chooseTools({ preset: 'core', provider: 'generic' });
    expect(findGenericTool(tools, 'superdoc_execute_code')).toBeUndefined();
    expect(findGenericTool(tools, 'superdoc_inspect')).toBeDefined();
    expect(findGenericTool(tools, 'superdoc_perform_action')).toBeDefined();
    expect(tools.length).toBe(2);
  });

  test('superdoc_execute_code stays DISPATCHABLE for SDK callers', async () => {
    // Not advertised != removed: direct dispatch still routes (it fails later
    // on the empty doc handle, not on tool resolution).
    const preset = getPreset('core');
    await expect(preset.dispatch({} as never, 'superdoc_execute_code', { code: 'return 1' })).rejects.toThrow(
      /session-bound document handle|executeCode/,
    );
  });
});

describe('exclusion config — legacy preset is unaffected', () => {
  for (const provider of PROVIDERS) {
    test(`legacy ignores exclusions without breaking (${provider})`, async () => {
      const baseline = await chooseTools({ preset: 'legacy', provider });
      const withExclusions = await chooseTools({
        preset: 'legacy',
        provider,
        excludeActions: ['add_hyperlink'],
      });
      expect(withExclusions.tools).toEqual(baseline.tools);
      expect(withExclusions.meta.toolCount).toBe(baseline.meta.toolCount);
    });
  }
});

describe('core preset — dispatch-level exclusion guard', () => {
  test('dispatch refuses an excluded action', async () => {
    const preset = getPreset('core');
    await expect(
      preset.dispatch(
        {} as never,
        'superdoc_perform_action',
        { action: 'add_hyperlink', text: 'x', url: 'https://example.com' },
        { excludeActions: ['add_hyperlink'] } as never,
      ),
    ).rejects.toThrow(/excluded by configuration/);
  });
});

// ---------------------------------------------------------------------------
// Provider tool formats — the exact shapes each vendor's API expects
// ---------------------------------------------------------------------------

describe('core preset — provider tool formats', () => {
  test('openai: Chat Completions nested {type:"function", function:{name,description,parameters}}', async () => {
    const { tools } = await chooseTools({ preset: 'core', provider: 'openai' });
    for (const raw of tools) {
      const t = raw as { type?: string; function?: { name?: string; description?: string; parameters?: unknown } };
      expect(t.type).toBe('function');
      expect(typeof t.function?.name).toBe('string');
      expect(typeof t.function?.description).toBe('string');
      expect(t.function?.parameters).toBeDefined();
      // No stray flat fields — the nested dialect keeps everything under `function`.
      expect((t as Record<string, unknown>).name).toBeUndefined();
      expect((t as Record<string, unknown>).inputSchema).toBeUndefined();
    }
  });

  test('anthropic: {name, description, input_schema}', async () => {
    const { tools } = await chooseTools({ preset: 'core', provider: 'anthropic' });
    for (const raw of tools) {
      const t = raw as { name?: string; description?: string; input_schema?: unknown };
      expect(typeof t.name).toBe('string');
      expect(typeof t.description).toBe('string');
      expect(t.input_schema).toBeDefined();
      expect((t as Record<string, unknown>).parameters).toBeUndefined();
      expect((t as Record<string, unknown>).inputSchema).toBeUndefined();
    }
  });

  test('anthropic cache:true marks ONLY the last tool with cache_control ephemeral', async () => {
    const { tools, meta } = await chooseTools({ preset: 'core', provider: 'anthropic', cache: true });
    expect(meta.cacheStrategy).toBe('explicit');
    const cacheMarked = tools.filter((t) => (t as { cache_control?: unknown }).cache_control != null);
    expect(cacheMarked.length).toBe(1);
    expect((tools[tools.length - 1] as { cache_control?: { type?: string } }).cache_control?.type).toBe('ephemeral');
  });

  test('vercel: flat {name, description, inputSchema} (AI SDK tool()/jsonSchema dialect)', async () => {
    const { tools } = await chooseTools({ preset: 'core', provider: 'vercel' });
    for (const raw of tools) {
      const t = raw as { name?: string; description?: string; inputSchema?: { type?: string } };
      expect(typeof t.name).toBe('string');
      expect(typeof t.description).toBe('string');
      expect(t.inputSchema?.type).toBe('object');
      // The AI SDK dialect is flat — no openai-style nesting, no `parameters`.
      expect((t as Record<string, unknown>).function).toBeUndefined();
      expect((t as Record<string, unknown>).type).toBeUndefined();
      expect((t as Record<string, unknown>).parameters).toBeUndefined();
    }
  });

  test('generic: {name, description, parameters}', async () => {
    const { tools } = await chooseTools({ preset: 'core', provider: 'generic' });
    for (const raw of tools) {
      const t = raw as { name?: string; description?: string; parameters?: unknown };
      expect(typeof t.name).toBe('string');
      expect(t.parameters).toBeDefined();
      expect((t as Record<string, unknown>).inputSchema).toBeUndefined();
    }
  });

  test('all providers advertise the same 3 tool names with identical schemas payload', async () => {
    const byProvider: Record<string, string[]> = {};
    for (const provider of PROVIDERS) {
      const { tools } = await chooseTools({ preset: 'core', provider });
      byProvider[provider] = tools
        .map((t) => {
          const r = t as { name?: string; function?: { name?: string } };
          return r.function?.name ?? r.name ?? '';
        })
        .sort();
    }
    expect(byProvider.openai).toEqual(byProvider.anthropic);
    expect(byProvider.openai).toEqual(byProvider.vercel);
    expect(byProvider.openai).toEqual(byProvider.generic);
  });
});

// ---------------------------------------------------------------------------
// Exclusion-aware system prompt — the prompt narrows WITH the tool surface
// ---------------------------------------------------------------------------

describe('core preset — getSystemPrompt exclusions', () => {
  test('the DEFAULT core prompt is actions-only (no execute_code anywhere)', async () => {
    const prompt = await getSystemPrompt('core');
    expect(prompt).not.toContain('superdoc_execute_code');
    expect(prompt).not.toContain('RUNTIME REFERENCE');
    // Still a full prompt, not a stub.
    expect(prompt.length).toBeGreaterThan(10000);
    expect(prompt).toContain('- add_list_items:');
  });

  test('excludeActions drops the per-action documentation lines', async () => {
    const filtered = await getSystemPrompt('core', { excludeActions: ['add_hyperlink', 'split_list'] });
    expect(filtered).not.toMatch(/^- add_hyperlink:/m);
    expect(filtered).not.toMatch(/^- split_list:/m);
    expect(filtered).toMatch(/^- format_text:/m); // others survive
  });

  test('a paired line survives when only ONE of its actions is excluded', async () => {
    const filtered = await getSystemPrompt('core', { excludeActions: ['accept_tracked_changes'] });
    // The accept/reject pair is documented on one line; reject is still callable.
    expect(filtered).toMatch(/^- accept_tracked_changes \/ reject_tracked_changes:/m);
    const both = await getSystemPrompt('core', {
      excludeActions: ['accept_tracked_changes', 'reject_tracked_changes'],
    });
    expect(both).not.toMatch(/^- accept_tracked_changes \/ reject_tracked_changes:/m);
  });

  test('tools and prompt narrow together with the SAME options', async () => {
    const exclusions = { excludeActions: ['add_hyperlink'] as const };
    const { tools } = await chooseTools({ preset: 'core', provider: 'generic', ...exclusions });
    const prompt = await getSystemPrompt('core', exclusions);
    const serialized = JSON.stringify(tools);
    expect(serialized).not.toContain('add_hyperlink');
    expect(prompt).not.toMatch(/^- add_hyperlink:/m);
  });

  test('unknown exclusion names throw (same typo protection as getTools)', async () => {
    await expect(getSystemPrompt('core', { excludeActions: ['insert_paragraph'] })).rejects.toThrow(/unknown action/);
  });

  test('legacy preset ignores prompt exclusions without breaking', async () => {
    const base = await getSystemPrompt('legacy');
    const withOptions = await getSystemPrompt('legacy', { excludeActions: ['add_hyperlink'] });
    expect(withOptions).toBe(base);
  });
});

describe('core preset prompt asset loading', () => {
  const { mkdtemp, mkdir, writeFile, rm } = require('node:fs/promises') as typeof import('node:fs/promises');
  const os = require('node:os') as typeof import('node:os');
  const nodePath = require('node:path') as typeof import('node:path');

  test('missing prompt file throws TOOLS_ASSET_NOT_FOUND listing tried paths', async () => {
    const dir = await mkdtemp(nodePath.join(os.tmpdir(), 'sdk-prompt-test-'));
    try {
      expect.assertions(2);
      await readPromptFile('missing.md', 'Test prompt', [dir]).catch((err) => {
        expect(err.code).toBe('TOOLS_ASSET_NOT_FOUND');
        expect(err.details.triedPaths).toEqual([nodePath.join(dir, 'missing.md')]);
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('non-ENOENT read failure throws TOOLS_ASSET_UNREADABLE with the underlying cause', async () => {
    const dir = await mkdtemp(nodePath.join(os.tmpdir(), 'sdk-prompt-test-'));
    try {
      // A directory named like the prompt file makes readFile fail with
      // EISDIR — a real IO error that is not "asset missing".
      await mkdir(nodePath.join(dir, 'prompt.md'));
      expect.assertions(2);
      await readPromptFile('prompt.md', 'Test prompt', [dir]).catch((err) => {
        expect(err.code).toBe('TOOLS_ASSET_UNREADABLE');
        expect(String(err.details.cause)).toContain('EISDIR');
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('ENOENT on the first candidate still falls through to the next layout', async () => {
    const missing = nodePath.join(os.tmpdir(), 'sdk-prompt-test-does-not-exist');
    const dir = await mkdtemp(nodePath.join(os.tmpdir(), 'sdk-prompt-test-'));
    try {
      await writeFile(nodePath.join(dir, 'prompt.md'), 'prompt body');
      const content = await readPromptFile('prompt.md', 'Test prompt', [missing, dir]);
      expect(content).toBe('prompt body');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('embedded prompts (native-binary fallback)', () => {
  test('embedded prompt map matches the .md sources — regenerate via scripts/embed-prompts.mjs', async () => {
    const { EMBEDDED_PROMPTS } = await import('../embedded-prompts.generated.ts');
    const { readFile: readFileFs, readdir } = await import('node:fs/promises');
    const { fileURLToPath } = await import('node:url');
    const promptDir = fileURLToPath(new URL('../prompts/', import.meta.url));
    const nodePath = await import('node:path');
    const diskNames = (await readdir(promptDir)).filter((name) => name.endsWith('.md')).sort();
    expect(Object.keys(EMBEDDED_PROMPTS).sort()).toEqual(diskNames);
    for (const name of diskNames) {
      const disk = await readFileFs(nodePath.join(promptDir, name), 'utf8');
      expect(EMBEDDED_PROMPTS[name]).toBe(disk);
    }
  });

  test('readPromptFile falls back to the embedded copy when no candidate dir exists', async () => {
    const { readPromptFile } = await import('../presets/core.ts');
    const content = await readPromptFile('system-prompt.md', 'Core system prompt', [
      '/nonexistent-dir-a',
      '/nonexistent-dir-b',
    ]);
    expect(content.length).toBeGreaterThan(10_000);
  });
});
