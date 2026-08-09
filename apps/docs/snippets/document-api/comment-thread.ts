import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

const superdoc = new SuperDoc({
  selector: '#editor',
  document: '/contract.docx',
  onReady: async ({ superdoc }) => {
    const doc = superdoc.activeEditor?.doc;
    if (!doc) throw new Error('The active document is unavailable.');

    const match = await doc.query.match({
      select: {
        type: 'text',
        pattern: 'Confidential Information',
      },
      require: 'exactlyOne',
    });
    const clause = match.items[0];

    if (!clause || clause.matchKind !== 'text') {
      throw new Error('The clause was not found.');
    }

    const createReceipt = await doc.comments.create(
      {
        target: clause.target,
        text: 'Confirm that this definition matches the current policy.',
      },
      { expectedRevision: match.evaluatedRevision },
    );

    if (!createReceipt.success) {
      throw new Error(`Comment creation failed: ${createReceipt.failure.message}`);
    }

    const afterCreate = await doc.comments.list({ includeResolved: true });
    const replyReceipt = await doc.comments.create(
      {
        parentCommentId: createReceipt.id,
        text: 'Confirmed against the policy dated July 2026.',
      },
      { expectedRevision: afterCreate.evaluatedRevision },
    );

    if (!replyReceipt.success) {
      throw new Error(`Reply failed: ${replyReceipt.failure.message}`);
    }

    const afterReply = await doc.comments.list({ includeResolved: true });
    const resolveReceipt = await doc.comments.patch(
      {
        commentId: createReceipt.id,
        status: 'resolved',
      },
      { expectedRevision: afterReply.evaluatedRevision },
    );

    if (!resolveReceipt.success) {
      throw new Error(`Resolve failed: ${resolveReceipt.failure.message}`);
    }

    console.log('Resolved comment:', createReceipt.id);
  },
});

window.addEventListener('beforeunload', () => superdoc.destroy());
