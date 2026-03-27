import { Extension } from '../Extension.js';
import { createSelectionHandlePlugin } from '../selection-state.js';

export const SelectionHandleExtension = Extension.create({
  name: 'selectionHandle',

  addPmPlugins() {
    return [createSelectionHandlePlugin()];
  },
});
