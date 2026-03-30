const ADJECTIVES = [
  'blue', 'red', 'green', 'swift', 'bright', 'calm', 'bold', 'warm',
  'cool', 'deep', 'fair', 'keen', 'wild', 'soft', 'pure', 'glad',
];

const NOUNS = [
  'fox', 'owl', 'bear', 'wolf', 'hawk', 'deer', 'dove', 'swan',
  'pike', 'hare', 'wren', 'lynx', 'crow', 'lark', 'seal', 'moth',
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateRoomName(): string {
  const num = Math.floor(Math.random() * 100);
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}-${num}`;
}
