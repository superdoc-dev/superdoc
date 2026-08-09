import { SuperDoc, type Config } from 'superdoc';
import 'superdoc/style.css';

type ToolbarConfig = Exclude<NonNullable<Extract<Config['ui'], object>['toolbar']>, boolean>;

const toolbar: ToolbarConfig = {
  container: '#toolbar',
  groups: {
    left: ['undo', 'redo'],
    center: ['bold', 'italic', 'underline', 'link'],
    right: ['documentMode', 'zoom'],
  },
  responsiveToContainer: true,
};

const superdoc = new SuperDoc({
  selector: '#editor',
  document: '/contract.docx',
  ui: { toolbar },
});
