import { describe, expect, test } from 'bun:test';
import {
  chooseTools,
  getMcpPrompt,
  getSystemPrompt,
  getSystemPromptForProvider,
  listTools,
  resolveProductToolsetProfile,
  TOOL_CAPABILITY_MANIFEST,
  TOOL_PROFILE_CONFIG,
} from '../tools.ts';
import { BENCHMARK_PROFILES, resolveBenchmarkToolsetProfile } from '../tool-capabilities.ts';

const EXPECTED_WORKFLOW_POC_TOOL_NAMES = [
  'superdoc_context',
  'superdoc_text_transform',
  'superdoc_list_transform',
  'superdoc_table_transform',
  'superdoc_structure_insert',
  'superdoc_media_insert',
  'superdoc_comment_pass',
  'superdoc_comment_transform',
  'superdoc_format_transform',
  'superdoc_section_transform',
  'superdoc_style_clone',
  'superdoc_track_changes',
] as const;

const EXPECTED_HYBRID_WORKFLOW_TOOL_NAMES = EXPECTED_WORKFLOW_POC_TOOL_NAMES.filter(
  (name) => name !== 'superdoc_track_changes',
);

const EXPECTED_PRIMITIVE_V2_TOOL_NAMES = [
  'superdoc_get_content',
  'superdoc_search',
  'superdoc_mutations',
  'superdoc_comment',
  'superdoc_track_changes',
] as const;

const EXPECTED_COMPILER_TOOL_NAMES = [...EXPECTED_PRIMITIVE_V2_TOOL_NAMES, ...EXPECTED_HYBRID_WORKFLOW_TOOL_NAMES];

const EXPECTED_BENCHMARK_V2_TOOL_NAMES = ['superdoc_do', 'superdoc_context'] as const;
const EXPECTED_PRODUCT_TOOL_NAMES = [
  'agent_inspect',
  'agent_recipe',
  'agent_apply',
  'agent_verify',
  'agent_operation',
] as const;
const EXPECTED_MACRO_STRUCTURE_TOOL_NAMES = [
  'superdoc_context',
  'superdoc_list_transform',
  'superdoc_structure_insert',
] as const;
const EXPECTED_MACRO_TABLE_TOOL_NAMES = [
  'superdoc_context',
  'superdoc_text_transform',
  'superdoc_table_transform',
] as const;
const EXPECTED_MACRO_COMMENTS_TOOL_NAMES = [
  'superdoc_context',
  'superdoc_comment_pass',
  'superdoc_comment_transform',
  'superdoc_text_transform',
] as const;
const EXPECTED_MACRO_FORMAT_TOOL_NAMES = [
  'superdoc_context',
  'superdoc_format_transform',
  'superdoc_table_transform',
] as const;
const EXPECTED_MACRO_MEDIA_TOOL_NAMES = [
  'superdoc_context',
  'superdoc_media_insert',
  'superdoc_structure_insert',
] as const;
const EXPECTED_MACRO_SECTION_TOOL_NAMES = ['superdoc_context', 'superdoc_section_transform'] as const;

function toolNameFromProviderShape(tool: unknown): string | undefined {
  if (typeof tool !== 'object' || tool == null) return undefined;
  const entry = tool as Record<string, unknown>;
  if (typeof entry.name === 'string') return entry.name;

  if (entry.type === 'function' && typeof entry.function === 'object' && entry.function != null) {
    const fn = entry.function as Record<string, unknown>;
    if (typeof fn.name === 'string') return fn.name;
  }

  return undefined;
}

