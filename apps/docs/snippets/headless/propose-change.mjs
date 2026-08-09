import { SuperDocClient } from '@superdoc/sdk';

/** @param {unknown} value */
function isSuccessfulReceipt(value) {
  return typeof value === 'object' && value !== null && 'success' in value && value.success === true;
}

const client = new SuperDocClient({
  user: { name: 'Contract assistant', email: 'assistant@example.com' },
});

try {
  await client.connect();
  const doc = await client.open({ doc: './contract.docx' });

  try {
    const match = await doc.query.match({
      select: { type: 'text', pattern: 'termination' },
      require: 'first',
    });
    const result = match.items[0];

    if (!result || result.matchKind !== 'text') {
      throw new Error('The source document does not contain “termination”.');
    }

    const operation = await doc.replace({
      target: result.target,
      text: 'cancellation',
      changeMode: 'tracked',
    });

    console.log(operation);
    const receipt = 'receipt' in operation ? operation.receipt : operation;
    if (!isSuccessfulReceipt(receipt)) throw new Error('Creating the tracked change failed.');
    await doc.save({ out: './contract.suggested.docx', force: true });
  } finally {
    await doc.close({ discard: true });
  }
} finally {
  await client.dispose();
}
