import { SuperDocCollaboration } from './collaboration/index.js';
import type { AutoSaveFn, AuthenticateFn, BeforeChangeFn, ChangeFn, ConfigureFn, Extension, LoadFn } from './types.js';
export declare class CollaborationBuilder {
  #private;
  withName(name: string): this;
  withDocumentExpiryMs(ms: number): this;
  withDebounce(ms: number): this;
  onConfigure(userFunction: ConfigureFn): this;
  onAuthenticate(userFunction: AuthenticateFn): this;
  onLoad(userFunction: LoadFn): this;
  onAutoSave(userFunction: AutoSaveFn): this;
  onBeforeChange(userFunction: BeforeChangeFn): this;
  onChange(userFunction: ChangeFn): this;
  useExtensions(exts: Extension[]): this;
  build(): SuperDocCollaboration;
}
//# sourceMappingURL=builder.d.ts.map
