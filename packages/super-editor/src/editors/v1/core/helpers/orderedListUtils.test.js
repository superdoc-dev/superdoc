import { intToJapaneseCounting } from './orderedListUtils.js';

describe('intToJapaneseCounting', () => {
  it('tests the result for intToJapaneseCounting function', () => {
    expect(intToJapaneseCounting(1)).toBe('一');
    expect(intToJapaneseCounting(2)).toBe('二');
    expect(intToJapaneseCounting(3)).toBe('三');
    expect(intToJapaneseCounting(4)).toBe('四');
    expect(intToJapaneseCounting(5)).toBe('五');
    expect(intToJapaneseCounting(6)).toBe('六');
    expect(intToJapaneseCounting(7)).toBe('七');
    expect(intToJapaneseCounting(8)).toBe('八');
    expect(intToJapaneseCounting(9)).toBe('九');

    expect(intToJapaneseCounting(10)).toBe('十');
    expect(intToJapaneseCounting(15)).toBe('十五');
    expect(intToJapaneseCounting(19)).toBe('十九');

    expect(intToJapaneseCounting(100)).toBe('百');
    expect(intToJapaneseCounting(101)).toBe('百零一');
    expect(intToJapaneseCounting(102)).toBe('百零二');
  });
});
