import { Extensions } from 'superdoc';

const { Extension, Plugin, PluginKey, Decoration, DecorationSet } = Extensions;

export const CUSTOMER_FOCUS_EXTENSION_NAME = 'customer-focus-highlight';

const focusPluginKey = new PluginKey('customer-focus');

/**
 * Ported from `packages/superdoc/src/dev/components/SuperdocDev.vue` in `../superdoc4`.
 * Exposes `editor.commands.setFocus(from, to)` and `editor.commands.clearFocus()`.
 */
const CustomerFocusHighlight = Extension.create({
  name: CUSTOMER_FOCUS_EXTENSION_NAME,

  addCommands() {
    return {
      setFocus:
        (from: number, to: number) =>
        ({ state, dispatch }: any) => {
          if (dispatch) {
            const tr = state.tr.setMeta(focusPluginKey, { from, to });
            dispatch(tr);
          }
          return true;
        },

      clearFocus:
        () =>
        ({ state, dispatch }: any) => {
          if (dispatch) {
            const tr = state.tr.setMeta(focusPluginKey, { from: 0, to: 0 });
            dispatch(tr);
          }
          return true;
        },
    };
  },

  addPmPlugins() {
    return [
      new Plugin({
        key: focusPluginKey,
        state: {
          init() {
            return DecorationSet.empty;
          },

          apply(tr: any, pluginState: any) {
            const meta = tr.getMeta(focusPluginKey);
            if (!meta) {
              return pluginState.map(tr.mapping, tr.doc);
            }

            const { from, to } = meta;
            if (from === to) {
              return DecorationSet.empty;
            }

            return DecorationSet.create(tr.doc, [
              Decoration.inline(from, to, {
                class: 'highlight-selection',
              }),
            ]);
          },
        },
        props: {
          decorations(state: any) {
            return focusPluginKey.getState(state);
          },
        },
      }),
    ];
  },
});

const CUSTOM_EXTENSION_REGISTRY: Record<string, any> = {
  [CUSTOMER_FOCUS_EXTENSION_NAME]: CustomerFocusHighlight,
};

function parseExtensionsParam(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getRequestedCustomExtensionNames(searchParams: URLSearchParams): string[] {
  return parseExtensionsParam(searchParams.get('extensions'));
}

export function resolveCustomExtensions(names: string[]): any[] {
  if (!names.length) return [];

  const resolved: any[] = [];
  const seen = new Set<string>();

  for (const name of names) {
    if (seen.has(name)) continue;
    seen.add(name);

    const extension = CUSTOM_EXTENSION_REGISTRY[name];
    if (!extension) {
      console.warn(`[visual-harness] Unknown custom extension requested: ${name}`);
      continue;
    }
    resolved.push(extension);
  }

  return resolved;
}
