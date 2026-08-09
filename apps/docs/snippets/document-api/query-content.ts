import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

const superdoc = new SuperDoc({
  selector: '#editor',
  document: '/contract.docx',
  onReady: async ({ superdoc }) => {
    const doc = superdoc.activeEditor?.doc;
    if (!doc) throw new Error('The active document is unavailable.');

    const result = await doc.query.match({
      select: {
        type: 'text',
        pattern: 'Confidential Information',
      },
      require: 'all',
    });

    console.log(`Found ${result.total} matches.`);

    for (const item of result.items) {
      if (item.matchKind !== 'text') continue;
      console.log(item.snippet, item.target, item.handle.ref);
    }
  },
});

window.addEventListener('beforeunload', () => {
  superdoc.destroy();
});
