import { normalizeMutationOptions } from './write.js';

describe('normalizeMutationOptions', () => {
  it('defaults changeMode to direct when options are omitted', () => {
    expect(normalizeMutationOptions()).toEqual({ changeMode: 'direct', dryRun: false });
  });

  it('defaults changeMode to direct when changeMode is undefined', () => {
    expect(normalizeMutationOptions({})).toEqual({ changeMode: 'direct', dryRun: false });
  });

  it('preserves explicit direct changeMode', () => {
    expect(normalizeMutationOptions({ changeMode: 'direct' })).toEqual({ changeMode: 'direct', dryRun: false });
  });

  it('preserves explicit tracked changeMode', () => {
    expect(normalizeMutationOptions({ changeMode: 'tracked' })).toEqual({ changeMode: 'tracked', dryRun: false });
  });

  it('preserves explicit dryRun true', () => {
    expect(normalizeMutationOptions({ dryRun: true })).toEqual({ changeMode: 'direct', dryRun: true });
  });
});
