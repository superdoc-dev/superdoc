/**
 * Subscription disposer for the vanilla example.
 *
 * The controller's `Subscribable<T>` and domain `subscribe(...)` calls
 * each return their own unsubscribe function. Without a framework
 * tracking effects for us, every demo file would otherwise hand-roll
 * `const off = x.subscribe(...); window.addEventListener('beforeunload',
 * off);` and lose them on Vite HMR. The `Disposer` collects every
 * unsubscribe in one place so the bootstrap can flush them on hot
 * reload and on page unload.
 *
 * This is the kind of thing `superdoc/ui/react` hides behind
 * `useSuperDocSlice` / `useSuperDocComments` etc. SD-2918 tracks
 * shipping a controller-aware `ui.createScope()` so every framework
 * adapter can stop reinventing this.
 */

export type Unsubscribe = () => void;

export interface Subscribable<T> {
  get(): T;
  subscribe(listener: (value: T) => void): Unsubscribe;
}

export class Disposer {
  private fns: Unsubscribe[] = [];

  add(fn: Unsubscribe): void {
    this.fns.push(fn);
  }

  flush(): void {
    while (this.fns.length > 0) {
      const fn = this.fns.pop();
      if (fn) {
        try {
          fn();
        } catch (err) {
          console.error('[vanilla] disposer threw', err);
        }
      }
    }
  }
}
