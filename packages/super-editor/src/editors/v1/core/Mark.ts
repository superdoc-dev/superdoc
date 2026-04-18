import { getExtensionConfigField } from './helpers/getExtensionConfigField.js';
import { callOrGet } from './utilities/callOrGet.js';
import type { MaybeGetter } from './utilities/callOrGet.js';

import type { AttributeSpec } from './Attribute.js';

/**
 * Configuration for Mark extensions.
 * @template Options - Type for mark options
 * @template Storage - Type for mark storage
 * @template Attrs - Type for mark attributes (optional, enables typed addAttributes)
 */
export interface MarkConfig<
  Options extends Record<string, unknown> = Record<string, never>,
  Storage extends Record<string, unknown> = Record<string, never>,
  Attrs extends Record<string, unknown> = Record<string, unknown>,
> {
  /** The unique name of the mark */
  name: string;

  /** Whether this mark is from an external package */
  isExternal?: boolean;

  /** Function to define mark options */
  addOptions?: MaybeGetter<Options>;

  /** Function to define mark storage */
  addStorage?: MaybeGetter<Storage>;

  /**
   * Function or object to add attributes to the mark.
   * When Attrs generic is provided, attribute keys are validated against it.
   */
  addAttributes?: MaybeGetter<{ [K in keyof Attrs]?: Partial<AttributeSpec> }>;

  /** Additional config fields - use with caution */
  [key: string]: unknown;
}

/**
 * Mark class is used to create Mark extensions.
 * @template Options - Type for mark options
 * @template Storage - Type for mark storage
 * @template Attrs - Type for mark attributes (enables typed attribute access)
 */
export class Mark<
  Options extends Record<string, unknown> = Record<string, never>,
  Storage extends Record<string, unknown> = Record<string, never>,
  Attrs extends Record<string, unknown> = Record<string, unknown>,
> {
  type = 'mark' as const;

  name: string = 'mark';

  options: Options;

  storage: Storage;

  isExternal: boolean;

  config: MarkConfig<Options, Storage, Attrs>;

  /**
   * Type hint for the attributes this mark uses.
   * Not used at runtime, but enables type inference.
   */
  declare readonly __attrsType: Attrs;

  constructor(config: MarkConfig<Options, Storage, Attrs>) {
    this.config = {
      ...config,
      name: config.name || this.name,
    };

    this.name = this.config.name;

    this.isExternal = Boolean(this.config.isExternal);

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
   * Static method for creating Mark extension.
   * @param config Configuration for the mark.
   */
  static create<
    O extends Record<string, unknown> = Record<string, never>,
    S extends Record<string, unknown> = Record<string, never>,
    A extends Record<string, unknown> = Record<string, unknown>,
  >(config: MarkConfig<O, S, A>): Mark<O, S, A> {
    return new Mark<O, S, A>(config);
  }
}
