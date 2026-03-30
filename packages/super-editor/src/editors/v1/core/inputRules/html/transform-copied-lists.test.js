import { expect } from 'vitest';
import { transformListsInCopiedContent, getListStyleType, getLevel } from './transform-copied-lists.js';

const getCleanedHtml = (html) =>
  html
    .replace(/\n/g, '')
    .replace(/\s{2,}/g, '')
    .trim();

describe('Transform lists in copied content', () => {
  it('should transform a flat list into a single ul', () => {
    const html = `
      <ul>
        <li data-level="0" data-num-fmt="bullet" data-lvl-text="•">A</li>
      </ul>
      <ul>
        <li data-level="0" data-num-fmt="bullet" data-lvl-text="•">B</li>
      </ul>
    `;

    const output = transformListsInCopiedContent(getCleanedHtml(html));

    expect(output).toBe(
      '<ul><li data-level="0" data-num-fmt="bullet" data-lvl-text="•" aria-level="1" style="list-style-type: disc;">A</li>' +
        '<li data-level="0" data-num-fmt="bullet" data-lvl-text="•" aria-level="1" style="list-style-type: disc;">B</li></ul>',
    );
  });

  it('should nest a child li when level increases', () => {
    const html = `
      <ul>
        <li data-level="0" data-num-fmt="bullet" data-lvl-text="•">Parent</li>
      </ul>
      <ol>
        <li data-level="1" data-num-fmt="decimal" data-lvl-text="%1.">Child</li>
      </ol>
    `;

    const output = transformListsInCopiedContent(getCleanedHtml(html));

    expect(output).toBe(
      '<ul><li data-level="0" data-num-fmt="bullet" data-lvl-text="•" aria-level="1" style="list-style-type: disc;">Parent</li>' +
        '<ol><li data-level="1" data-num-fmt="decimal" data-lvl-text="%1." aria-level="2" style="list-style-type: decimal;">Child</li></ol>' +
        '</ul>',
    );
  });

  it('should handle text between lists', () => {
    const html = `
      <ul>
        <li data-level="0" data-num-fmt="bullet" data-lvl-text="•">A</li>
      </ul>
      <p>Between</p>
      <ul>
        <li data-level="0" data-num-fmt="bullet" data-lvl-text="•">B</li>
      </ul>
    `;

    const output = transformListsInCopiedContent(getCleanedHtml(html));

    expect(output).toBe(
      '<ul><li data-level="0" data-num-fmt="bullet" data-lvl-text="•" aria-level="1" style="list-style-type: disc;">A</li></ul>' +
        '<p>Between</p>' +
        '<ul><li data-level="0" data-num-fmt="bullet" data-lvl-text="•" aria-level="1" style="list-style-type: disc;">B</li></ul>',
    );
  });

  it('should create separate lists for ul and ol', () => {
    const html = `
      <ul>
        <li data-level="0" data-num-fmt="bullet" data-lvl-text="•">Bullet</li>
      </ul>
      <ol>
        <li data-level="0" data-num-fmt="decimal" data-lvl-text="%1.">Numbered</li>
      </ol>
    `;

    const output = transformListsInCopiedContent(getCleanedHtml(html));

    expect(output).toBe(
      '<ul><li data-level="0" data-num-fmt="bullet" data-lvl-text="•" aria-level="1" style="list-style-type: disc;">Bullet</li></ul>' +
        '<ol><li data-level="0" data-num-fmt="decimal" data-lvl-text="%1." aria-level="1" style="list-style-type: decimal;">Numbered</li></ol>',
    );
  });

  it('should handle multiple nested children correctly', () => {
    const html = `
      <ul>
        <li data-level="0" data-num-fmt="bullet" data-lvl-text="•">Parent</li>
      </ul>
      <ol>
        <li data-level="1" data-num-fmt="decimal" data-lvl-text="%1.">Child 1</li>
      </ol>
      <ol>
        <li data-level="1" data-num-fmt="decimal" data-lvl-text="%1.">Child 2</li>
      </ol>
    `;

    const output = transformListsInCopiedContent(getCleanedHtml(html));

    expect(output).toBe(
      '<ul><li data-level="0" data-num-fmt="bullet" data-lvl-text="•" aria-level="1" style="list-style-type: disc;">Parent</li>' +
        '<ol><li data-level="1" data-num-fmt="decimal" data-lvl-text="%1." aria-level="2" style="list-style-type: decimal;">Child 1</li>' +
        '<li data-level="1" data-num-fmt="decimal" data-lvl-text="%1." aria-level="2" style="list-style-type: decimal;">Child 2</li></ol>' +
        '</ul>',
    );
  });
});

describe('getListStyleType function', () => {
  it('should return correct value for bullet list', () => {
    const res = getListStyleType('bullet', '▪');
    expect(res).toEqual('square');
  });

  it('should return correct value for ordered list', () => {
    const res = getListStyleType('lowerLetter', '%1.');
    expect(res).toEqual('lower-alpha');
  });
});

describe('getLevel function', () => {
  it('should return correct value for level', () => {
    const html = `<li data-level="1"></li>`;
    const div = document.createElement('div');
    div.innerHTML = html.trim();

    const result = getLevel(div.firstChild);
    expect(result).toEqual(1);
  });
});
