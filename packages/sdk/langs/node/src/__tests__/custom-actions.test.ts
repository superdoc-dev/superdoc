/**
 * Custom-action tests.
 *
 * Most run WITHOUT the CLI host binary: they use a fake base preset to assert
 * the merged tool list / catalog / prompt, exclusion coherence, tier routing,
 * and receipt shapes. The run-tier fixture (footnotes) exercises the same
 * surfaces the e2e test drives against the real host.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import type { BoundDocApi } from '../generated/client.ts';
import { composePreset, defineAction, executionKindOf, extendPreset } from '../actions/define.ts';
import { footnoteActions } from './fixtures/footnotes.ts';
import { ACTION_NAMES_LIST } from '../agent/actions.ts';
import { chooseTools, createAgentToolkit, dispatchSuperDocTool, getToolCatalog, getSystemPrompt } from '../tools.ts';
import { getPreset, listPresets, registerPreset, unregisterPreset } from '../presets.ts';
import { SuperDocCliError } from '../runtime/errors.js';

const REGISTERED: string[] = [];
afterEach(() => {
  for (const id of REGISTERED.splice(0)) {
    try {
      unregisterPreset(id);
    } catch {
      // ignore
    }
  }
});

function actionProp(tool: unknown): { enum?: string[] } | undefined {
  const t = tool as {
    parameters?: { properties?: Record<string, unknown> };
    input_schema?: { properties?: Record<string, unknown> };
    function?: { parameters?: { properties?: Record<string, unknown> } };
  };
  const props = t.function?.parameters?.properties ?? t.parameters?.properties ?? t.input_schema?.properties ?? {};
  return props.action as { enum?: string[] } | undefined;
}

function schemaOf(tool: unknown): { properties?: Record<string, unknown> } | undefined {
  const t = tool as {
    parameters?: { properties?: Record<string, unknown> };
    input_schema?: { properties?: Record<string, unknown> };
    function?: { parameters?: { properties?: Record<string, unknown> } };
  };
  return t.function?.parameters ?? t.parameters ?? t.input_schema;
}

function toolName(tool: unknown): string {
  const t = tool as { name?: string; function?: { name?: string } };
  return t.function?.name ?? t.name ?? '';
}

describe('defineAction — canonical type, two tiers', () => {
  test('run tier keeps the native function (NOT serialized)', () => {
    const run = (_doc: unknown, args: Record<string, unknown>) => args;
    const spec = defineAction({
      name: 'demo.echo',
      description: 'echo',
      input: { type: 'object', properties: { x: { type: 'string' } }, required: ['x'] },
      run,
    });
    expect(spec.name).toBe('demo.echo');
    expect(spec.run).toBe(run);
    expect(spec.inputSchema.required).toEqual(['x']);
  });

  test('steps tier normalizes steps and validates against built-ins', () => {
    const spec = defineAction({
      name: 'demo.steps',
      description: 'd',
      input: { type: 'object', properties: { label: { type: 'string', default: 'X' } } },
      steps: [{ action: 'insert_paragraphs', args: { texts: ['{{label}}'] } }],
    });
    expect(spec.steps).toEqual([{ action: 'insert_paragraphs', args: { texts: ['{{label}}'] } }]);
    expect(executionKindOf(spec)).toBe('steps');
  });

  test('steps referencing a non-built-in action are rejected at define time', () => {
    expect(() =>
      defineAction({
        name: 'demo.badstep',
        description: 'd',
        steps: [{ action: 'not_a_real_action', args: {} }],
      }),
    ).toThrow(SuperDocCliError);
  });

  test('requires exactly one execution tier', () => {
    expect(() => defineAction({ name: 'demo.none', description: 'd' } as never)).toThrow(SuperDocCliError);
    expect(() =>
      defineAction({
        name: 'demo.two',
        description: 'd',
        run: () => null,
        steps: [{ action: 'insert_paragraphs' }],
      } as never),
    ).toThrow(SuperDocCliError);
  });
});

describe('extendPreset — tool merging', () => {
  test('footnote action names appear in superdoc_perform_action enum (anthropic)', async () => {
    const acme = extendPreset('core', { id: 'acme', actions: footnoteActions });
    registerPreset(acme);
    REGISTERED.push('acme');
    const { tools, meta } = await chooseTools({ provider: 'anthropic', preset: 'acme' });
    expect(meta.preset).toBe('acme');
    const actionTool = tools.find((t) => toolName(t) === 'superdoc_perform_action');
    expect(actionTool).toBeDefined();
    const names = actionProp(actionTool)?.enum ?? [];
    for (const r of footnoteActions) expect(names).toContain(r.name);
    // built-in actions are still present
    expect(names).toContain('insert_paragraphs');
    // union'd properties: noteId/content come from footnote actions
    const props =
      (actionTool as { input_schema?: { properties?: Record<string, unknown> } }).input_schema?.properties ?? {};
    expect(props.noteId).toBeDefined();
    expect(props.content).toBeDefined();
  });

  test('open object schema without `properties` merges without throwing', async () => {
    // A legal open schema that omits `properties` (e.g. `{ type: 'object',
    // additionalProperties: true }`) must not crash getTools for the WHOLE
    // preset. coerceInputSchema normalizes the missing bag to {}, and the merge
    // loop guards with `?? {}` to match its twin (synthesizePerformAction) and
    // the Python mirror.
    const open = defineAction({
      name: 'demo.open',
      description: 'open schema, no properties',
      input: { type: 'object', additionalProperties: true },
      run: (_doc, args) => args,
    });
    expect(open.inputSchema.properties).toEqual({});
    const acme = extendPreset('core', { id: 'acme-open', actions: [open] });
    registerPreset(acme);
    REGISTERED.push('acme-open');
    const { tools } = await chooseTools({ provider: 'anthropic', preset: 'acme-open' });
    const actionTool = tools.find((t) => toolName(t) === 'superdoc_perform_action');
    expect(actionTool).toBeDefined();
    const names = actionProp(actionTool)?.enum ?? [];
    expect(names).toContain('demo.open');
  });

  test('standalone:true exposes each action as its own provider tool', async () => {
    // Standalone tool names become provider tool names, so they must be
    // provider-safe (no dots). Use underscore-named variants of the footnotes.
    const safe = footnoteActions.map((r) => ({ ...r, name: r.name.replace('.', '_') }));
    const acme = extendPreset('core', { id: 'acme-standalone', actions: safe, standalone: true });
    registerPreset(acme);
    REGISTERED.push('acme-standalone');
    const { tools } = await chooseTools({ provider: 'openai', preset: 'acme-standalone' });
    const names = tools.map(toolName);
    for (const r of safe) expect(names).toContain(r.name);
    const fnAdd = tools.find((t) => toolName(t) === 'footnotes_add') as {
      type?: string;
      function?: { parameters?: unknown };
    };
    expect(fnAdd.type).toBe('function');
    expect(fnAdd.function?.parameters).toBeDefined();
  });

  test('standalone vercel tools use the FLAT core agent dialect', async () => {
    const safe = footnoteActions.map((r) => ({ ...r, name: r.name.replace('.', '_') }));
    const acme = extendPreset('core', { id: 'acme-vercel', actions: safe, standalone: true });
    registerPreset(acme);
    REGISTERED.push('acme-vercel');
    const { tools } = await chooseTools({ provider: 'vercel', preset: 'acme-vercel' });
    const fnAdd = tools.find((t) => toolName(t) === 'footnotes_add') as {
      type?: string;
      inputSchema?: unknown;
      function?: unknown;
    };
    // Core's vercel dialect is flat {name, description, inputSchema} — the
    // nested OpenAI shape here would be invisible to Vercel AI SDK callers.
    expect(fnAdd.function).toBeUndefined();
    expect(fnAdd.type).toBeUndefined();
    expect(fnAdd.inputSchema).toBeDefined();
  });

  test('merged vercel advertises custom actions in the flat-dialect enum', async () => {
    const acme = extendPreset('core', { id: 'acme-vercel-merged', actions: footnoteActions });
    registerPreset(acme);
    REGISTERED.push('acme-vercel-merged');
    const { tools } = await chooseTools({ provider: 'vercel', preset: 'acme-vercel-merged' });
    const perform = tools.find((t) => toolName(t) === 'superdoc_perform_action') as {
      inputSchema?: { properties?: { action?: { enum?: string[] } } };
    };
    expect(perform.inputSchema?.properties?.action?.enum).toContain('footnotes.add');
  });

  test('excludeActions narrows custom AND builtin actions coherently', async () => {
    const acme = extendPreset('core', { id: 'acme-excl', actions: footnoteActions });
    registerPreset(acme);
    REGISTERED.push('acme-excl');
    const excludeActions = ['footnotes.add', 'create_table'];
    const { tools } = await chooseTools({ provider: 'openai', preset: 'acme-excl', excludeActions });
    const perform = tools.find((t) => toolName(t) === 'superdoc_perform_action') as {
      function?: { parameters?: { properties?: { action?: { enum?: string[] } } } };
    };
    const names = perform.function?.parameters?.properties?.action?.enum ?? [];
    expect(names).not.toContain('footnotes.add'); // custom excluded by the wrapper
    expect(names).not.toContain('create_table'); // builtin excluded by the base
    expect(names).toContain('footnotes.list'); // other customs survive

    const prompt = await getSystemPrompt('acme-excl', { excludeActions });
    expect(prompt).not.toContain('- footnotes.add —');
    expect(prompt).toContain('footnotes.list');

    // Defense-in-depth: dispatching the excluded CUSTOM action is refused.
    await expect(
      dispatchSuperDocTool(
        {} as BoundDocApi,
        'superdoc_perform_action',
        { action: 'footnotes.add', at: {}, content: 'x' },
        { preset: 'acme-excl', excludeActions } as never,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT', details: { excluded: true } });
  });

  test('standalone mode does NOT route customs through perform_action (unadvertised path)', async () => {
    const safe = footnoteActions.map((r) => ({ ...r, name: r.name.replace('.', '_') }));
    const acme = extendPreset('core', { id: 'acme-standalone-gate', actions: safe, standalone: true });
    registerPreset(acme);
    REGISTERED.push('acme-standalone-gate');
    // The standalone surface advertises footnotes_add as its OWN tool, so the
    // perform_action route must fall through to the base, which rejects it.
    await expect(
      dispatchSuperDocTool(
        {} as BoundDocApi,
        'superdoc_perform_action',
        { action: 'footnotes_add', at: {}, content: 'x' },
        { preset: 'acme-standalone-gate' },
      ),
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });

  test('standalone action keeps an `action`-named argument (not treated as discriminator)', async () => {
    let received: Record<string, unknown> | undefined;
    const spec = defineAction({
      name: 'wf_trigger',
      description: 'run a workflow step',
      input: {
        type: 'object',
        properties: { action: { type: 'string', enum: ['approve', 'reject'] } },
        required: ['action'],
      },
      run: (_doc, args) => {
        received = args;
        return { ok: true };
      },
    });
    const acme = extendPreset('core', { id: 'acme-standalone-arg', actions: [spec], standalone: true });
    registerPreset(acme);
    REGISTERED.push('acme-standalone-arg');
    // Dispatched as its OWN tool: `action` is a real arg, must survive.
    const receipt = (await dispatchSuperDocTool(
      {} as BoundDocApi,
      'wf_trigger',
      { action: 'approve' },
      { preset: 'acme-standalone-arg' },
    )) as { status: string };
    expect(receipt.status).toBe('succeeded');
    expect(received).toEqual({ action: 'approve' });
  });

  test('standalone rejects dotted action names; merged accepts them', () => {
    // Dotted name is invalid as a provider tool name (standalone), valid as an
    // enum value (merged).
    expect(() => extendPreset('core', { id: 'bad-standalone', actions: footnoteActions, standalone: true })).toThrow(
      SuperDocCliError,
    );
    expect(() => extendPreset('core', { id: 'ok-merged', actions: footnoteActions })).not.toThrow();
  });

  test('anthropic cache:true marks exactly the LAST tool after standalone append', async () => {
    const safe = footnoteActions.map((r) => ({ ...r, name: r.name.replace('.', '_') }));
    const acme = extendPreset('core', { id: 'acme-cache', actions: safe, standalone: true });
    registerPreset(acme);
    REGISTERED.push('acme-cache');
    const { tools, meta } = await chooseTools({ provider: 'anthropic', preset: 'acme-cache', cache: true });
    expect(meta.cacheStrategy).toBe('explicit');
    const withMarker = tools.filter((t) => (t as Record<string, unknown>).cache_control != null);
    expect(withMarker.length).toBe(1);
    // and it must be the final tool in the list
    expect((tools[tools.length - 1] as Record<string, unknown>).cache_control).toEqual({ type: 'ephemeral' });
  });

  test('catalog and system prompt include custom actions', async () => {
    const acme = extendPreset('core', { id: 'acme-cat', actions: footnoteActions });
    registerPreset(acme);
    REGISTERED.push('acme-cat');
    const catalog = await getToolCatalog('acme-cat');
    const row = catalog.tools.find((t) => t.toolName === 'footnotes.add');
    expect(row).toBeDefined();
    expect(row?.mutates).toBe(true);
    expect(row?.operations).toEqual([]);
    const prompt = await getSystemPrompt('acme-cat');
    expect(prompt).toContain('## Custom actions');
    expect(prompt).toContain('footnotes.add');
  });
});

describe('collision / duplicate validation', () => {
  test('rejects a custom action named after a reserved tool', () => {
    const bad = defineAction({ name: 'superdoc_execute_code', description: 'x', run: () => null });
    expect(() => extendPreset('core', { id: 'bad-reserved', actions: [bad], standalone: true })).toThrow(
      SuperDocCliError,
    );
  });

  test('explicit null for an optional enum arg is rejected (a value, not an absence)', async () => {
    const spec = defineAction({
      name: 'acme.enumnull',
      description: 'd',
      input: { type: 'object', properties: { mode: { type: 'string', enum: ['a', 'b'], default: 'a' } } },
      steps: [{ action: 'insert_paragraphs', args: { texts: ['x'] } }],
    });
    const acme = extendPreset('core', { id: 'acme-enumnull', actions: [spec] });
    registerPreset(acme);
    REGISTERED.push('acme-enumnull');
    await expect(
      dispatchSuperDocTool(
        {} as BoundDocApi,
        'superdoc_perform_action',
        { action: 'acme.enumnull', mode: null },
        { preset: 'acme-enumnull' },
      ),
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });

  test('required arg with a declared default is satisfied by the default', async () => {
    const calls: Array<Record<string, unknown>> = [];
    registerPreset({
      id: 'req-default-base',
      description: 'f',
      supportsCacheControl: true,
      getTools: async () => ({ tools: [], cacheStrategy: 'disabled' as const }),
      getCatalog: async () => ({ contractVersion: 'x', generatedAt: null, toolCount: 0, tools: [] }),
      getSystemPrompt: async () => 'b',
      getMcpPrompt: async () => 'b',
      dispatch: async (_h: BoundDocApi, _t: string, args: Record<string, unknown>) => {
        calls.push(args);
        return { status: 'ok' };
      },
    });
    REGISTERED.push('req-default-base');
    const spec = defineAction({
      name: 'acme.reqdef',
      description: 'd',
      input: { type: 'object', properties: { label: { type: 'string', default: 'D' } }, required: ['label'] },
      steps: [{ action: 'insert_paragraphs', args: { texts: ['{{label}}'] } }],
    });
    const acme = extendPreset('req-default-base', { id: 'acme-reqdef', actions: [spec] });
    registerPreset(acme);
    REGISTERED.push('acme-reqdef');
    const receipt = (await dispatchSuperDocTool(
      {} as BoundDocApi,
      'superdoc_perform_action',
      { action: 'acme.reqdef' }, // label omitted — default must satisfy `required`
      { preset: 'acme-reqdef' },
    )) as { status: string };
    expect(receipt.status).toBe('succeeded');
    expect(calls[0]!.texts).toEqual(['D']);
  });

  test('rejects a custom action colliding with a built-in name', () => {
    const builtin = ACTION_NAMES_LIST[0]!;
    const bad = defineAction({ name: builtin, description: 'x', run: () => null });
    expect(() => extendPreset('core', { id: 'bad', actions: [bad] })).toThrow(SuperDocCliError);
  });

  test('rejects duplicate custom names', () => {
    const a = defineAction({ name: 'dup.one', description: 'a', run: () => null });
    const b = defineAction({ name: 'dup.one', description: 'b', run: () => null });
    expect(() => extendPreset('core', { id: 'dup', actions: [a, b] })).toThrow(SuperDocCliError);
  });
});

describe('registerPreset / unregisterPreset', () => {
  test('cannot overwrite a built-in preset id', () => {
    const fake = extendPreset('core', { id: 'will-rename', actions: [] });
    const asCore = { ...fake, id: 'core' };
    expect(() => registerPreset(asCore)).toThrow(SuperDocCliError);
  });

  test('cannot unregister a built-in', () => {
    expect(() => unregisterPreset('core')).toThrow(SuperDocCliError);
  });

  test('register then resolve then unregister', () => {
    const p = extendPreset('core', { id: 'tmp-preset', actions: footnoteActions });
    registerPreset(p);
    expect(getPreset('tmp-preset').id).toBe('tmp-preset');
    unregisterPreset('tmp-preset');
    expect(() => getPreset('tmp-preset')).toThrow(SuperDocCliError);
  });
});

describe('dispatch — validation + delegation (tier-agnostic)', () => {
  test('missing required arg throws INVALID_ARGUMENT before dispatch', async () => {
    const acme = extendPreset('core', { id: 'acme-validate', actions: footnoteActions });
    registerPreset(acme);
    REGISTERED.push('acme-validate');
    await expect(
      dispatchSuperDocTool(
        {} as BoundDocApi,
        'superdoc_perform_action',
        { action: 'footnotes.add', content: 'x' },
        { preset: 'acme-validate' },
      ),
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });

  test('a non-custom action delegates to the base dispatch', async () => {
    let delegated = false;
    registerPreset({
      id: 'fake-delegate',
      description: 'f',
      supportsCacheControl: true,
      getTools: async () => ({ tools: [], cacheStrategy: 'disabled' as const }),
      getCatalog: async () => ({ contractVersion: 'x', generatedAt: null, toolCount: 0, tools: [] }),
      getSystemPrompt: async () => 'b',
      getMcpPrompt: async () => 'b',
      dispatch: async (_h: BoundDocApi, tool: string, args: Record<string, unknown>) => {
        delegated = true;
        return { delegatedTool: tool, action: args.action };
      },
    });
    REGISTERED.push('fake-delegate');
    const acme = extendPreset('fake-delegate', { id: 'acme-delegate', actions: footnoteActions });
    registerPreset(acme);
    REGISTERED.push('acme-delegate');
    const result = (await dispatchSuperDocTool(
      {} as BoundDocApi,
      'superdoc_perform_action',
      { action: 'insert_paragraphs', text: 'hi' },
      { preset: 'acme-delegate' },
    )) as { delegatedTool: string };
    expect(delegated).toBe(true);
    expect(result.delegatedTool).toBe('superdoc_perform_action');
  });
});

describe('dispatch — steps tier', () => {
  /** Fake base that records perform_action step dispatches and returns scripted receipts. */
  function stepsBase(id: string, receipts: Array<Record<string, unknown> | Error>) {
    const calls: Array<Record<string, unknown>> = [];
    let cursor = 0;
    registerPreset({
      id,
      description: 'fake steps base',
      supportsCacheControl: true,
      getTools: async () => ({ tools: [], cacheStrategy: 'disabled' as const }),
      getCatalog: async () => ({ contractVersion: 'x', generatedAt: null, toolCount: 0, tools: [] }),
      getSystemPrompt: async () => 'base',
      getMcpPrompt: async () => 'base',
      dispatch: async (_h: BoundDocApi, tool: string, args: Record<string, unknown>) => {
        expect(tool).toBe('superdoc_perform_action');
        calls.push(args);
        const next = receipts[Math.min(cursor, receipts.length - 1)]!;
        cursor += 1;
        if (next instanceof Error) throw next;
        return next;
      },
    });
    REGISTERED.push(id);
    return calls;
  }

  const stamp = defineAction({
    name: 'acme.stamp',
    description: 'banner + comment',
    input: {
      type: 'object',
      properties: { label: { type: 'string', default: 'CONFIDENTIAL' } },
    },
    steps: [
      { action: 'insert_paragraphs', args: { texts: ['{{label}}'], placement: { at: 'document_start' } } },
      {
        action: 'add_comments',
        args: {
          selectors: [{ kind: 'textSearch', terms: ['{{label}}'] }],
          commentText: 'Stamped: {{label}} — verify.',
        },
      },
    ],
  });

  test('dispatches each step through the base with templating + defaults applied', async () => {
    const calls = stepsBase('steps-ok', [{ status: 'ok', verificationPassed: true }]);
    const acme = extendPreset('steps-ok', { id: 'acme-steps', actions: [stamp] });
    registerPreset(acme);
    REGISTERED.push('acme-steps');
    const receipt = (await dispatchSuperDocTool(
      {} as BoundDocApi,
      'superdoc_perform_action',
      { action: 'acme.stamp' }, // label omitted → default applies
      { preset: 'acme-steps' },
    )) as { status: string; steps: Array<Record<string, unknown>> };

    expect(receipt.status).toBe('succeeded');
    expect(receipt.steps).toHaveLength(2);
    // Whole-string template preserved the raw array value; default filled in.
    expect(calls[0]).toEqual({
      action: 'insert_paragraphs',
      texts: ['CONFIDENTIAL'],
      placement: { at: 'document_start' },
    });
    // Partial template interpolated as text.
    expect(calls[1]!.commentText).toBe('Stamped: CONFIDENTIAL — verify.');
    expect(calls[1]!.selectors).toEqual([{ kind: 'textSearch', terms: ['CONFIDENTIAL'] }]);
  });

  test('caller-level changeMode reaches steps that do not pin their own', async () => {
    const calls = stepsBase('steps-cm', [{ status: 'ok' }]);
    const acme = extendPreset('steps-cm', { id: 'acme-steps-cm', actions: [stamp] });
    registerPreset(acme);
    REGISTERED.push('acme-steps-cm');
    await dispatchSuperDocTool(
      {} as BoundDocApi,
      'superdoc_perform_action',
      { action: 'acme.stamp', label: 'X', changeMode: 'tracked' },
      { preset: 'acme-steps-cm' },
    );
    expect(calls[0]!.changeMode).toBe('tracked');
    expect(calls[1]!.changeMode).toBe('tracked');
  });

  test('surface excludeActions are NOT forwarded into internal step dispatch', async () => {
    // Base that simulates core's defense-in-depth: refuse any call whose action
    // is in the invoke-time excludeActions. If a surface exclusion leaked into
    // the steps, the insert_paragraphs step would be refused and acme.stamp
    // (advertised!) would fail — the coherence bug this guards against.
    const seenOptions: Array<{ excludeActions?: unknown } | undefined> = [];
    registerPreset({
      id: 'steps-excl-base',
      description: 'fake base enforcing invoke-time exclusions',
      supportsCacheControl: true,
      getTools: async () => ({ tools: [], cacheStrategy: 'disabled' as const }),
      getCatalog: async () => ({ contractVersion: 'x', generatedAt: null, toolCount: 0, tools: [] }),
      getSystemPrompt: async () => 'base',
      getMcpPrompt: async () => 'base',
      dispatch: async (_h: BoundDocApi, _tool: string, args: Record<string, unknown>, invokeOptions?: unknown) => {
        const opts = invokeOptions as { excludeActions?: string[] } | undefined;
        seenOptions.push(opts);
        if (opts?.excludeActions?.includes(args.action as string)) {
          throw new SuperDocCliError(`Action ${String(args.action)} is excluded by configuration.`, {
            code: 'INVALID_ARGUMENT',
            details: { excluded: true },
          });
        }
        return { status: 'ok', verificationPassed: true };
      },
    });
    REGISTERED.push('steps-excl-base');
    const acme = extendPreset('steps-excl-base', { id: 'acme-steps-excl', actions: [stamp] });
    registerPreset(acme);
    REGISTERED.push('acme-steps-excl');

    // Hide insert_paragraphs from the model, but acme.stamp composes it.
    const receipt = (await dispatchSuperDocTool(
      {} as BoundDocApi,
      'superdoc_perform_action',
      { action: 'acme.stamp' },
      { preset: 'acme-steps-excl', excludeActions: ['insert_paragraphs'] } as never,
    )) as { status: string; steps: unknown[] };
    expect(receipt.status).toBe('succeeded'); // step NOT refused
    expect(receipt.steps).toHaveLength(2);
    // Every internal step dispatch saw options WITHOUT excludeActions.
    expect(seenOptions.every((o) => o?.excludeActions === undefined)).toBe(true);

    // Guard preserved: a DIRECT model call to the hidden built-in is still refused.
    await expect(
      dispatchSuperDocTool({} as BoundDocApi, 'superdoc_perform_action', { action: 'insert_paragraphs', text: 'x' }, {
        preset: 'acme-steps-excl',
        excludeActions: ['insert_paragraphs'],
      } as never),
    ).rejects.toThrow(/excluded/);
  });

  test('second-step failure aggregates to partial with failedStep evidence', async () => {
    stepsBase('steps-fail2', [{ status: 'ok' }, { status: 'failed', errors: [{ message: 'no match' }] }]);
    const acme = extendPreset('steps-fail2', { id: 'acme-steps-f2', actions: [stamp] });
    registerPreset(acme);
    REGISTERED.push('acme-steps-f2');
    const receipt = (await dispatchSuperDocTool(
      {} as BoundDocApi,
      'superdoc_perform_action',
      { action: 'acme.stamp' },
      { preset: 'acme-steps-f2' },
    )) as { status: string; failedStep?: { index: number } };
    expect(receipt.status).toBe('partial');
    expect(receipt.failedStep?.index).toBe(1);
  });

  test('first-step thrown validation error aggregates to failed', async () => {
    stepsBase('steps-throw', [new SuperDocCliError('bad args', { code: 'INVALID_ARGUMENT' })]);
    const acme = extendPreset('steps-throw', { id: 'acme-steps-throw', actions: [stamp] });
    registerPreset(acme);
    REGISTERED.push('acme-steps-throw');
    const receipt = (await dispatchSuperDocTool(
      {} as BoundDocApi,
      'superdoc_perform_action',
      { action: 'acme.stamp' },
      { preset: 'acme-steps-throw' },
    )) as { status: string; steps: Array<{ status: string }> };
    expect(receipt.status).toBe('failed');
    expect(receipt.steps[0]!.status).toBe('failed');
  });
});

