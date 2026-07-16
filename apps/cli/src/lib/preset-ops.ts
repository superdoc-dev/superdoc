/**
 * `preset` CLI-only operations — thin proxies over the Node SDK preset registry.
 *
 * These six ops let cross-language consumers (e.g. the Python SDK's `core` preset)
 * call into the Node SDK's preset machinery (catalogs, prompts, dispatch) without
 * re-implementing it. They mirror the Node SDK public surface from
 * `@superdoc-dev/sdk` (`getPreset`, `listPresets`, `DEFAULT_PRESET`):
 *
 *   - doc.preset.list           → { presets, defaultPreset }
 *   - doc.preset.getCatalog     → preset.getCatalog()
 *   - doc.preset.getTools       → preset.getTools(provider, { cache })
 *   - doc.preset.getSystemPrompt → preset.getSystemPrompt()
 *   - doc.preset.getMcpPrompt   → preset.getMcpPrompt()
 *   - doc.preset.dispatch       → preset.dispatch(editor.doc, toolName, args)
 *
 * `dispatch` requires an active session; the others are session-less reads.
 *
 * Trust boundary: the SDK preset code runs IN-HOST against the live `editor.doc`.
 * Action / agent dispatch paths read and mutate the doc just like the SDK would
 * if it spawned the CLI back; doing it in-process avoids a recursive
 * Python -> CLI(preset.dispatch) -> SDK -> CLI(doc.*) trip.
 */

import type { DocumentApi } from '@superdoc/document-api';
import {
  DEFAULT_PRESET,
  getPreset,
  listPresets,
  type CacheStrategy,
  type ToolCatalog,
  type ToolProvider,
} from '@superdoc-dev/sdk';
import type { EditorWithDoc } from './document';
import { executeCodeWithRollback } from './execute-code-rollback';
import type { ExecuteCodeResult } from './execute-code';

// The SDK does not publicly re-export GetToolsResult; reproduce it inline.
export type PresetGetToolsResult = { tools: unknown[]; cacheStrategy: CacheStrategy };

export type PresetListResult = { presets: readonly string[]; defaultPreset: string };

export function runPresetList(): PresetListResult {
  return { presets: listPresets(), defaultPreset: DEFAULT_PRESET };
}

export async function runPresetGetCatalog(presetId: string | undefined): Promise<ToolCatalog> {
  return getPreset(presetId).getCatalog();
}

export async function runPresetGetTools(
  presetId: string | undefined,
  provider: ToolProvider,
  cache: boolean,
  excludeActions?: readonly string[],
): Promise<PresetGetToolsResult> {
  return getPreset(presetId).getTools(provider, { cache, excludeActions });
}

export async function runPresetGetSystemPrompt(
  presetId: string | undefined,
  excludeActions?: readonly string[],
): Promise<string> {
  return getPreset(presetId).getSystemPrompt(excludeActions?.length ? { excludeActions } : undefined);
}

export async function runPresetGetMcpPrompt(presetId: string | undefined): Promise<string> {
  return getPreset(presetId).getMcpPrompt();
}

/**
 * In-host adapter that lets the SDK preset's dispatcher route into the live
 * Document API. The SDK dispatcher expects a `BoundDocApi` (async + sessioned);
 * the CLI hands it the editor's synchronous `editor.doc`. Two adjustments:
 *
 *   1. `executeCode` — `BoundDocApi.executeCode` is a CLI-only RPC method.
 *      The synchronous `editor.doc` does NOT carry an `executeCode` method,
 *      so we shim one in that runs the model JS in-process via `executeCode()`
 *      from `./execute-code`. This matches what the host CLI does for
 *      `doc.executeCode`.
 *
 *   2. Every other namespace is exposed verbatim — action code accesses
 *      `doc.create.paragraph(...)` / `doc.blocks.list(...)` etc. structurally
 *      and `await`s every call, which is transparent for sync methods.
 */
function makePresetDocAdapter(editor: EditorWithDoc, executeCodeTimeoutMs?: number): unknown {
  const editorDoc = editor.doc as unknown as DocumentApi;
  return new Proxy(editorDoc as unknown as Record<string, unknown>, {
    get(target, prop, receiver) {
      if (prop === 'executeCode') {
        return async (params: { code?: unknown }): Promise<ExecuteCodeResult> => {
          const code = typeof params?.code === 'string' ? params.code : '';
          // Same snapshot→run→rollback envelope as the `execute code`
          // command: a script that mutates and then throws is restored
          // instead of persisting partial edits (result.rolledBack marks it).
          const { result } = await executeCodeWithRollback(editor, code, { timeoutMs: executeCodeTimeoutMs });
          return result;
        };
      }
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === 'function') {
        return value.bind(target);
      }
      return value;
    },
  });
}

/**
 * Dispatch `toolName` through the requested preset's dispatcher.
 *
 * The SDK's PresetDescriptor.dispatch is typed to a `BoundDocApi`; we hand it
 * an in-host adapter wrapping the live `editor.doc`. See
 * {@link makePresetDocAdapter} for the executeCode shim.
 */
export async function runPresetDispatch(
  presetId: string | undefined,
  toolName: string,
  args: Record<string, unknown>,
  editor: EditorWithDoc,
  exclusions?: { excludeActions?: readonly string[]; executeCodeTimeoutMs?: number },
): Promise<unknown> {
  const preset = getPreset(presetId);
  const adapter = makePresetDocAdapter(editor, exclusions?.executeCodeTimeoutMs) as Parameters<
    typeof preset.dispatch
  >[0];
  // Exclusions ride the invoke-options channel; the core preset's dispatch
  // guard reads and strips them (defense-in-depth for narrowed surfaces).
  const invokeOptions = exclusions?.excludeActions?.length
    ? ({ excludeActions: exclusions.excludeActions } as Parameters<typeof preset.dispatch>[3])
    : undefined;
  return preset.dispatch(adapter, toolName, args, invokeOptions);
}