describe('chooseTools cache markers', () => {
  test('legacy profile matches omitted profile behavior', async () => {
    const omitted = await chooseTools({ provider: 'openai' });
    const legacy = await chooseTools({ provider: 'openai', profile: 'legacy' });
    expect(legacy.tools).toEqual(omitted.tools);
    expect(legacy.meta).toEqual(omitted.meta);
  });

  test('workflow-poc profile returns the workflow toolset', async () => {
    const result = await chooseTools({ provider: 'openai', profile: 'workflow-poc' });
    const names = result.tools.map((tool) => toolNameFromProviderShape(tool));
    expect(names).toEqual(EXPECTED_WORKFLOW_POC_TOOL_NAMES);
    expect(result.meta.toolCount).toBe(12);
    expect(result.meta.provider).toBe('openai');
    expect(result.meta.profile).toBe('workflow-poc');
  });

  test('product profile exposes the clean five-tool agent surface', async () => {
    const result = await chooseTools({ provider: 'openai', profile: 'product' });
    const names = result.tools.map((tool) => toolNameFromProviderShape(tool));
    expect(names).toEqual(EXPECTED_PRODUCT_TOOL_NAMES);
    expect(result.meta.toolCount).toBe(5);
    expect(result.meta.profile).toBe('product');
  });

  test('experimental profiles expose deliberately different tool surfaces', async () => {
    const legacyNames = (await listTools('openai', 'legacy')).map((tool) => toolNameFromProviderShape(tool));
    const hybridNames = (await listTools('openai', 'hybrid-macro-first')).map((tool) =>
      toolNameFromProviderShape(tool),
    );
    const primitiveNames = (await listTools('openai', 'primitive-v2')).map((tool) => toolNameFromProviderShape(tool));
    const compilerNames = (await listTools('openai', 'compiler')).map((tool) => toolNameFromProviderShape(tool));
    const benchmarkNames = (await listTools('openai', 'benchmark-v2')).map((tool) => toolNameFromProviderShape(tool));
    const macroStructureNames = (await listTools('openai', 'macro-structure')).map((tool) =>
      toolNameFromProviderShape(tool),
    );
    const macroTableNames = (await listTools('openai', 'macro-table')).map((tool) => toolNameFromProviderShape(tool));
    const macroCommentsNames = (await listTools('openai', 'macro-comments')).map((tool) =>
      toolNameFromProviderShape(tool),
    );
    const macroFormatNames = (await listTools('openai', 'macro-format')).map((tool) => toolNameFromProviderShape(tool));
    const macroMediaNames = (await listTools('openai', 'macro-media')).map((tool) => toolNameFromProviderShape(tool));
    const macroSectionNames = (await listTools('openai', 'macro-section')).map((tool) =>
      toolNameFromProviderShape(tool),
    );

    expect(hybridNames).toEqual([...legacyNames, ...EXPECTED_HYBRID_WORKFLOW_TOOL_NAMES]);
    expect(primitiveNames).toEqual(EXPECTED_PRIMITIVE_V2_TOOL_NAMES);
    expect(compilerNames).toEqual(EXPECTED_COMPILER_TOOL_NAMES);
    expect(benchmarkNames).toEqual(EXPECTED_BENCHMARK_V2_TOOL_NAMES);
    expect(macroStructureNames).toEqual(EXPECTED_MACRO_STRUCTURE_TOOL_NAMES);
    expect(macroTableNames).toEqual(EXPECTED_MACRO_TABLE_TOOL_NAMES);
    expect(macroCommentsNames).toEqual(EXPECTED_MACRO_COMMENTS_TOOL_NAMES);
    expect(macroFormatNames).toEqual(EXPECTED_MACRO_FORMAT_TOOL_NAMES);
    expect(macroMediaNames).toEqual(EXPECTED_MACRO_MEDIA_TOOL_NAMES);
    expect(macroSectionNames).toEqual(EXPECTED_MACRO_SECTION_TOOL_NAMES);
  });

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

describe('listTools', () => {
  test('legacy profile matches omitted profile behavior', async () => {
    const omitted = await listTools('openai');
    const legacy = await listTools('openai', 'legacy');
    expect(legacy).toEqual(omitted);
  });

  test('workflow-poc profile returns workflow tool names for provider shape', async () => {
    const tools = await listTools('openai', 'workflow-poc');
    const names = tools.map((tool) => toolNameFromProviderShape(tool));
    expect(names).toEqual(EXPECTED_WORKFLOW_POC_TOOL_NAMES);
  });

  test('product profile returns agent tool names for provider shape', async () => {
    const tools = await listTools('openai', 'product');
    const names = tools.map((tool) => toolNameFromProviderShape(tool));
    expect(names).toEqual(EXPECTED_PRODUCT_TOOL_NAMES);
  });
});

describe('getSystemPromptForProvider', () => {
  test('legacy profile matches omitted profile behavior', async () => {
    const omitted = await getSystemPromptForProvider({ provider: 'openai' });
    const legacy = await getSystemPromptForProvider({ provider: 'openai', profile: 'legacy' });
    expect(legacy).toEqual(omitted);
  });

  test('workflow-poc profile returns workflow-specific content', async () => {
    const result = await getSystemPromptForProvider({ provider: 'openai', profile: 'workflow-poc' });
    expect(result.provider).toBe('openai');
    expect(typeof result.content).toBe('string');
    if (typeof result.content !== 'string') return;
    expect(result.content).toContain('workflow-poc profile');
    expect(result.content).toContain('superdoc_context');
  });

  test('product profile returns clean agent-specific content', async () => {
    const result = await getSystemPromptForProvider({ provider: 'openai', profile: 'product' });
    expect(result.provider).toBe('openai');
    expect(typeof result.content).toBe('string');
    if (typeof result.content !== 'string') return;
    expect(result.content).toContain('clean product profile');
    expect(result.content).toContain('agent_apply');
    expect(result.content).not.toContain('superdoc_do');
  });

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

describe('profile-aware prompt readers', () => {
  test('legacy profile prompt readers match omitted behavior', async () => {
    const [systemOmitted, systemLegacy, mcpOmitted, mcpLegacy] = await Promise.all([
      getSystemPrompt(),
      getSystemPrompt({ profile: 'legacy' }),
      getMcpPrompt(),
      getMcpPrompt({ profile: 'legacy' }),
    ]);

    expect(systemLegacy).toBe(systemOmitted);
    expect(mcpLegacy).toBe(mcpOmitted);
  });

  test('workflow-poc prompt readers return distinct workflow prompts', async () => {
    const [systemLegacy, mcpLegacy, systemWorkflow, mcpWorkflow] = await Promise.all([
      getSystemPrompt({ profile: 'legacy' }),
      getMcpPrompt({ profile: 'legacy' }),
      getSystemPrompt({ profile: 'workflow-poc' }),
      getMcpPrompt({ profile: 'workflow-poc' }),
    ]);

    expect(systemWorkflow).not.toBe(systemLegacy);
    expect(mcpWorkflow).not.toBe(mcpLegacy);
    expect(systemWorkflow).toContain('workflow-poc profile');
    expect(systemWorkflow).toContain('superdoc_text_transform');
    expect(mcpWorkflow).toContain('workflow-poc mode');
    expect(mcpWorkflow).toContain('deterministic');
  });

  test('experimental prompt readers add profile-specific strategy headers', async () => {
    const [hybrid, primitive, compiler, benchmark, macroStructure, macroTable] = await Promise.all([
      getSystemPrompt({ profile: 'hybrid-macro-first' }),
      getSystemPrompt({ profile: 'primitive-v2' }),
      getSystemPrompt({ profile: 'compiler' }),
      getSystemPrompt({ profile: 'benchmark-v2' }),
      getSystemPrompt({ profile: 'macro-structure' }),
      getSystemPrompt({ profile: 'macro-table' }),
    ]);

    expect(hybrid).toContain('hybrid-macro-first profile');
    expect(hybrid).toContain('fall back to the legacy SuperDoc tools');
    expect(primitive).toContain('primitive-v2 profile');
    expect(primitive).toContain('superdoc_mutations');
    expect(compiler).toContain('compiler profile');
    expect(compiler).toContain('compile-and-execute');
    expect(benchmark).toContain('benchmark-v2 profile');
    expect(benchmark).toContain('superdoc_do');
    expect(benchmark).not.toContain('superdoc_mutations');
    expect(macroStructure).toContain('macro-structure profile');
    expect(macroStructure).toContain('superdoc_structure_insert');
    expect(macroStructure).not.toContain('superdoc_mutations');
    expect(macroTable).toContain('macro-table profile');
    expect(macroTable).toContain('superdoc_table_transform');
  });

  test('capability manifest names every tool exposed by slim macro profiles', () => {
    const manifestToolNames = new Set(TOOL_CAPABILITY_MANIFEST.map((entry) => entry.toolName));
    for (const profile of [
      'macro-structure',
      'macro-table',
      'macro-comments',
      'macro-format',
      'macro-media',
      'macro-section',
    ] as const) {
      const config = TOOL_PROFILE_CONFIG[profile];
      expect(config.legacyTools).toEqual([]);
      expect(config.workflowTools).not.toEqual([]);
      for (const toolName of config.workflowTools) {
        expect(manifestToolNames.has(toolName)).toBe(true);
      }
    }
  });
});

describe('product toolset router', () => {
  test('always resolves to the clean product profile regardless of task wording', () => {
    const tasks = [
      'Add comments to clauses that create high liability for our side.',
      'Insert a new Heading 2 section and preserve the template style.',
      'Summarize the main risks in this long document at the top.',
      'Replace a defined term inside section 2.4.',
      'Reorder sections by moving section 3 before section 2.',
      'Create a numbered list with exactly 30 items.',
      'Apply letter spacing of 2pt to the first heading.',
      'Replace every occurrence of one phrase with another.',
    ];
    for (const task of tasks) {
      const decision = resolveProductToolsetProfile({ task });
      expect(decision.profile).toBe('product');
      expect(decision.bundle).toBe('product-agent');
      expect(BENCHMARK_PROFILES.has(decision.profile)).toBe(false);
    }
  });

  test('still derives a coarse intent for telemetry without using benchmark substring rules', () => {
    expect(resolveProductToolsetProfile({ task: 'Add comments to a clause.' }).intent).toBe('comments');
    expect(resolveProductToolsetProfile({ task: 'Make section 3 stand out.' }).intent).toBe('section');
    expect(resolveProductToolsetProfile({ task: 'Replace text in the document.' }).intent).toBe('text');
    expect(resolveProductToolsetProfile({ task: 'Summarize the document.' }).intent).toBe('summary');
    expect(resolveProductToolsetProfile({ task: '' }).intent).toBe('unknown_intent');
  });

  test('benchmark router remains available for measurement only', () => {
    const benchmarkDecision = resolveBenchmarkToolsetProfile({
      task: 'Reorder sections by moving section 3 before section 2.',
    });
    expect(BENCHMARK_PROFILES.has(benchmarkDecision.profile)).toBe(true);
    expect(benchmarkDecision.profile).toBe('macro-section');
  });
});
