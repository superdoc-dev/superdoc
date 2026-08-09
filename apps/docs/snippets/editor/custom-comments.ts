import { SuperDoc } from 'superdoc';
import type { CommentsSlice, SelectionCapture, SelectionSlice } from 'superdoc/ui';
import 'superdoc/style.css';

const commentText = document.querySelector<HTMLTextAreaElement>('#comment-text');
const addComment = document.querySelector<HTMLButtonElement>('#add-comment');
const commentList = document.querySelector<HTMLUListElement>('#comment-list');
const commentsStatus = document.querySelector<HTMLParagraphElement>('#comments-status');

if (!commentText || !addComment || !commentList || !commentsStatus) {
  throw new Error('The comments UI is incomplete.');
}

let capturedSelection: SelectionCapture | null = null;
let stopSelection: (() => void) | null = null;
let stopComments: (() => void) | null = null;
let removeHandlers: (() => void) | null = null;

const updateComposer = () => {
  addComment.disabled = !capturedSelection || commentText.value.trim().length === 0;
};

const superdoc = new SuperDoc({
  selector: '#editor',
  document: '/contract.docx',
  user: {
    name: 'Alex Rivera',
    email: 'alex@example.com',
  },
  // This application owns the comments presentation, so turn SuperDoc's own
  // off. It removes interface only: threads in the DOCX are still parsed, and
  // the composer below still creates, resolves, and reopens them through the
  // controller. The rest of SuperDoc's built-in surfaces stay, because this
  // example replaces the comments panel and nothing else.
  ui: {
    comments: false,
  },
  onReady: ({ superdoc: readySuperDoc }) => {
    const ui = readySuperDoc.ui;

    const renderSelection = (selection: SelectionSlice) => {
      if (!selection.empty) capturedSelection = ui.selection.capture();
      updateComposer();
    };

    const renderComments = (comments: CommentsSlice) => {
      commentsStatus.textContent = comments.status === 'pending' ? 'Loading comments…' : `${comments.total} comments`;
      commentList.replaceChildren();

      for (const comment of comments.items) {
        const row = document.createElement('li');
        const body = document.createElement('span');
        const show = document.createElement('button');
        const resolve = document.createElement('button');

        body.textContent = comment.text || 'Comment without text';
        show.type = 'button';
        show.textContent = 'Show';
        show.addEventListener('click', async () => {
          ui.comments.setActive(comment.id);
          const result = await ui.comments.scrollTo(comment.id);
          if (!result.success) commentsStatus.textContent = result.reason ?? 'The comment could not be shown.';
        });

        resolve.type = 'button';
        resolve.textContent = comment.status === 'resolved' ? 'Reopen' : 'Resolve';
        resolve.addEventListener('click', async () => {
          const receipt =
            comment.status === 'resolved'
              ? await ui.comments.reopen(comment.id)
              : await ui.comments.resolve(comment.id);
          if (!receipt.success) commentsStatus.textContent = receipt.failure.message;
        });

        row.append(body, show, resolve);
        commentList.append(row);
      }
    };

    const createComment = async () => {
      if (!capturedSelection) return;

      const receipt = await ui.comments.createFromCapture(capturedSelection, { text: commentText.value.trim() });
      if (!receipt.success) {
        commentsStatus.textContent = receipt.failure.message;
        return;
      }

      commentText.value = '';
      capturedSelection = null;
      updateComposer();
    };

    renderSelection(ui.selection.getSnapshot());
    renderComments(ui.comments.getSnapshot());
    stopSelection = ui.selection.observe(renderSelection);
    stopComments = ui.comments.observe(renderComments);
    commentText.addEventListener('input', updateComposer);
    addComment.addEventListener('click', createComment);

    removeHandlers = () => {
      commentText.removeEventListener('input', updateComposer);
      addComment.removeEventListener('click', createComment);
    };
  },
});

window.addEventListener('beforeunload', () => {
  stopSelection?.();
  stopComments?.();
  removeHandlers?.();
  superdoc.destroy();
});
