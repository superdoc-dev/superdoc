// SVG icons for list numbering types
// Each icon shows a list with 2 items at 200% zoom

function makeListIcon(text1, text2, text2X = 15) {
  return `
    <svg width="200" height="150" viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg">
      <style>
        .list-text { font: bold 40px sans-serif; fill: #222; }
        .list-line { stroke: #222; stroke-width: 3; stroke-linecap: round; }
      </style>
      <text x="15" y="50" class="list-text">${text1}</text>
      <line x1="75" y1="40" x2="185" y2="40" class="list-line" />
      <line x1="75" y1="80" x2="185" y2="80" class="list-line" />
      <text x="${text2X}" y="120" class="list-text">${text2}</text>
      <line x1="75" y1="115" x2="185" y2="115" class="list-line" />
    </svg>
  `;
}

export const numberingIcons = {
  decimalPlain: makeListIcon('1', '2'),
  decimal: makeListIcon('1.', '2.'),
  decimalParen: makeListIcon('1)', '2)'),
  upperLetter: makeListIcon('A.', 'B.'),
  lowerLetter: makeListIcon('a.', 'b.'),
  letterParen: makeListIcon('a)', 'b)'),
  upperRoman: makeListIcon('I.', 'II.', 10),
  lowerRoman: makeListIcon('i.', 'ii.'),
};
