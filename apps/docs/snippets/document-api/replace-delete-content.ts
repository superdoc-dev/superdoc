import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

const superdoc = new SuperDoc({
  selector: '#editor',
  document: '/contract.docx',
  onReady: async ({ superdoc }) => {
    const doc = superdoc.activeEditor?.doc;
    if (!doc) throw new Error('The active document is unavailable.');

    const companyMatch = await doc.query.match({
      select: { type: 'text', pattern: 'Amazing' },
      require: 'exactlyOne',
    });
    const company = companyMatch.items[0];

    if (!company || company.matchKind !== 'text') {
      throw new Error('The company name was not found.');
    }

    const replaceReceipt = await doc.replace(
      {
        target: company.target,
        text: 'Northstar',
      },
      {
        changeMode: 'direct',
        expectedRevision: companyMatch.evaluatedRevision,
      },
    );

    if (!replaceReceipt.success) {
      throw new Error(`Replace failed: ${replaceReceipt.failure?.message ?? 'Unknown error'}`);
    }

    console.log('Replace receipt:', replaceReceipt);

    const liabilityMatch = await doc.query.match({
      select: {
        type: 'text',
        pattern: 'The total liability under this section shall not exceed $500,000.',
      },
      require: 'exactlyOne',
    });
    const liability = liabilityMatch.items[0];

    if (!liability || liability.matchKind !== 'text') {
      throw new Error('The liability sentence was not found.');
    }

    const deleteReceipt = await doc.delete(
      {
        target: liability.target,
        behavior: 'exact',
      },
      {
        changeMode: 'direct',
        expectedRevision: liabilityMatch.evaluatedRevision,
      },
    );

    if (!deleteReceipt.success) {
      throw new Error(`Delete failed: ${deleteReceipt.failure.message}`);
    }

    console.log('Delete receipt:', deleteReceipt);
  },
});

window.addEventListener('beforeunload', () => {
  superdoc.destroy();
});
