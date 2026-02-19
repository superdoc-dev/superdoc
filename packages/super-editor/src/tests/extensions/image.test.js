import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDocxTestEditor } from '../helpers/editor-test-utils.js';

const parseStyle = (styleString = '') => {
  return styleString
    .split(';')
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .reduce((acc, declaration) => {
      const [property, value] = declaration.split(':').map((part) => part.trim());
      if (property) acc[property] = value;
      return acc;
    }, {});
};

describe('Image Extension DOM rendering', () => {
  let editor;
  let imageType;

  const renderImageAttributes = (attrs = {}) => {
    const nodeAttrs = {
      src: 'word/media/test-image.png',
      ...attrs,
    };

    const node = imageType.create(nodeAttrs);
    const domSpec = imageType.spec.toDOM(node);

    if (!Array.isArray(domSpec)) return {};
    const [, htmlAttributes = {}] = domSpec;
    return htmlAttributes;
  };

  beforeEach(() => {
    editor = createDocxTestEditor();
    imageType = editor.schema.nodes.image;
  });

  afterEach(() => {
    editor?.destroy();
  });

  describe('transformData CSS', () => {
    it('applies rotation transformations', () => {
      const { style } = renderImageAttributes({ transformData: { rotation: 45 } });
      const styles = parseStyle(style);
      expect(styles.transform).toContain('rotate(45deg)');
    });

    it('applies vertical flip transformations', () => {
      const { style } = renderImageAttributes({ transformData: { verticalFlip: true } });
      const styles = parseStyle(style);
      expect(styles.transform).toContain('scaleY(-1)');
    });

    it('applies horizontal flip transformations', () => {
      const { style } = renderImageAttributes({ transformData: { horizontalFlip: true } });
      const styles = parseStyle(style);
      expect(styles.transform).toContain('scaleX(-1)');
    });

    it('combines multiple transformations in order', () => {
      const { style } = renderImageAttributes({
        transformData: {
          rotation: 30,
          verticalFlip: true,
          horizontalFlip: true,
        },
      });
      const styles = parseStyle(style);
      expect(styles.transform).toBe('rotate(30deg) scaleY(-1) scaleX(-1)');
    });

    it('rounds fractional rotation values', () => {
      const { style } = renderImageAttributes({ transformData: { rotation: 45.7 } });
      const styles = parseStyle(style);
      expect(styles.transform).toContain('rotate(46deg)');
    });

    it('omits transform when data is empty', () => {
      const { style } = renderImageAttributes({ transformData: {} });
      const styles = parseStyle(style);
      expect(styles.transform).toBeUndefined();
    });
  });

  describe('size attribute styling', () => {
    it('applies width and auto height by default', () => {
      const { style } = renderImageAttributes({ size: { width: 300, height: 200 } });
      const styles = parseStyle(style);
      expect(styles.width).toBe('300px');
      expect(styles.height).toBe('auto');
    });

    it('renders EMF/WMF like normal images (converted to SVG at import time)', () => {
      // EMF/WMF images are converted to SVG during import, so they render like normal images
      // The special placeholder styling was removed since images are now properly converted
      const { style } = renderImageAttributes({ size: { width: 300, height: 200 }, extension: 'svg' });
      const styles = parseStyle(style);
      expect(styles.width).toBe('300px');
      expect(styles.height).toBe('auto');
      // No special border or position for converted images
      expect(styles['border']).toBeUndefined();
      expect(styles['position']).toBeUndefined();
    });
  });

  describe('margin offset styling', () => {
    it('applies basic margin offsets', () => {
      const { style } = renderImageAttributes({ marginOffset: { horizontal: 30, top: 40 } });
      const styles = parseStyle(style);
      expect(styles['margin-left']).toBe('30px');
      expect(styles['margin-top']).toBe('40px');
    });

    it('caps page-relative top margins at 500px', () => {
      const { style } = renderImageAttributes({
        marginOffset: { horizontal: 10, top: 600 },
        anchorData: { vRelativeFrom: 'page' },
      });
      const styles = parseStyle(style);
      expect(styles['margin-left']).toBe('10px');
      expect(styles['margin-top']).toBe('500px');
    });

    it('adds rotation margins even when anchors are present', () => {
      const { style } = renderImageAttributes({
        size: { width: 100, height: 100 },
        transformData: { rotation: 45 },
        padding: { left: 10, top: 12, bottom: 4, right: 8 },
        marginOffset: { horizontal: 5, top: 7 },
      });
      const styles = parseStyle(style);
      expect(styles['margin-left']).toBe('57px');
      expect(styles['margin-top']).toBe('61px');
      expect(styles['margin-bottom']).toBe('25px');
      expect(styles['margin-right']).toBe('29px');
    });

    it('retains padding-based margins when rotated without explicit margin offsets', () => {
      const { style } = renderImageAttributes({
        size: { width: 100, height: 100 },
        transformData: { rotation: 45 },
        padding: { left: 10, top: 15, bottom: 3, right: 8 },
      });
      const styles = parseStyle(style);
      expect(styles['margin-left']).toBe('31px');
      expect(styles['margin-top']).toBe('36px');
      expect(styles['margin-bottom']).toBe('24px');
      expect(styles['margin-right']).toBe('29px');
    });
  });

  describe('wrap styling', () => {
    it('centers TopAndBottom wraps without anchor data', () => {
      const { style } = renderImageAttributes({ wrap: { type: 'TopAndBottom' } });
      const styles = parseStyle(style);
      expect(styles.display).toBe('block');
      expect(styles.clear).toBe('both');
      expect(styles['margin-left']).toBe('auto');
      expect(styles['margin-right']).toBe('auto');
    });

    it('floats column-anchored images left when alignH is left', () => {
      const { style } = renderImageAttributes({
        wrap: { type: 'Square' },
        anchorData: { hRelativeFrom: 'column', alignH: 'left' },
      });
      const styles = parseStyle(style);
      expect(styles.float).toBe('left');
    });
  });

  describe('editor integration', () => {
    it('renders anchored rotation margins in the live DOM', () => {
      const {
        schema: { nodes },
        state,
        view,
      } = editor;

      const imageNode = nodes.image.create({
        src: 'word/media/test-image.png',
        size: { width: 120, height: 80 },
        marginOffset: { horizontal: 10, top: 20 },
        padding: { right: 4, bottom: 6 },
        transformData: { rotation: 30 },
        isAnchor: true,
        anchorData: { vRelativeFrom: 'page' },
      });
      const paragraph = nodes.paragraph.create({}, imageNode);
      const docNode = nodes.doc.create({}, paragraph);

      const tr = state.tr.replaceWith(0, state.doc.content.size, docNode.content);
      view.dispatch(tr);

      const img = editor.view.dom.querySelector('img');
      expect(img).toBeTruthy();
      const inlineStyles = parseStyle(img.getAttribute('style'));
      const marginShorthand = inlineStyles['margin'];
      expect(marginShorthand).toBeTruthy();
      const marginValues = marginShorthand.split(' ').filter(Boolean).sort();
      expect(marginValues).toEqual(['16px', '31px', '34px', '70px']);

      let insertedImage;
      editor.view.state.doc.descendants((node) => {
        if (node.type.name === 'image') {
          insertedImage = node;
          return false;
        }
        return true;
      });

      expect(insertedImage).toBeTruthy();
      expect(insertedImage.attrs.transformData.rotation).toBe(30);
      expect(insertedImage.attrs.marginOffset.horizontal).toBe(10);
      expect(insertedImage.attrs.marginOffset.top).toBe(20);
    });

    it('sets wrap text mode using setWrapping command', async () => {
      const {
        schema: { nodes },
        state,
        view,
      } = editor;

      // Create and insert an image
      const imageNode = nodes.image.create({
        src: 'word/media/test-image.png',
        size: { width: 200, height: 150 },
      });
      const paragraph = nodes.paragraph.create({}, imageNode);
      const docNode = nodes.doc.create({}, paragraph);

      const tr = state.tr.replaceWith(0, state.doc.content.size, docNode.content);
      view.dispatch(tr);

      // Helper function to select the image
      const selectImage = async () => {
        let imagePos;
        editor.view.state.doc.descendants((node, pos) => {
          if (node.type.name === 'image') {
            imagePos = pos + 1; // +1 to get position after the image node
            return false;
          }
          return true;
        });

        if (imagePos !== undefined) {
          const { NodeSelection } = await import('prosemirror-state');
          const selection = NodeSelection.create(editor.view.state.doc, imagePos - 1);
          editor.view.dispatch(editor.view.state.tr.setSelection(selection));
        }
        return imagePos;
      };

      let imagePos = await selectImage();

      // Test 1: Square wrapping with bothSides
      // Test setting wrap text to Square with bothSides
      editor.commands.setWrapping({
        type: 'Square',
        attrs: { wrapText: 'bothSides' },
      });

      let updatedImage;
      editor.view.state.doc.descendants((node) => {
        if (node.type.name === 'image') {
          updatedImage = node;
          return false;
        }
        return true;
      });

      expect(updatedImage).toBeTruthy();
      expect(updatedImage.attrs.wrap.type).toBe('Square');
      expect(updatedImage.attrs.wrap.attrs.wrapText).toBe('bothSides');

      // Test 2: Square wrapping with distances
      imagePos = await selectImage();
      editor.commands.setWrapping({
        type: 'Square',
        attrs: {
          wrapText: 'left',
          distTop: 10,
          distBottom: 20,
          distLeft: 30,
          distRight: 40,
        },
      });

      editor.view.state.doc.descendants((node) => {
        if (node.type.name === 'image') {
          updatedImage = node;
          return false;
        }
        return true;
      });

      expect(updatedImage.attrs.wrap.type).toBe('Square');
      expect(updatedImage.attrs.wrap.attrs.wrapText).toBe('left');
      expect(updatedImage.attrs.wrap.attrs.distTop).toBe(10);
      expect(updatedImage.attrs.wrap.attrs.distBottom).toBe(20);
      expect(updatedImage.attrs.wrap.attrs.distLeft).toBe(30);
      expect(updatedImage.attrs.wrap.attrs.distRight).toBe(40);

      // Test 3: Tight wrapping with polygon
      imagePos = await selectImage();
      editor.commands.setWrapping({
        type: 'Tight',
        attrs: {
          distLeft: 5,
          distRight: 10,
          polygon: [
            [0, 0],
            [100, 0],
            [100, 100],
            [0, 100],
          ],
        },
      });

      editor.view.state.doc.descendants((node) => {
        if (node.type.name === 'image') {
          updatedImage = node;
          return false;
        }
        return true;
      });

      expect(updatedImage.attrs.wrap.type).toBe('Tight');
      expect(updatedImage.attrs.wrap.attrs.distLeft).toBe(5);
      expect(updatedImage.attrs.wrap.attrs.distRight).toBe(10);
      expect(updatedImage.attrs.wrap.attrs.polygon).toEqual([
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
      ]);

      // Test 4: Through wrapping with polygon
      imagePos = await selectImage();
      editor.commands.setWrapping({
        type: 'Through',
        attrs: {
          distTop: 8,
          distBottom: 12,
          polygon: [
            [10, 10],
            [90, 10],
            [90, 90],
            [10, 90],
          ],
        },
      });

      editor.view.state.doc.descendants((node) => {
        if (node.type.name === 'image') {
          updatedImage = node;
          return false;
        }
        return true;
      });

      expect(updatedImage.attrs.wrap.type).toBe('Through');
      expect(updatedImage.attrs.wrap.attrs.distTop).toBe(8);
      expect(updatedImage.attrs.wrap.attrs.distBottom).toBe(12);
      expect(updatedImage.attrs.wrap.attrs.polygon).toEqual([
        [10, 10],
        [90, 10],
        [90, 90],
        [10, 90],
      ]);

      // Test 5: TopAndBottom wrapping
      imagePos = await selectImage();
      editor.commands.setWrapping({
        type: 'TopAndBottom',
        attrs: {
          distTop: 15,
          distBottom: 25,
        },
      });

      editor.view.state.doc.descendants((node) => {
        if (node.type.name === 'image') {
          updatedImage = node;
          return false;
        }
        return true;
      });

      expect(updatedImage.attrs.wrap.type).toBe('TopAndBottom');
      expect(updatedImage.attrs.wrap.attrs.distTop).toBe(15);
      expect(updatedImage.attrs.wrap.attrs.distBottom).toBe(25);

      // Test 6: None wrapping with behindDoc
      imagePos = await selectImage();
      editor.commands.setWrapping({ type: 'None', attrs: { behindDoc: true } });

      editor.view.state.doc.descendants((node) => {
        if (node.type.name === 'image') {
          updatedImage = node;
          return false;
        }
        return true;
      });

      expect(updatedImage.attrs.wrap.type).toBe('None');
      expect(updatedImage.attrs.wrap.attrs).toEqual({ behindDoc: true });

      // Test 7: None wrapping without behindDoc (should not affect originalAttributes)
      imagePos = await selectImage();
      editor.commands.setWrapping({ type: 'None', attrs: { behindDoc: false } });

      editor.view.state.doc.descendants((node) => {
        if (node.type.name === 'image') {
          updatedImage = node;
          return false;
        }
        return true;
      });

      expect(updatedImage.attrs.wrap.type).toBe('None');
      expect(updatedImage.attrs.wrap.attrs).toEqual({ behindDoc: false });
    });

    describe('validates attributes for each wrap type', () => {
      let nodes, state, view;

      beforeEach(() => {
        ({
          schema: { nodes },
          state,
          view,
        } = editor);
      });

      // Helper function to select the image
      const selectImage = async () => {
        let imagePos;
        editor.view.state.doc.descendants((node, pos) => {
          if (node.type.name === 'image') {
            imagePos = pos + 1; // +1 to get position after the image node
            return false;
          }
          return true;
        });

        if (imagePos !== undefined) {
          const { NodeSelection } = await import('prosemirror-state');
          const selection = NodeSelection.create(editor.view.state.doc, imagePos - 1);
          editor.view.dispatch(editor.view.state.tr.setSelection(selection));
        }
        return imagePos;
      };

      it('switches image from wrapping to inline using setWrapping', async () => {
        // Create and insert a wrapped image
        const imageNode = nodes.image.create({
          src: 'word/media/test-image.png',
          size: { width: 120, height: 80 },
          wrap: { type: 'Square', attrs: { wrapText: 'bothSides' } },
        });
        const paragraph = nodes.paragraph.create({}, imageNode);
        const docNode = nodes.doc.create({}, paragraph);
        const tr = state.tr.replaceWith(0, state.doc.content.size, docNode.content);
        view.dispatch(tr);

        let imagePos = await selectImage();
        // Switch to inline
        editor.commands.setWrapping({ type: 'Inline' });

        let updatedImage;
        editor.view.state.doc.descendants((node) => {
          if (node.type.name === 'image') {
            updatedImage = node;
            return false;
          }
          return true;
        });

        expect(updatedImage).toBeTruthy();
        expect(updatedImage.attrs.wrap.type).toBe('Inline');
        expect(updatedImage.attrs.isAnchor).toBe(false);
      });

      it('switches image from inline to wrapping using setWrapping', async () => {
        // Create and insert an inline image
        const imageNode = nodes.image.create({
          src: 'word/media/test-image.png',
          size: { width: 120, height: 80 },
          wrap: { type: 'Inline', attrs: {} },
        });
        const paragraph = nodes.paragraph.create({}, imageNode);
        const docNode = nodes.doc.create({}, paragraph);
        const tr = state.tr.replaceWith(0, state.doc.content.size, docNode.content);
        view.dispatch(tr);

        let imagePos = await selectImage();
        // Switch to Square wrapping
        editor.commands.setWrapping({ type: 'Square', attrs: { wrapText: 'left' } });

        let updatedImage;
        editor.view.state.doc.descendants((node) => {
          if (node.type.name === 'image') {
            updatedImage = node;
            return false;
          }
          return true;
        });

        expect(updatedImage).toBeTruthy();
        expect(updatedImage.attrs.wrap.type).toBe('Square');
        expect(updatedImage.attrs.wrap.attrs.wrapText).toBe('left');
        expect(updatedImage.attrs.isAnchor).toBe(true);
      });

      /**
       * TEST 3: Toggle wrapping → inline → wrapping
       */
      it('toggles image wrapping to inline and back to wrapping', async () => {
        const {
          schema: { nodes },
          state,
          view,
        } = editor;
        // Create and insert a wrapped image
        const imageNode = nodes.image.create({
          src: 'word/media/test-image.png',
          size: { width: 120, height: 80 },
          wrap: { type: 'Square', attrs: { wrapText: 'right' } },
        });
        const paragraph = nodes.paragraph.create({}, imageNode);
        const docNode = nodes.doc.create({}, paragraph);
        const tr = state.tr.replaceWith(0, state.doc.content.size, docNode.content);
        view.dispatch(tr);

        let imagePos = await selectImage();
        // Switch to inline
        editor.commands.setWrapping({ type: 'Inline' });

        // Switch back to wrapping
        imagePos = await selectImage();
        editor.commands.setWrapping({ type: 'Square', attrs: { wrapText: 'bothSides' } });

        let updatedImage;
        editor.view.state.doc.descendants((node) => {
          if (node.type.name === 'image') {
            updatedImage = node;
            return false;
          }
          return true;
        });

        expect(updatedImage).toBeTruthy();
        expect(updatedImage.attrs.wrap.type).toBe('Square');
        expect(updatedImage.attrs.wrap.attrs.wrapText).toBe('bothSides');
        expect(updatedImage.attrs.isAnchor).toBe(true);
      });

      /**
       * TEST 4: Attribute preservation when switching modes
       */
      it('preserves image attributes when switching between wrapping and inline', async () => {
        const {
          schema: { nodes },
          state,
          view,
        } = editor;
        // Create and insert a wrapped image with custom attributes
        const imageNode = nodes.image.create({
          src: 'word/media/test-image.png',
          size: { width: 180, height: 100 },
          marginOffset: { horizontal: 12, top: 8 },
          wrap: { type: 'Square', attrs: { wrapText: 'largest', distLeft: 5 } },
        });
        const paragraph = nodes.paragraph.create({}, imageNode);
        const docNode = nodes.doc.create({}, paragraph);
        const tr = state.tr.replaceWith(0, state.doc.content.size, docNode.content);
        view.dispatch(tr);

        let imagePos = await selectImage();
        // Switch to inline
        editor.commands.setWrapping({ type: 'Inline' });

        // Switch back to wrapping
        imagePos = await selectImage();
        editor.commands.setWrapping({ type: 'Square', attrs: { wrapText: 'left', distLeft: 7 } });

        let updatedImage;
        editor.view.state.doc.descendants((node) => {
          if (node.type.name === 'image') {
            updatedImage = node;
            return false;
          }
          return true;
        });

        expect(updatedImage).toBeTruthy();
        expect(updatedImage.attrs.size).toEqual({ width: 180, height: 100 });
        expect(updatedImage.attrs.marginOffset).toEqual({ horizontal: 12, top: 8 });
        expect(updatedImage.attrs.wrap.type).toBe('Square');
        expect(updatedImage.attrs.wrap.attrs.wrapText).toBe('left');
        expect(updatedImage.attrs.wrap.attrs.distLeft).toBe(7);
        expect(updatedImage.attrs.isAnchor).toBe(true);
      });
    });
  });
});