describe('dispatch — steps tier extras', () => {
  const parity = defineAction({
    name: 'acme.parity',
    description: 'd',
    steps: [{ action: 'insert_paragraphs', args: { texts: ['flag={{flag}} items={{items}} obj={{obj}}'] } }],
  });
  const arrmiss = defineAction({
    name: 'acme.arrmiss',
    description: 'd',
    steps: [{ action: 'insert_paragraphs', args: { texts: ['{{present}}', '{{absent}}'] } }],
  });

  function stepsBase2(id: string, receipts: Array<Record<string, unknown>>) {
    const calls: Array<Record<string, unknown>> = [];
    let cursor = 0;
    registerPreset({
      id,
      description: 'fake',
      supportsCacheControl: true,
      getTools: async () => ({ tools: [], cacheStrategy: 'disabled' as const }),
      getCatalog: async () => ({ contractVersion: 'x', generatedAt: null, toolCount: 0, tools: [] }),
      getSystemPrompt: async () => 'base',
      getMcpPrompt: async () => 'base',
      dispatch: async (_h: BoundDocApi, _tool: string, args: Record<string, unknown>) => {
        calls.push(args);
        const next = receipts[Math.min(cursor, receipts.length - 1)]!;
        cursor += 1;
        return next;
      },
    });
    REGISTERED.push(id);
    return calls;
  }

  test('a PARTIAL step never rolls up into succeeded', async () => {
    stepsBase2('steps-partial', [{ status: 'ok' }, { status: 'partial' }]);
    const spec = defineAction({
      name: 'acme.twostep',
      description: 'd',
      steps: [
        { action: 'insert_paragraphs', args: { texts: ['a'] } },
        { action: 'add_comments', args: { selectors: [], commentText: 'c' } },
      ],
    });
    const acme = extendPreset('steps-partial', { id: 'acme-partial', actions: [spec] });
    registerPreset(acme);
    REGISTERED.push('acme-partial');
    const receipt = (await dispatchSuperDocTool(
      {} as BoundDocApi,
      'superdoc_perform_action',
      { action: 'acme.twostep' },
      { preset: 'acme-partial' },
    )) as { status: string; failedStep?: { index: number } };
    expect(receipt.status).toBe('partial');
    expect(receipt.failedStep?.index).toBe(1);
  });

  test('partial-template text forms are the cross-language JSON forms', async () => {
    const calls = stepsBase2('steps-parity', [{ status: 'ok' }]);
    const acme = extendPreset('steps-parity', { id: 'acme-parity', actions: [parity] });
    registerPreset(acme);
    REGISTERED.push('acme-parity');
    await dispatchSuperDocTool(
      {} as BoundDocApi,
      'superdoc_perform_action',
      { action: 'acme.parity', flag: true, items: [1, 2], obj: { a: 1 } },
      { preset: 'acme-parity' },
    );
    expect(calls[0]!.texts).toEqual(['flag=true items=[1,2] obj={"a":1}']);
  });

  test('whole-string templates for absent args are dropped from arrays', async () => {
    const calls = stepsBase2('steps-arrmiss', [{ status: 'ok' }]);
    const acme = extendPreset('steps-arrmiss', { id: 'acme-arrmiss', actions: [arrmiss] });
    registerPreset(acme);
    REGISTERED.push('acme-arrmiss');
    await dispatchSuperDocTool(
      {} as BoundDocApi,
      'superdoc_perform_action',
      { action: 'acme.arrmiss', present: 'AAA' },
      { preset: 'acme-arrmiss' },
    );
    expect(calls[0]!.texts).toEqual(['AAA']);
  });

  test('a raw spec with empty steps is rejected at extend time', () => {
    const raw = {
      name: 'acme.empty',
      description: 'd',
      inputSchema: { type: 'object', properties: {} },
      steps: [],
    } as never;
    expect(() => extendPreset('core', { id: 'acme-empty', actions: [raw] })).toThrow(SuperDocCliError);
  });
});

