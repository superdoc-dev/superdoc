import { SuperDocClient } from '@superdoc/sdk';

/** @param {unknown} value */
function isSuccessfulReceipt(value) {
  return typeof value === 'object' && value !== null && 'success' in value && value.success === true;
}

const client = new SuperDocClient();

try {
  await client.connect();
  const doc = await client.open({ doc: './contract.docx' });

  try {
    const match = await doc.query.match({
      select: { type: 'text', pattern: 'termination' },
      require: 'first',
    });

    console.log('Matched:', match.items[0]);

    const receipt = await doc.trackChanges.decide({
      decision: 'accept',
      target: { kind: 'all' },
    });

    console.log('Mutation receipt:', receipt);
    if (!isSuccessfulReceipt(receipt)) throw new Error('Accepting tracked changes failed.');

    await doc.save({
      out: './contract.accepted.docx',
      force: true,
    });
  } finally {
    await doc.close({ discard: true });
  }
} finally {
  await client.dispose();
}
