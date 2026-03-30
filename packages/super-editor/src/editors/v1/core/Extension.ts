import { getExtensionConfigField } from './helpers/getExtensionConfigField.js';
import { callOrGet } from './utilities/callOrGet.js';
import type { MaybeGetter } from './utilities/callOrGet.js';

/**
 * Base configuration for extensions.
 */
export interface ExtensionConfig<
  Options extends Record<string, unknown> = Record<string, never>,
  Storage extends Record<string, unknown> = Record<string, never>,
> {
  /** The unique name of the extension */
  name: string;

  /** Function to define extension options */
  addOptions?: MaybeGetter<Options>;

  /** Function to define extension storage */
  addStorage?: MaybeGetter<Storage>;

  /** Additional config fields - use with caution */
  [key: string]: unknown;
}

/**
 * Extension class is used to create extensions.
 * @template Options - Type for extension options
 * @template Storage - Type for extension storage
 */
export class Extension<
  Options extends Record<string, unknown> = Record<string, never>,
  Storage extends Record<string, unknown> = Record<string, never>,
> {
  type = 'extension' as const;

  name: string = 'extension';

  options: Options;

  storage: Storage;

  config: ExtensionConfig<Options, Storage>;

  constructor(config: ExtensionConfig<Options, Storage>) {
    this.config = {
      ...config,
      name: config.name || this.name,
    };

    this.name = this.config.name;

    if (this.config.addOptions) {
      this.options = (callOrGet(
        getExtensionConfigField(this, 'addOptions', {
          name: this.name,
        }),
      ) || {}) as Options;
    } else {
      this.options = {} as Options;
    }

    this.storage = (callOrGet(
      getExtensionConfigField(this, 'addStorage', {
        name: this.name,
        options: this.options,
      }),
    ) || {}) as Storage;
  }

  /**
   * Static method for creating an extension.
   * @param config Configuration for the extension.
   */
  static create<
    O extends Record<string, unknown> = Record<string, never>,
    S extends Record<string, unknown> = Record<string, never>,
  >(config: ExtensionConfig<O, S>): Extension<O, S> {
    return new Extension<O, S>(config);
  }
}