describe('dispatch — run tier (native)', () => {
  function handleWithRevisions(revisions: string[]) {
    let i = 0;
    return {
      info: async () => ({ revision: revisions[Math.min(i++, revisions.length - 1)] }),
    } as unknown as BoundDocApi;
  }

  test('success receipt carries pre/post revision and the result', async () => {
    const native = defineAction({
      name: 'acme.native',
      description: 'd',
      input: { type: 'object', properties: { x: { type: 'number', default: 7 } } },
      run: async (_doc, args) => ({ got: args.x }),
    });
    const acme = extendPreset('core', { id: 'acme-native', actions: [native] });
    registerPreset(acme);
    REGISTERED.push('acme-native');
    const receipt = (await dispatchSuperDocTool(
      handleWithRevisions(['0', '1']),
      'superdoc_perform_action',
      { action: 'acme.native' },
      { preset: 'acme-native' },
    )) as Record<string, unknown>;
    expect(receipt.status).toBe('succeeded');
    expect(receipt.result).toEqual({ got: 7 });
    expect(receipt.preRevision).toBe('0');
    expect(receipt.postRevision).toBe('1');
  });

  test('failure after mutation reports partialMutation + revert recovery', async () => {
    const native = defineAction({
      name: 'acme.native-fail',
      description: 'd',
      run: async () => {
        throw new Error('boom between ops');
      },
    });
    const acme = extendPreset('core', { id: 'acme-native-fail', actions: [native] });
    registerPreset(acme);
    REGISTERED.push('acme-native-fail');
    const receipt = (await dispatchSuperDocTool(
      handleWithRevisions(['3', '4']),
      'superdoc_perform_action',
      { action: 'acme.native-fail' },
      { preset: 'acme-native-fail' },
    )) as Record<string, unknown>;
    expect(receipt.status).toBe('failed');
    expect(receipt.partialMutation).toBe(true);
    expect((receipt.recovery as { kind: string }).kind).toBe('revert');
  });

  test('failure without mutation reports retry recovery', async () => {
    const native = defineAction({
      name: 'acme.native-clean-fail',
      description: 'd',
      run: async () => {
        throw new Error('failed before touching the doc');
      },
    });
    const acme = extendPreset('core', { id: 'acme-native-cf', actions: [native] });
    registerPreset(acme);
    REGISTERED.push('acme-native-cf');
    const receipt = (await dispatchSuperDocTool(
      handleWithRevisions(['5', '5']),
      'superdoc_perform_action',
      { action: 'acme.native-clean-fail' },
      { preset: 'acme-native-cf' },
    )) as Record<string, unknown>;
    expect(receipt.status).toBe('failed');
    expect(receipt.partialMutation).toBe(false);
    expect((receipt.recovery as { kind: string }).kind).toBe('retry');
  });
});

