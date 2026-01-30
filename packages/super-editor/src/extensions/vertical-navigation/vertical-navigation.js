import { Extension } from '@core/Extension.js';
import { Plugin, PluginKey } from 'prosemirror-state';

export const VerticalNavigationPluginKey = new PluginKey('verticalNavigation');

export const VerticalNavigation = Extension.create({
  name: 'verticalNavigation',

  addPmPlugins() {
    if (this.editor.options?.isHeaderOrFooter) return [];
    if (this.editor.options?.isHeadless) return [];

    const plugin = new Plugin({
      key: VerticalNavigationPluginKey,
      props: {
        handleKeyDown(_view, event) {
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return false;
          return false;
        },
      },
    });

    return [plugin];
  },
});
