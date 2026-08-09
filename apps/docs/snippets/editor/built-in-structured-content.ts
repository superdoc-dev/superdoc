import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

const temporaryImageUrls: string[] = [];

const superdoc = new SuperDoc({
  selector: '#editor',
  document: '/contract.docx',
  ui: {
    toolbar: {
      // A toolbar renders only once it has somewhere to mount.
      container: '#toolbar',
      groups: {
        center: ['link', 'image', 'table', 'tableActions'],
      },
    },
    contentControls: { chrome: 'default' },
  },
  handleImageUpload: async (file) => {
    const temporaryUrl = URL.createObjectURL(file);
    temporaryImageUrls.push(temporaryUrl);
    return temporaryUrl;
  },
});

window.addEventListener('beforeunload', () => {
  for (const url of temporaryImageUrls) URL.revokeObjectURL(url);
  superdoc.destroy();
});
