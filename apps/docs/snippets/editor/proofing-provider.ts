import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

const superdoc = new SuperDoc({
  selector: '#editor',
  document: '/contract.docx',
  proofing: {
    enabled: true,
    defaultLanguage: 'en-US',
    debounceMs: 500,
    provider: {
      id: 'local-example',
      getCapabilities: () => ({
        issueKinds: ['spelling'],
        supportsSuggestions: true,
        requiresNetwork: false,
      }),
      check: async ({ segments }) => ({
        issues: segments.flatMap((segment) => {
          const start = segment.text.indexOf('teh');
          return start < 0
            ? []
            : [{ segmentId: segment.id, start, end: start + 3, kind: 'spelling', replacements: ['the'] }];
        }),
      }),
    },
    onProofingError: ({ message }) => console.error('Proofing failed', message),
  },
});

window.addEventListener('beforeunload', () => superdoc.destroy());
