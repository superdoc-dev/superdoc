import { Extension } from '../Extension.js';
import { createPositionTrackerPlugin, PositionTracker } from '../PositionTracker.js';

export const PositionTrackerExtension = Extension.create({
  name: 'positionTracker',

  addStorage() {
    return {
      tracker: null,
    };
  },

  addPmPlugins() {
    return [createPositionTrackerPlugin()];
  },

  onCreate() {
    const existing = this.editor?.positionTracker ?? this.storage.tracker;
    if (existing) {
      this.storage.tracker = existing;
      this.editor.positionTracker = existing;
      return;
    }

    const tracker = new PositionTracker(this.editor);
    this.storage.tracker = tracker;
    this.editor.positionTracker = tracker;
  },

  onDestroy() {
    if (this.editor?.positionTracker === this.storage.tracker) {
      this.editor.positionTracker = null;
    }
    this.storage.tracker = null;
  },
});
