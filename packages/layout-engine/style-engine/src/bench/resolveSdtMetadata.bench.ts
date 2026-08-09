import { bench } from 'vite-plus/test';
import { clearSdtMetadataCache, resolveSdtMetadata } from '../index.js';

function makeBenchAttrs(hash: string): Record<string, unknown> {
  return {
    type: 'text',
    fieldId: `bench-${hash}`,
    displayLabel: 'Bench Label',
    defaultDisplayLabel: 'Bench',
    alias: 'Bench Alias',
    fieldColor: '#123456',
    hash,
  };
}

let missCounter = 0;
bench('resolveSdtMetadata cache miss', () => {
  resolveSdtMetadata({
    nodeType: 'fieldAnnotation',
    attrs: makeBenchAttrs(`miss-${missCounter++}`),
  });
});

const cacheHitKey = 'hit-key';
clearSdtMetadataCache();
resolveSdtMetadata({
  nodeType: 'fieldAnnotation',
  attrs: makeBenchAttrs(cacheHitKey),
});

bench('resolveSdtMetadata cache hit', () => {
  resolveSdtMetadata({
    nodeType: 'fieldAnnotation',
    attrs: makeBenchAttrs(cacheHitKey),
  });
});
