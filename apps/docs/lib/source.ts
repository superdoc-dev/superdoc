import { docs } from 'collections/server';
import { loader } from 'fumadocs-core/source';

export const source = loader({
  baseUrl: '/',
  source: docs.toFumadocsSource(),
  pageTree: {
    transformers: [
      {
        file(node, filePath) {
          const file = filePath ? this.storage.read(filePath) : undefined;
          if (file?.format !== 'page' || !file.data.navTitle) return node;
          return { ...node, name: file.data.navTitle };
        },
      },
    ],
  },
});
