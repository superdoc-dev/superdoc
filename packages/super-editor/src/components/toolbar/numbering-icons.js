// SVG icons for list numbering types
// Each icon shows a list with 2 items at 200% zoom

export const numberingIcons = {
  decimalPlain: `
    <svg width="200" height="150" viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg">
      <style>
        .list-text { font: bold 40px sans-serif; fill: #222; }
        .list-line { stroke: #222; stroke-width: 3; stroke-linecap: round; }
      </style>
      <text x="15" y="50" class="list-text">1</text>
      <line x1="75" y1="40" x2="185" y2="40" class="list-line" />
      <line x1="75" y1="80" x2="185" y2="80" class="list-line" />
      <text x="15" y="120" class="list-text">2</text>
      <line x1="75" y1="115" x2="185" y2="115" class="list-line" />
    </svg>
  `,

  decimal: `
    <svg width="200" height="150" viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg">
      <style>
        .list-text { font: bold 40px sans-serif; fill: #222; }
        .list-line { stroke: #222; stroke-width: 3; stroke-linecap: round; }
      </style>
      <text x="15" y="50" class="list-text">1.</text>
      <line x1="75" y1="40" x2="185" y2="40" class="list-line" />
      <line x1="75" y1="80" x2="185" y2="80" class="list-line" />
      <text x="15" y="120" class="list-text">2.</text>
      <line x1="75" y1="115" x2="185" y2="115" class="list-line" />
    </svg>
  `,

  decimalParen: `
    <svg width="200" height="150" viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg">
      <style>
        .list-text { font: bold 40px sans-serif; fill: #222; }
        .list-line { stroke: #222; stroke-width: 3; stroke-linecap: round; }
      </style>
      <text x="15" y="50" class="list-text">1)</text>
      <line x1="75" y1="40" x2="185" y2="40" class="list-line" />
      <line x1="75" y1="80" x2="185" y2="80" class="list-line" />
      <text x="15" y="120" class="list-text">2)</text>
      <line x1="75" y1="115" x2="185" y2="115" class="list-line" />
    </svg>
  `,

  upperLetter: `
    <svg width="200" height="150" viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg">
      <style>
        .list-text { font: bold 40px sans-serif; fill: #222; }
        .list-line { stroke: #222; stroke-width: 3; stroke-linecap: round; }
      </style>
      <text x="15" y="50" class="list-text">A.</text>
      <line x1="75" y1="40" x2="185" y2="40" class="list-line" />
      <line x1="75" y1="80" x2="185" y2="80" class="list-line" />
      <text x="15" y="120" class="list-text">B.</text>
      <line x1="75" y1="115" x2="185" y2="115" class="list-line" />
    </svg>
  `,

  lowerLetter: `
    <svg width="200" height="150" viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg">
      <style>
        .list-text { font: bold 40px sans-serif; fill: #222; }
        .list-line { stroke: #222; stroke-width: 3; stroke-linecap: round; }
      </style>
      <text x="15" y="50" class="list-text">a.</text>
      <line x1="75" y1="40" x2="185" y2="40" class="list-line" />
      <line x1="75" y1="80" x2="185" y2="80" class="list-line" />
      <text x="15" y="120" class="list-text">b.</text>
      <line x1="75" y1="115" x2="185" y2="115" class="list-line" />
    </svg>
  `,

  letterParen: `
    <svg width="200" height="150" viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg">
      <style>
        .list-text { font: bold 40px sans-serif; fill: #222; }
        .list-line { stroke: #222; stroke-width: 3; stroke-linecap: round; }
      </style>
      <text x="15" y="50" class="list-text">a)</text>
      <line x1="75" y1="40" x2="185" y2="40" class="list-line" />
      <line x1="75" y1="80" x2="185" y2="80" class="list-line" />
      <text x="15" y="120" class="list-text">b)</text>
      <line x1="75" y1="115" x2="185" y2="115" class="list-line" />
    </svg>
  `,

  upperRoman: `
    <svg width="200" height="150" viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg">
      <style>
        .list-text { font: bold 40px sans-serif; fill: #222; }
        .list-line { stroke: #222; stroke-width: 3; stroke-linecap: round; }
      </style>
      <text x="15" y="50" class="list-text">I.</text>
      <line x1="75" y1="40" x2="185" y2="40" class="list-line" />
      <line x1="75" y1="80" x2="185" y2="80" class="list-line" />
      <text x="10" y="120" class="list-text">II.</text>
      <line x1="75" y1="115" x2="185" y2="115" class="list-line" />
    </svg>
  `,

  lowerRoman: `
    <svg width="200" height="150" viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg">
      <style>
        .list-text { font: bold 40px sans-serif; fill: #222; }
        .list-line { stroke: #222; stroke-width: 3; stroke-linecap: round; }
      </style>
      <text x="15" y="50" class="list-text">i.</text>
      <line x1="75" y1="40" x2="185" y2="40" class="list-line" />
      <line x1="75" y1="80" x2="185" y2="80" class="list-line" />
      <text x="15" y="120" class="list-text">ii.</text>
      <line x1="75" y1="115" x2="185" y2="115" class="list-line" />
    </svg>
  `,
};
