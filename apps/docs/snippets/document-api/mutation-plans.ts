import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

const superdoc = new SuperDoc({
  selector: '#editor',
  document: '/contract.docx',
  onReady: async ({ superdoc }) => {
    const doc = superdoc.activeEditor?.doc;
    if (!doc) throw new Error('The active document is unavailable.');

    const [companyResult, liabilityResult] = await Promise.all([
      doc.query.match({
        select: { type: 'text', pattern: 'Amazing' },
        require: 'exactlyOne',
      }),
      doc.query.match({
        select: { type: 'text', pattern: '$500,000' },
        require: 'exactlyOne',
      }),
    ]);

    const company = companyResult.items[0];
    const liability = liabilityResult.items[0];

    if (!company || company.matchKind !== 'text' || !liability || liability.matchKind !== 'text') {
      throw new Error('The expected contract text was not found.');
    }

    if (companyResult.evaluatedRevision !== liabilityResult.evaluatedRevision) {
      throw new Error('The document changed while the plan targets were being collected.');
    }

    const plan = {
      expectedRevision: companyResult.evaluatedRevision,
      atomic: true as const,
      changeMode: 'tracked' as const,
      steps: [
        {
          id: 'rename-company',
          op: 'text.rewrite' as const,
          where: { by: 'ref' as const, ref: company.handle.ref },
          args: { replacement: { text: 'Northstar' } },
        },
        {
          id: 'lower-liability-cap',
          op: 'text.rewrite' as const,
          where: { by: 'ref' as const, ref: liability.handle.ref },
          args: { replacement: { text: '$250,000' } },
        },
      ],
    };

    const preview = await doc.mutations.preview(plan);
    if (!preview.valid) {
      throw new Error(preview.failures?.map((failure) => failure.message).join('; ') ?? 'Plan preview failed.');
    }

    const receipt = await doc.mutations.apply(plan);
    console.log('Applied steps:', receipt.steps);
  },
});

window.addEventListener('beforeunload', () => {
  superdoc.destroy();
});
