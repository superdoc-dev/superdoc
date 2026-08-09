import { EventEmitter } from 'eventemitter3';
import { setActivePinia } from 'pinia';
import { createApp } from 'vue';

import { vClickOutside } from '@superdoc/common';
import CommentsList from './commentsList.vue';

/**
 * Comments list renderer (not floating comments)
 *
 * This renders a list of comments into an element, connected to main SuperDoc instance
 */
export class SuperComments extends EventEmitter {
  element;

  config = {
    comments: [],
    element: null,
    commentsStore: null,
  };

  constructor(options, superdoc) {
    super();
    this.config = { ...this.config, ...options };
    this.element = this.config.element;
    this.app = null;
    this.superdoc = superdoc;
    this.stopDirectoryObservers = [];
    this.directorySnapshots = { comments: null, trackChanges: null };
    this.directoryItemRefs = { comments: null, trackChanges: null };
    this.directoryGeneration = 0;
    this.open();
  }

  syncDirectory() {
    const store = this.superdoc?.commentsStore;
    if (!store) return;
    const comments = this.directorySnapshots.comments;
    const trackChanges = this.directorySnapshots.trackChanges;
    store.isReviewDirectoryLoading = comments == null || trackChanges == null;
    if (comments == null && trackChanges == null) return;
    store.setReviewDirectoryFromV2({
      superdoc: this.superdoc,
      commentItems: comments ?? [],
      trackedChangeItems: trackChanges ?? [],
    });
  }

  startDirectoryObservers() {
    const generation = ++this.directoryGeneration;
    const subscribe = (handle, family) => {
      const acceptDirectorySnapshot = (snapshot) => {
        if (generation !== this.directoryGeneration) return;
        if ((snapshot?.listStatus ?? snapshot?.status) !== 'ready') {
          if (this.superdoc?.commentsStore) this.superdoc.commentsStore.isReviewDirectoryLoading = true;
          return;
        }
        const items = Array.isArray(snapshot.items) ? snapshot.items : [];
        if (this.directoryItemRefs[family] === items) {
          if (this.superdoc?.commentsStore) {
            this.superdoc.commentsStore.isReviewDirectoryLoading =
              this.directorySnapshots.comments == null || this.directorySnapshots.trackChanges == null;
          }
          return;
        }
        this.directoryItemRefs[family] = items;
        this.directorySnapshots[family] = items;
        this.syncDirectory();
      };
      const stop = handle.observe((snapshot) => {
        acceptDirectorySnapshot(snapshot);
      });
      const readAfterLeaseAcquisition = () => acceptDirectorySnapshot(handle.getSnapshot());
      if (typeof globalThis.queueMicrotask === 'function') globalThis.queueMicrotask(readAfterLeaseAcquisition);
      else void Promise.resolve().then(readAfterLeaseAcquisition);
      return stop;
    };
    const ui = this.superdoc?.ui;
    if (!ui) return;
    if (this.superdoc?.commentsStore) {
      this.superdoc.commentsStore.isReviewDirectoryActive = true;
      this.superdoc.commentsStore.isReviewDirectoryLoading = true;
    }
    this.stopDirectoryObservers = [subscribe(ui.comments, 'comments'), subscribe(ui.trackChanges, 'trackChanges')];
  }

  createVueApp() {
    this.app = createApp(CommentsList);
    const parentProvides = this.superdoc?.app?._context?.provides;
    if (parentProvides && this.app?._context?.provides) {
      Object.setPrototypeOf(this.app._context.provides, parentProvides);
    }
    if (this.superdoc?.pinia) {
      setActivePinia(this.superdoc.pinia);
      this.app.use(this.superdoc.pinia);
      this.app.config.globalProperties.$pinia = this.superdoc.pinia;
    }
    this.app.directive('click-outside', vClickOutside);
    this.app.config.globalProperties.$superdoc = this.superdoc;

    if (!this.element && this.config.selector) {
      this.element = document.getElementById(this.config.selector);
    }

    this.container = this.app.mount(this.element);
    this.startDirectoryObservers();
  }

  close() {
    this.directoryGeneration += 1;
    for (const stop of this.stopDirectoryObservers.splice(0)) stop?.();
    this.directorySnapshots = { comments: null, trackChanges: null };
    this.directoryItemRefs = { comments: null, trackChanges: null };
    if (this.superdoc?.commentsStore) {
      this.superdoc.commentsStore.clearReviewDirectory();
      this.superdoc.commentsStore.isReviewDirectoryActive = false;
      this.superdoc.commentsStore.isReviewDirectoryLoading = false;
    }
    if (this.app) {
      this.app.unmount();
      this.app = null;
      this.container = null;
      this.element = null;
    }
  }

  open() {
    if (!this.app) {
      this.createVueApp();
    }
  }
}
