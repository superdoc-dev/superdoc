import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

const shell = document.querySelector<HTMLElement>('#editor-shell');
const fullscreen = document.querySelector<HTMLButtonElement>('#fullscreen');

if (!shell || !fullscreen) throw new Error('The responsive editor shell is incomplete.');

const superdoc = new SuperDoc({
  selector: '#editor',
  document: '/contract.docx',
  contained: true,
  zoom: {
    mode: 'fit-width',
    fitWidth: { min: 40, max: 100, padding: 24 },
  },
  ui: {
    toolbar: {
      container: '#toolbar',
      responsiveToContainer: true,
    },
    comments: { displayMode: 'auto' },
  },
});

const toggleFullscreen = async () => {
  if (document.fullscreenElement) await document.exitFullscreen();
  else await shell.requestFullscreen();
};
const refit = () => superdoc.setZoomMode('fit-width');

fullscreen.addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', refit);

window.addEventListener('beforeunload', () => {
  fullscreen.removeEventListener('click', toggleFullscreen);
  document.removeEventListener('fullscreenchange', refit);
  superdoc.destroy();
});