describe('composePreset', () => {
  test('custom-only preset (includeCoreActions: []) still advertises perform_action', async () => {
    const composed = composePreset({
      id: 'composed-custom-only',
      baseId: 'core',
      includeCoreActions: [],
      actions: footnoteActions,
    });
    registerPreset(composed);
    REGISTERED.push('composed-custom-only');
    const { tools } = await chooseTools({ provider: 'openai', preset: 'composed-custom-only' });
    const perform = tools.find((t) => toolName(t) === 'superdoc_perform_action');
    expect(perform).toBeDefined(); // synthesized — the base dropped it
    const names = actionProp(perform)?.enum ?? [];
    for (const r of footnoteActions) expect(names).toContain(r.name);
    expect(names).not.toContain('insert_paragraphs');
  });

  test('includeCoreActions + excludeActions(custom) does not leak the excluded name into the enum', async () => {
    const composed = composePreset({
      id: 'composed-leak',
      baseId: 'core',
      includeCoreActions: ['insert_paragraphs'],
      actions: footnoteActions,
    });
    registerPreset(composed);
    REGISTERED.push('composed-leak');
    const { tools } = await chooseTools({
      provider: 'generic',
      preset: 'composed-leak',
      excludeActions: ['footnotes.add'],
    });
    const perform = tools.find((t) => toolName(t) === 'superdoc_perform_action');
    const names = actionProp(perform)?.enum ?? [];
    expect(names).not.toContain('footnotes.add'); // must not leak back via the allowlist rebuild
    expect(names).toContain('footnotes.list');
    expect(names).toContain('insert_paragraphs');
    // The DESCRIPTION narrows with the allowlist too — the base rebuilds it
    // from the derived exclusion, not a hand-rolled filter.
    const description = (perform as { description?: string }).description ?? '';
    expect(description).not.toContain('create_table');
  });

  test('getToolCatalog narrows the composed perform_action enum, args, AND description with the allowlist', async () => {
    const composed = composePreset({
      id: 'composed-cat',
      baseId: 'core',
      includeCoreActions: ['insert_paragraphs'],
      actions: footnoteActions,
    });
    registerPreset(composed);
    REGISTERED.push('composed-cat');
    const catalog = await getToolCatalog('composed-cat');
    const perform = catalog.tools.find((t) => t.toolName === 'superdoc_perform_action');
    const schema = perform?.inputSchema as { properties?: Record<string, { enum?: string[] }> } | undefined;
    const names = schema?.properties?.action?.enum ?? [];
    expect(names).toContain('insert_paragraphs');
    expect(names).not.toContain('create_table'); // outside the allowlist — must not appear in the catalog
    // The row narrows BEYOND the enum: create_table-only args are gone, so a
    // catalog-driven UI/validator can't offer inputs for an action the preset
    // refuses (the coherence gap this test guards against).
    const props = Object.keys(schema?.properties ?? {});
    expect(props).not.toContain('rows');
    expect(props).not.toContain('columns');
    expect(props).toContain('text'); // insert_paragraphs' own arg survives
    expect(perform?.description ?? '').not.toContain('create_table'); // description narrows too
    // custom actions appear as their own catalog rows (the catalog keeps custom
    // as separate rows rather than merging them into perform_action's enum the
    // way getTools does — so the built-in row here carries built-ins only).
    expect(catalog.tools.some((t) => t.toolName === 'footnotes.add')).toBe(true);
  });

  test('getToolCatalog perform_action row matches getTools when there are no custom actions', async () => {
    const composed = composePreset({
      id: 'composed-cat-nocustom',
      baseId: 'core',
      includeCoreActions: ['insert_paragraphs'],
    });
    registerPreset(composed);
    REGISTERED.push('composed-cat-nocustom');
    const catalog = await getToolCatalog('composed-cat-nocustom');
    const row = catalog.tools.find((t) => t.toolName === 'superdoc_perform_action');
    const rowProps = Object.keys((row?.inputSchema as { properties?: Record<string, unknown> })?.properties ?? {});
    // With no custom actions the two representations coincide, so the row must
    // equal the advertised tool exactly — one narrowing, no drift.
    const { tools } = await chooseTools({ provider: 'generic', preset: 'composed-cat-nocustom' });
    const advertised = tools.find((t) => toolName(t) === 'superdoc_perform_action');
    expect(
      (row?.inputSchema as { properties?: { action?: { enum?: string[] } } })?.properties?.action?.enum ?? [],
    ).toEqual(actionProp(advertised)?.enum ?? []);
    expect(rowProps.sort()).toEqual(Object.keys(schemaOf(advertised)?.properties ?? {}).sort());
  });

  test('getToolCatalog drops perform_action when the allowlist excludes every built-in', async () => {
    const empty = composePreset({
      id: 'composed-cat-empty',
      baseId: 'core',
      includeCoreActions: [],
    });
    registerPreset(empty);
    REGISTERED.push('composed-cat-empty');
    const emptyCatalog = await getToolCatalog('composed-cat-empty');
    expect(emptyCatalog.tools.some((t) => t.toolName === 'superdoc_perform_action')).toBe(false);

    const customOnly = composePreset({
      id: 'composed-cat-custom-only',
      baseId: 'core',
      includeCoreActions: [],
      actions: footnoteActions,
    });
    registerPreset(customOnly);
    REGISTERED.push('composed-cat-custom-only');
    const customOnlyCatalog = await getToolCatalog('composed-cat-custom-only');
    expect(customOnlyCatalog.tools.some((t) => t.toolName === 'superdoc_perform_action')).toBe(false);
    for (const action of footnoteActions) {
      expect(customOnlyCatalog.tools.some((t) => t.toolName === action.name)).toBe(true);
    }
  });

  test('includeCoreActions is enforced at DISPATCH, not only in the enum', async () => {
    const composed = composePreset({
      id: 'composed-allowlist',
      baseId: 'core',
      includeCoreActions: ['insert_paragraphs'],
      actions: footnoteActions,
    });
    registerPreset(composed);
    REGISTERED.push('composed-allowlist');
    await expect(
      dispatchSuperDocTool(
        {} as BoundDocApi,
        'superdoc_perform_action',
        { action: 'create_table', rows: 1, columns: 1 },
        { preset: 'composed-allowlist' },
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
      details: { excluded: true, excludedBy: 'includeCoreActions' },
    });
  });

  test('excludeActions with a CUSTOM name neither throws nor advertises it', async () => {
    const composed = composePreset({ id: 'composed-excl', baseId: 'core', actions: footnoteActions });
    registerPreset(composed);
    REGISTERED.push('composed-excl');
    const excludeActions = ['footnotes.add', 'create_table'];
    const { tools } = await chooseTools({ provider: 'generic', preset: 'composed-excl', excludeActions });
    const names = actionProp(tools.find((t) => toolName(t) === 'superdoc_perform_action'))?.enum ?? [];
    expect(names).not.toContain('footnotes.add');
    expect(names).not.toContain('create_table');
    expect(names).toContain('footnotes.list');
    const prompt = await getSystemPrompt('composed-excl', { excludeActions });
    expect(prompt).not.toContain('- footnotes.add —');
  });

  test('drops superdoc_execute_code from advertised tools but keeps it dispatchable', async () => {
    const composed = composePreset({
      id: 'composed-1',
      baseId: 'core',
      includeExecuteCode: false,
      actions: footnoteActions,
    });
    registerPreset(composed);
    REGISTERED.push('composed-1');
    const { tools } = await chooseTools({ provider: 'generic', preset: 'composed-1' });
    expect(tools.map(toolName)).not.toContain('superdoc_execute_code');
    // custom actions still merged into superdoc_perform_action
    const names = actionProp(tools.find((t) => toolName(t) === 'superdoc_perform_action'))?.enum ?? [];
    expect(names).toContain('footnotes.add');
  });

  test('includeCoreActions filters the superdoc_perform_action enum to the subset ∪ custom names', async () => {
    const composed = composePreset({
      id: 'composed-2',
      baseId: 'core',
      includeCoreActions: ['insert_paragraphs', 'replace_text'],
      actions: footnoteActions,
    });
    registerPreset(composed);
    REGISTERED.push('composed-2');
    const { tools } = await chooseTools({ provider: 'generic', preset: 'composed-2' });
    const names = actionProp(tools.find((t) => toolName(t) === 'superdoc_perform_action'))?.enum ?? [];
    expect(names).toContain('insert_paragraphs');
    expect(names).toContain('replace_text');
    expect(names).toContain('footnotes.add');
    expect(names).not.toContain('create_table');
  });
});

