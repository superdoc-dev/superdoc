/**
 * Consumer typecheck: ProseMirror generic defaults on the public
 * Editor / Node surface (SD-3213 sub 2 drain).
 *
 * Before this change, `Editor.schema`, `Editor.registerPlugin`, and
 * `NodeConfig.addPmPlugins` all exposed bare `Schema` / `Plugin` /
 * `Plugin[]` without explicit type args. TypeScript filled those in
 * as `Schema<any, any>` and `Plugin<any>`, leaking `any` through the
 * SD-3213 supported-root audit (28 findings).
 *
 * This fixture pins three contracts:
 *   1. `editor.schema` is typed `Schema<string, string>` so node/mark
 *      names are constrained but not collapsed to `any`. Consumer
 *      schemas with literal-name unions stay assignable.
 *   2. `editor.registerPlugin<PluginState>(plugin)` preserves the
 *      incoming plugin's state type into the optional `handlePlugins`
 *      callback. The existing plugin list parameter stays
 *      `Plugin<unknown>[]` because the runtime list is heterogeneous.
 *   3. `NodeConfig.addPmPlugins` accepts `Plugin<unknown>[]` instead
 *      of the bare `Plugin[]` (= `Plugin<any>[]`) that leaked `any`.
 *
 * Also asserts that `EditorState.create({ schema, plugins })` from
 * raw `prosemirror-state` continues to typecheck against the editor
 * surface, since SuperDoc's narrowed signatures must not break the
 * underlying ProseMirror contract (`EditorStateConfig.plugins` is
 * `readonly Plugin[]`).
 */

import type { Editor } from 'superdoc';
import { EditorState, Plugin, PluginKey } from 'prosemirror-state';
import { Schema } from 'prosemirror-model';

declare const editor: Editor;

// --- 1. editor.schema: Schema<string, string> ------------------------------

// Field type is `Schema<string, string>`. `nodes` / `marks` are indexed
// by `string`, which is what node lookups across the editor surface use.
const nodeMap = editor.schema.nodes;
const markMap = editor.schema.marks;
void nodeMap;
void markMap;

// A consumer schema declared with literal-name unions remains assignable
// to the wider `Schema<string, string>` field. Variance: literal-string
// types extend `string`, so a `Schema<'paragraph' | 'text', 'em'>` is a
// subtype of `Schema<string, string>` at this position.
declare const literalSchema: Schema<'paragraph' | 'text', 'em'>;
const _schemaAssignableToField: typeof editor.schema = literalSchema;
void _schemaAssignableToField;

// --- 2. registerPlugin preserves state via generic -------------------------

interface MyPluginState {
  count: number;
}

const myPluginKey = new PluginKey<MyPluginState>('my');
const myPlugin: Plugin<MyPluginState> = new Plugin<MyPluginState>({
  key: myPluginKey,
  state: {
    init: () => ({ count: 0 }),
    apply: (_tr, value) => value,
  },
});

// Without the optional callback: PluginState is inferred from the
// argument, so the typed plugin flows through without any cast or
// widening to `any`.
editor.registerPlugin(myPlugin);

// With the optional callback: the callback's `plugin` argument keeps
// `MyPluginState`. The list parameter is `Plugin<unknown>[]` because
// the editor's plugin list is heterogeneous. Returning the typed
// plugin in that list requires a one-position cast at the boundary
// because ProseMirror's `Plugin<T>` is invariant in T (verified:
// `Plugin<MyPluginState>` is not assignable to `Plugin<unknown>`
// because `EditorProps<P>` uses P in both produces and consumes
// positions). The cast is honest about PM's variance; there is no
// `any` introduced here.
editor.registerPlugin<MyPluginState>(myPlugin, (plugin, plugins) => {
  // `plugin` keeps `MyPluginState` in the callback.
  const _typedPlugin: Plugin<MyPluginState> = plugin;
  void _typedPlugin;
  return [...plugins, plugin as Plugin<unknown>];
});

// --- 3. addPmPlugins on NodeConfig accepts Plugin<unknown>[] --------------
//
// `NodeConfig.addPmPlugins?: MaybeGetter<Plugin<unknown>[]>`. The
// list element type is `Plugin<unknown>`. Consumers with typed
// plugins cast at the list-construction boundary (same Plugin
// invariance constraint as the registerPlugin callback above).
type AddPmPluginsReturn = Plugin<unknown>[];
const pmPluginList: AddPmPluginsReturn = [myPlugin as Plugin<unknown>];
void pmPluginList;

// --- 4. EditorState.create({ schema, plugins }) round-trip -----------------
//
// SuperDoc's narrowed types must not break the underlying ProseMirror
// contract. `EditorStateConfig.plugins` is `readonly Plugin[]` (= raw
// `Plugin<any>[]` at the PM boundary), so a typed plugin or our
// `Plugin<unknown>[]` both flow through to `EditorState.create`
// without friction (any[] absorbs them).
const roundTripState = EditorState.create({
  schema: editor.schema,
  plugins: [myPlugin],
});
void roundTripState;
