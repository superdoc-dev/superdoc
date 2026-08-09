import { describe, expect, it } from 'vite-plus/test';
import { isActiveTrackedChangeContextMenuTarget } from './comment-small-screen.js';

describe('isActiveTrackedChangeContextMenuTarget', () => {
  it('recognizes descendants of the already-focused tracked-change carrier', () => {
    const carrier = document.createElement('span');
    carrier.classList.add('track-change-focused');
    const child = document.createElement('strong');
    carrier.appendChild(child);

    expect(isActiveTrackedChangeContextMenuTarget(child)).toBe(true);
  });

  it('does not preserve inactive tracked changes or unrelated active review carriers', () => {
    const inactiveTrackedChange = document.createElement('span');
    inactiveTrackedChange.setAttribute('data-track-change-id', 'tc-1');
    const activeComment = document.createElement('span');
    activeComment.classList.add('sd-review-target-active');

    expect(isActiveTrackedChangeContextMenuTarget(inactiveTrackedChange)).toBe(false);
    expect(isActiveTrackedChangeContextMenuTarget(activeComment)).toBe(false);
    expect(isActiveTrackedChangeContextMenuTarget(null)).toBe(false);
  });
});
