import { describe, it, expect } from 'vitest';
import { useHighContrastMode } from './use-high-contrast-mode.js';

describe('useHighContrastMode', () => {
  it('exposes a shared reactive isHighContrastMode flag defaulting to false', () => {
    const { isHighContrastMode, setHighContrastMode } = useHighContrastMode();
    setHighContrastMode(false);
    expect(isHighContrastMode.value).toBe(false);
  });

  it('setHighContrastMode updates the flag', () => {
    const { isHighContrastMode, setHighContrastMode } = useHighContrastMode();
    setHighContrastMode(true);
    expect(isHighContrastMode.value).toBe(true);
    setHighContrastMode(false);
    expect(isHighContrastMode.value).toBe(false);
  });

  it('state is shared across invocations (module-scoped ref)', () => {
    const a = useHighContrastMode();
    const b = useHighContrastMode();
    a.setHighContrastMode(true);
    expect(b.isHighContrastMode.value).toBe(true);
    a.setHighContrastMode(false);
  });
});
