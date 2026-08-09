import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

const superdoc = new SuperDoc({
  selector: '#editor',
  document: '/contract.docx',
  documentMode: 'suggesting',
  toolbar: '#toolbar',
  user: {
    name: 'Jordan Lee',
    email: 'jordan@example.com',
  },
});

window.addEventListener('beforeunload', () => superdoc.destroy());
