import { SuperDoc } from 'superdoc';
import type { BorrowedSuperDocUI, CommentsSlice, SelectionCapture, SelectionSlice } from 'superdoc/ui';
import 'superdoc/style.css';

const panelElement = document.querySelector<HTMLElement>('#comments-panel');
const composerText = document.querySelector<HTMLTextAreaElement>('#comment-text');
const composerSubmit = document.querySelector<HTMLButtonElement>('#add-comment');

if (!panelElement || !composerText || !composerSubmit) {
  throw new Error('The comments panel is missing.');
}

const panel = panelElement;
const commentText = composerText;
const addComment = composerSubmit;

// The capture taken while text was selected. Creating a comment needs a
// document address rather than a live DOM range, so it is taken when the
// selection exists and used later when the composer is submitted.
let capturedSelection: SelectionCapture | null = null;

/**
 * The application's own comments surface, in place of the built-in one.
 *
 * Clicking a row focuses that comment and scrolls the document to it, which
 * is the behavior the built-in panel provided before `ui.comments: false`
 * turned it off.
 *
 * The observer fires on every change, including the one a click here causes,
 * so the rows are rebuilt underneath the button the user just pressed. Each
 * row carries its comment id and focus is restored afterwards; without that,
 * keyboard and screen-reader users are returned to the top of the document
 * after every activation.
 */
function renderCommentPanel(ui: BorrowedSuperDocUI, slice: CommentsSlice) {
  const focusedId =
    document.activeElement instanceof HTMLElement && panel.contains(document.activeElement)
      ? document.activeElement.dataset.commentId
      : undefined;

  panel.replaceChildren(
    ...slice.items.map((comment) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.dataset.commentId = comment.id;
      // A comment can carry no text. Falling back to an empty string would
      // leave a focusable control that assistive technology cannot name.
      row.textContent = comment.text || 'Comment without text';
      row.addEventListener('click', () => {
        ui.comments.setActive(comment.id);
        void ui.comments.scrollTo(comment.id);
      });
      return row;
    }),
  );

  if (focusedId) {
    panel.querySelector<HTMLButtonElement>(`[data-comment-id="${CSS.escape(focusedId)}"]`)?.focus();
  }
}

// Hybrid: SuperDoc and the application split the chrome.
//
// Three keys are named here and every other surface keeps its default. The
// application renders its own comments panel, so the built-in one is turned
// off; the toolbar is given a mount target; and search is opted into, because
// it is off by default and the toolbar's Search button needs it. `ui` keys are
// independent, so naming these three says nothing about the rest.
const superdoc = new SuperDoc({
  selector: '#editor',
  document: '/contract.docx',
  ui: {
    toolbar: { container: '#toolbar' },
    comments: false,
    // The default toolbar's Search button opens this surface. Without it the
    // control still renders and clicking it does nothing.
    search: true,
  },
  // Rendering and permission are separate decisions. Turning off the built-in
  // comments interface does not stop this panel from writing, so the policy is
  // stated rather than inferred from `ui`. `readOnly: false` is the default;
  // it is written out because the point of the pair is that `ui` never
  // decides it. `allowResolve: false` permits replies while forbidding resolve.
  //
  // `readOnly: true` is deliberately not the example here: it refuses tracked
  // change accept and reject as well as comment writes, so it takes the review
  // workflow with it. Reach for it when the whole surface should not mutate
  // the document, not to make one panel non-writing.
  interaction: { comments: { readOnly: false, allowResolve: true } },
  onReady: ({ superdoc: readySuperDoc }) => {
    // The controller stays available for the surfaces the application owns.
    const ui = readySuperDoc.ui;

    // Capture while the selection exists; the composer is submitted later,
    // after focus has moved to the textarea and the selection is gone.
    //
    // Submit needs both halves: something to attach the comment to, and
    // something to say. Gating on the capture alone leaves an enabled button
    // whose click returns silently, which reads as a broken control.
    const syncComposer = () => {
      addComment.disabled = !capturedSelection || commentText.value.trim().length === 0;
    };

    const trackSelection = (selection: SelectionSlice) => {
      if (!selection.empty) capturedSelection = ui.selection.capture();
      syncComposer();
    };

    commentText.addEventListener('input', syncComposer);

    addComment.addEventListener('click', async () => {
      if (!capturedSelection || !commentText.value.trim()) return;
      const receipt = await ui.comments.createFromCapture(capturedSelection, { text: commentText.value.trim() });
      if (!receipt.success) return;
      commentText.value = '';
      capturedSelection = null;
      syncComposer();
    });

    trackSelection(ui.selection.getSnapshot());
    ui.selection.observe(trackSelection);
    renderCommentPanel(ui, ui.comments.getSnapshot());
    ui.comments.observe((slice) => renderCommentPanel(ui, slice));
  },
});

window.addEventListener('beforeunload', () => superdoc.destroy());
