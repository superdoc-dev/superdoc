/**
 * Command type augmentations for image operations.
 *
 * @module ImageCommands
 */

/** Wrap type options for images */
export type ImageWrapType = 'None' | 'Square' | 'Through' | 'Tight' | 'TopAndBottom' | 'Inline';

/** Wrap attributes based on wrap type */
export type ImageWrapAttrs = {
  /** Text wrapping mode for Square type */
  wrapText?: 'bothSides' | 'largest' | 'left' | 'right';
  /** Top distance in pixels */
  distTop?: number;
  /** Bottom distance in pixels */
  distBottom?: number;
  /** Left distance in pixels */
  distLeft?: number;
  /** Right distance in pixels */
  distRight?: number;
  /** Polygon points for Through/Tight types */
  polygon?: Array<[number, number]>;
  /** Whether image should be behind document text (for None type) */
  behindDoc?: boolean;
};

/** Options for setImage command */
export type SetImageOptions = {
  /** Image source URL or base64 data */
  src: string;
  /** Alternative text for accessibility */
  alt?: string;
  /** Image title */
  title?: string;
  /** Image dimensions */
  size?: {
    width?: number;
    height?: number;
  };
  /** Image padding */
  padding?: {
    left?: number;
    top?: number;
    bottom?: number;
    right?: number;
  };
  /** Text wrapping configuration */
  wrap?: {
    type: ImageWrapType;
    attrs?: ImageWrapAttrs;
  };
};

/** Options for setWrapping command */
export type SetWrappingOptions = {
  /** Wrap type */
  type: ImageWrapType;
  /** Wrap attributes (filtered based on type) */
  attrs?: ImageWrapAttrs;
};

export interface ImageCommands {
  /**
   * Insert an image at the current position
   * @param options - Image options including src, alt, size, etc.
   * @example
   * editor.commands.setImage({ src: 'https://example.com/image.jpg' })
   * editor.commands.setImage({
   *   src: 'data:image/png;base64,...',
   *   alt: 'Company logo',
   *   size: { width: 200 }
   * })
   */
  setImage: (options: SetImageOptions) => boolean;

  /**
   * Set the wrapping mode and attributes for the selected image
   * @param options - Wrapping options with type and attributes
   * @example
   * // No wrapping, behind document
   * editor.commands.setWrapping({ type: 'None', attrs: { behindDoc: true } })
   *
   * // Square wrapping on both sides with distances
   * editor.commands.setWrapping({
   *   type: 'Square',
   *   attrs: {
   *     wrapText: 'bothSides',
   *     distTop: 10,
   *     distBottom: 10
   *   }
   * })
   */
  setWrapping: (options: SetWrappingOptions) => boolean;
}

declare module '../../core/types/ChainedCommands.js' {
  interface ExtensionCommandMap extends ImageCommands {}
}
