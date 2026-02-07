import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

let superdoc = new SuperDoc({
  selector: '#editor',
});

document.getElementById('file-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  superdoc?.destroy();
  superdoc = new SuperDoc({
    selector: '#editor',
    document: file,
  });
});
