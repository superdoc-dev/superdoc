import * as Vue from 'vue';

export const SUPERDOC_V2_BROWSER_RUNTIME_GLOBAL_KEY = '__SUPERDOC_V2_BROWSER_RUNTIME__';

function readInstalledRuntime(globalObject = globalThis) {
  const installed = globalObject[SUPERDOC_V2_BROWSER_RUNTIME_GLOBAL_KEY];
  return installed && typeof installed === 'object' ? installed : null;
}

export function readSuperDocV2BrowserRuntime(globalObject = globalThis) {
  return readInstalledRuntime(globalObject);
}

export function installSuperDocV2BrowserRuntime(runtime = {}, globalObject = globalThis) {
  const installed = readInstalledRuntime(globalObject) ?? {};
  const nextRuntime = {
    ...installed,
    ...runtime,
    vue: runtime.vue ?? installed.vue ?? Vue,
  };
  globalObject[SUPERDOC_V2_BROWSER_RUNTIME_GLOBAL_KEY] = nextRuntime;
  return nextRuntime;
}

installSuperDocV2BrowserRuntime();
