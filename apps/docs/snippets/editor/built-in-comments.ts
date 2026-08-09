import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

const superdoc = new SuperDoc({
  selector: '#editor',
  document: '/contract.docx',
  user: {
    name: 'Alex Rivera',
    email: 'alex@example.com',
  },
  ui: {
    toolbar: { container: '#toolbar' },
    comments: {
      displayMode: 'auto',
    },
  },
  onCommentsUpdate: ({ type, comment }) => {
    console.log('Comment update:', type, comment?.commentId);
  },
});