describe('createAgentToolkit — one-call custom actions', () => {
  test('actions build the surface directly — no registerPreset, no preset id to manage', async () => {
    const stamp = defineAction({
      name: 'superdoc.demo_stamp',
      description: 'Insert a demo banner.',
      input: { type: 'object', properties: { label: { type: 'string' } } },
      steps: [{ action: 'insert_paragraphs', args: { texts: ['{{label}}'] } }],
    });
    const { tools, systemPrompt, dispatch, meta } = await createAgentToolkit({
      provider: 'openai',
      actions: [stamp],
    });
    const perform = tools.find((t) => toolName(t) === 'superdoc_perform_action');
    expect(actionProp(perform)?.enum ?? []).toContain('superdoc.demo_stamp'); // custom action advertised
    expect(systemPrompt).toContain('superdoc.demo_stamp'); // prompt narrows WITH it
    expect(typeof dispatch).toBe('function');
    expect(meta.preset).toBe('custom_superdoc_preset');
    expect(listPresets().includes('custom_superdoc_preset')).toBe(false); // ephemeral — no global leak
  });

  test('includeCoreActions keeps only the named built-ins alongside customs', async () => {
    const stamp = defineAction({
      name: 'superdoc.demo_stamp',
      description: 'Insert a demo banner.',
      input: { type: 'object', properties: {} },
      steps: [{ action: 'insert_paragraphs', args: { texts: ['x'] } }],
    });
    const { tools } = await createAgentToolkit({
      provider: 'generic',
      actions: [stamp],
      includeCoreActions: ['insert_paragraphs'],
    });
    const names = actionProp(tools.find((t) => toolName(t) === 'superdoc_perform_action'))?.enum ?? [];
    expect(names).toContain('insert_paragraphs');
    expect(names).toContain('superdoc.demo_stamp');
    expect(names).not.toContain('create_table');
  });
});

