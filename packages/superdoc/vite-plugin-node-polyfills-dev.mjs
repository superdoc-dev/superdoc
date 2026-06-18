import { nodePolyfills } from 'vite-plugin-node-polyfills';

const VIRTUAL_ID = 'virtual:superdoc-node-globals';
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`;
const GLOBAL_IMPORT = `import "${VIRTUAL_ID}";\n`;
const JS_REQUEST_RE = /\.[cm]?[jt]sx?(?:$|\?)/;
const VUE_SCRIPT_REQUEST_RE = /\.vue\?(?:.*&)?type=script(?:&|$)/;

const DEV_GLOBALS_MODULE = `
import __buffer_polyfill from 'vite-plugin-node-polyfills/shims/buffer';
import __global_polyfill from 'vite-plugin-node-polyfills/shims/global';
import __process_polyfill from 'vite-plugin-node-polyfills/shims/process';

globalThis.Buffer = globalThis.Buffer || __buffer_polyfill;
globalThis.global = globalThis.global || __global_polyfill;
globalThis.process = globalThis.process || __process_polyfill;
`;

// rolldown-vite warns on the deprecated `esbuild.banner` field, but the upstream
// node polyfills plugin still uses it for dev globals. Strip only that field;
// the transform hook below provides the same runtime setup without the warning.
const stripEsbuildBanner = (config) => {
  if (!config || typeof config !== 'object' || !config.esbuild || typeof config.esbuild !== 'object') {
    return config;
  }

  if (!Object.hasOwn(config.esbuild, 'banner')) {
    return config;
  }

  const restEsbuild = { ...config.esbuild };
  delete restEsbuild.banner;
  if (Object.keys(restEsbuild).length === 0) {
    delete config.esbuild;
    return config;
  }

  config.esbuild = restEsbuild;
  return config;
};

const shouldInjectDevGlobals = (id) => {
  if (!id || id.startsWith('\0')) return false;
  if (id === VIRTUAL_ID || id === RESOLVED_VIRTUAL_ID) return false;
  if (id.includes('/vite-plugin-node-polyfills/')) return false;
  return JS_REQUEST_RE.test(id) || VUE_SCRIPT_REQUEST_RE.test(id);
};

export function nodePolyfillsWithoutEsbuildBanner(options = {}) {
  const plugin = nodePolyfills(options);

  return {
    ...plugin,
    name: `${plugin.name}-without-esbuild-banner`,
    async config(userConfig, env) {
      const result = plugin.config ? await plugin.config.call(this, userConfig, env) : null;
      return stripEsbuildBanner(result);
    },
  };
}

export function devNodeGlobalsPlugin() {
  return {
    name: 'superdoc-dev-node-globals',
    apply: 'serve',
    enforce: 'post',
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID;
      return null;
    },
    load(id) {
      if (id === RESOLVED_VIRTUAL_ID) return DEV_GLOBALS_MODULE;
      return null;
    },
    transform(code, id) {
      if (!shouldInjectDevGlobals(id)) return null;
      if (code.startsWith(GLOBAL_IMPORT)) return null;
      return {
        code: `${GLOBAL_IMPORT}${code}`,
        map: null,
      };
    },
  };
}
