import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

import { version } from './package.json';
import { resolveSuperDocV2RuntimeMode } from './vite.v2-runtime-mode.mjs';

const PACKAGE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const V2_ROOT = path.resolve(PACKAGE_ROOT, '../../../v2');
const LAYOUT_ENGINE_ROOT = path.resolve(PACKAGE_ROOT, '../layout-engine');

const FORBIDDEN_MODULE_PATHS = [
  /[/\\]node_modules[/\\](?:vue|react|react-dom)(?:[/\\]|$)/,
  /[/\\]packages[/\\]superdoc[/\\]src[/\\](?!public[/\\]collaboration-upgrade-engine\.ts$)/,
  /[/\\]layout-engine[/\\]/,
  /[/\\]v2-layout-adapter[/\\]/,
  /[/\\]v2-browser-shell[/\\]/,
  /[/\\]painters[/\\]/,
  /[/\\]measuring-dom[/\\]/,
];

function assertUpgradeEngineModuleBoundary() {
  return {
    name: 'assert-collaboration-upgrade-engine-module-boundary',
    generateBundle(_output, bundle) {
      const offenders = new Set();
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue;
        for (const moduleId of Object.keys(chunk.modules)) {
          const normalized = moduleId.split('?')[0];
          if (FORBIDDEN_MODULE_PATHS.some((pattern) => pattern.test(normalized))) {
            offenders.add(path.relative(PACKAGE_ROOT, normalized));
          }
        }
      }
      if (offenders.size > 0) {
        this.error(
          `collaboration-upgrade engine pulled browser/UI/layout modules:\n${[...offenders]
            .sort()
            .map((entry) => `  - ${entry}`)
            .join('\n')}`,
        );
      }
    },
  };
}

export default defineConfig(({ command }) => {
  const v2Resolution = resolveSuperDocV2RuntimeMode({
    command,
    env: process.env,
    packageRoot: PACKAGE_ROOT,
    v2Root: V2_ROOT,
    layoutEngineRoot: LAYOUT_ENGINE_ROOT,
  });

  return {
    define: {
      __APP_VERSION__: JSON.stringify(version),
    },
    plugins: [assertUpgradeEngineModuleBoundary()],
    resolve: {
      alias: v2Resolution.aliases,
      conditions: v2Resolution.conditions,
      preserveSymlinks: false,
    },
    build: {
      target: 'node20',
      minify: false,
      sourcemap: false,
      emptyOutDir: false,
      copyPublicDir: false,
      lib: {
        entry: path.resolve(PACKAGE_ROOT, 'src/public/collaboration-upgrade-engine.ts'),
        formats: ['es', 'cjs'],
        fileName: (format) => `collaboration-upgrade-engine.${format === 'es' ? 'es.js' : 'cjs'}`,
      },
      rollupOptions: {
        external: (specifier) =>
          (v2Resolution.mode === 'package' && specifier === '@superdoc/docx-engine/collaboration-upgrade-engine') ||
          specifier === 'yjs' ||
          specifier.startsWith('yjs/'),
      },
    },
  };
});
