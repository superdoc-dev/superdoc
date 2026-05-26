import fs from 'node:fs';
import path from 'node:path';

export default function layeredCssPlugin() {
  return {
    name: 'superdoc-layered-css',
    writeBundle(outputOptions, bundle) {
      const cssAssets = Object.entries(bundle).filter(([, chunk]) => {
        return chunk.type === 'asset' && typeof chunk.fileName === 'string' && chunk.fileName.endsWith('.css');
      });

      if (cssAssets.length === 0) {
        return;
      }

      const targetAsset =
        cssAssets.find(([fileName]) => fileName === 'style.css') ??
        cssAssets[0];

      const [, chunk] = targetAsset;
      const source = typeof chunk.source === 'string'
        ? chunk.source
        : Buffer.from(chunk.source).toString('utf8');

      const layeredCss = `@layer superdoc{${source}}\n`;
      const outDir = outputOptions.dir ?? path.dirname(outputOptions.file ?? '');
      const layeredFilePath = path.join(outDir, 'style.layered.css');

      fs.writeFileSync(layeredFilePath, layeredCss);
    },
  };
}
