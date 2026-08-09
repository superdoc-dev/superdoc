import type { Config } from 'superdoc';

const config: Config = {
  selector: '#editor',
  workerUrls: {
    document: '/workers/superdoc-document.js',
    collaboration: new URL('/workers/superdoc-collaboration.js', 'https://app.example.test'),
    reviewIndex: '/workers/superdoc-review-index.js',
  },
};

void config;