describe('defineAction / merge — schema guards', () => {
  test('two actions declaring the same arg with incompatible types are rejected', async () => {
    const a = defineAction({
      name: 'x.a',
      description: 'a',
      input: { type: 'object', properties: { foo: { type: 'string' } } },
      run: () => null,
    });
    const b = defineAction({
      name: 'x.b',
      description: 'b',
      input: { type: 'object', properties: { foo: { type: 'number' } } },
      run: () => null,
    });
    await expect(createAgentToolkit({ provider: 'openai', actions: [a, b] })).rejects.toThrow(
      /argument "foo".*conflicts/,
    );
  });

  test('a shared arg name with a compatible type + extra DESCRIPTION only is allowed', async () => {
    // Reusing a built-in arg name (e.g. anchorText) with your own description
    // is fine — only documentation differs, so it is NOT a conflict.
    const a = defineAction({
      name: 'x.a',
      description: 'a',
      input: { type: 'object', properties: { foo: { type: 'string' } } },
      run: () => null,
    });
    const b = defineAction({
      name: 'x.b',
      description: 'b',
      input: { type: 'object', properties: { foo: { type: 'string', description: 'documented' } } },
      run: () => null,
    });
    const { tools } = await createAgentToolkit({ provider: 'generic', actions: [a, b] });
    expect(actionProp(tools.find((t) => toolName(t) === 'superdoc_perform_action'))?.enum ?? []).toContain('x.b');
  });

  test('a shared arg name whose schemas differ beyond description (one-sided enum) is rejected', async () => {
    const a = defineAction({
      name: 'x.a',
      description: 'a',
      input: { type: 'object', properties: { mode: { type: 'string' } } },
      run: () => null,
    });
    const b = defineAction({
      name: 'x.b',
      description: 'b',
      input: { type: 'object', properties: { mode: { type: 'string', enum: ['fast', 'slow'] } } },
      run: () => null,
    });
    await expect(createAgentToolkit({ provider: 'generic', actions: [a, b] })).rejects.toThrow(
      /argument "mode".*conflicts/,
    );
  });

  test('the same arg with an IDENTICAL schema across actions is allowed', async () => {
    const a = defineAction({
      name: 'x.a',
      description: 'a',
      input: { type: 'object', properties: { foo: { type: 'string' } } },
      run: () => null,
    });
    const b = defineAction({
      name: 'x.b',
      description: 'b',
      input: { type: 'object', properties: { foo: { type: 'string' } } },
      run: () => null,
    });
    const { tools } = await createAgentToolkit({ provider: 'generic', actions: [a, b] });
    expect(actionProp(tools.find((t) => toolName(t) === 'superdoc_perform_action'))?.enum ?? []).toContain('x.a');
  });

  test('the same arg with a REORDERED but identical schema is allowed (order-insensitive compare)', async () => {
    const a = defineAction({
      name: 'x.a',
      description: 'a',
      input: { type: 'object', properties: { foo: { type: 'string', description: 'the foo' } } },
      run: () => null,
    });
    const b = defineAction({
      name: 'x.b',
      description: 'b',
      input: { type: 'object', properties: { foo: { description: 'the foo', type: 'string' } } },
      run: () => null,
    });
    const { tools } = await createAgentToolkit({ provider: 'generic', actions: [a, b] });
    expect(actionProp(tools.find((t) => toolName(t) === 'superdoc_perform_action'))?.enum ?? []).toContain('x.b');
  });

  test('a Zod-like schema is rejected with a clear error (convert to JSON Schema)', () => {
    const zodish = { _def: { typeName: 'ZodObject' }, parse: () => ({}) };
    expect(() => defineAction({ name: 'x.zod', description: 'z', input: zodish, run: () => null } as never)).toThrow(
      /JSON Schema/,
    );
  });

  test('preset surface is immutable — mutating the caller actions array after build has no effect', async () => {
    const mk = (name: string) =>
      defineAction({
        name,
        description: 'd',
        input: { type: 'object', properties: {} },
        steps: [{ action: 'insert_paragraphs', args: { texts: ['x'] } }],
      });
    const arr = [mk('x.snapshotted')];
    const preset = extendPreset('core', { id: 'snap-preset', actions: arr });
    registerPreset(preset);
    REGISTERED.push('snap-preset');

    // Caller mutates its array AFTER the preset was built — must NOT leak in.
    arr.length = 0;
    arr.push(mk('x.injected'));

    const { tools } = await chooseTools({ provider: 'generic', preset: 'snap-preset' });
    const names = actionProp(tools.find((t) => toolName(t) === 'superdoc_perform_action'))?.enum ?? [];
    expect(names).toContain('x.snapshotted'); // original still advertised
    expect(names).not.toContain('x.injected'); // post-build push did not leak into the surface
  });
});
