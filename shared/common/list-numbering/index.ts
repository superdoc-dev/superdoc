type NumberingHandler = (path: number[], lvlText: string, customFormat?: string) => string | null;

type NumberFormatter = (value: number, idx?: number) => string;

const handleDecimal: NumberingHandler = (path, lvlText) => generateNumbering(path, lvlText, numberToStringFormatter);
const handleRoman: NumberingHandler = (path, lvlText) => generateNumbering(path, lvlText, intToRoman);
const handleLowerRoman: NumberingHandler = (path, lvlText) => {
  const result = handleRoman(path, lvlText);
  return result ? result.toLowerCase() : null;
};
const handleAlpha: NumberingHandler = (path, lvlText) => generateNumbering(path, lvlText, intToAlpha);
const handleLowerAlpha: NumberingHandler = (path, lvlText) => {
  const result = handleAlpha(path, lvlText);
  return result ? result.toLowerCase() : null;
};
const handleOrdinal: NumberingHandler = (path, lvlText) => generateNumbering(path, lvlText, ordinalFormatter);
const handleCustom: NumberingHandler = (path, lvlText, customFormat) =>
  generateFromCustom(path, lvlText, customFormat as string);
const handleJapaneseCounting: NumberingHandler = (path, lvlText) =>
  generateNumbering(path, lvlText, intToJapaneseCounting);
const handleDecimalZero: NumberingHandler = (path, lvlText) => generateNumbering(path, lvlText, decimalZeroFormatter);

const listIndexMap: Record<string, NumberingHandler> = {
  decimal: handleDecimal,
  decimalZero: handleDecimalZero,
  lowerRoman: handleLowerRoman,
  upperRoman: handleRoman,
  lowerLetter: handleLowerAlpha,
  upperLetter: handleAlpha,
  ordinal: handleOrdinal,
  custom: handleCustom,
  japaneseCounting: handleJapaneseCounting,
};

export interface GenerateOrderedListIndexOptions {
  listLevel: number[];
  lvlText: string | null | undefined;
  listNumberingType?: string;
  customFormat?: string;
}

export const generateOrderedListIndex = ({
  listLevel,
  lvlText,
  listNumberingType,
  customFormat,
}: GenerateOrderedListIndexOptions): string | null => {
  if (typeof lvlText !== 'string') return null;
  const handler = listIndexMap[listNumberingType as string];
  return handler ? handler(listLevel, lvlText, customFormat) : null;
};

const createNumbering = (values: string[], lvlText: string): string => {
  if (typeof lvlText !== 'string') return '';
  return values.reduce<string>((acc, value, index) => {
    return Number(value) > 9
      ? acc.replace(/^0/, '').replace(`%${index + 1}`, value)
      : acc.replace(`%${index + 1}`, value);
  }, lvlText);
};

const generateNumbering = (path: number[], lvlText: string, formatter: NumberFormatter): string => {
  const formattedValues = path.map((entry, idx) => formatter(entry, idx));
  return createNumbering(formattedValues, lvlText);
};

const ordinalFormatter: NumberFormatter = (value) => {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const lastTwo = value % 100;
  const suffix = suffixes[(lastTwo - 20) % 10] || suffixes[lastTwo] || suffixes[0];
  return `${value}${suffix}`;
};

const decimalZeroFormatter: NumberFormatter = (value, idx) => {
  if (value >= 10 || idx === 0) return String(value);
  return `0${value}`;
};

const generateFromCustom = (path: number[], lvlText: string, customFormat: string): string => {
  if (typeof customFormat !== 'string') {
    return generateNumbering(path, lvlText, numberToStringFormatter);
  }
  if (customFormat.match(/(?:[0]+\d,\s){3}\.{3}/) == null) {
    return generateNumbering(path, lvlText, numberToStringFormatter);
  }

  const match = customFormat.match(/(\d+)/);
  if (!match) {
    throw new Error('Invalid format string: no numeric pattern found');
  }

  const digitCount = match[1].length;
  return generateNumbering(path, lvlText, (p) => String(p).padStart(digitCount, '0'));
};

const numberToStringFormatter: NumberFormatter = (value) => String(value);

const intToRoman = (num: number): string => {
  const romanNumeralMap = [
    { value: 1000, numeral: 'M' },
    { value: 900, numeral: 'CM' },
    { value: 500, numeral: 'D' },
    { value: 400, numeral: 'CD' },
    { value: 100, numeral: 'C' },
    { value: 90, numeral: 'XC' },
    { value: 50, numeral: 'L' },
    { value: 40, numeral: 'XL' },
    { value: 10, numeral: 'X' },
    { value: 9, numeral: 'IX' },
    { value: 5, numeral: 'V' },
    { value: 4, numeral: 'IV' },
    { value: 1, numeral: 'I' },
  ];

  let result = '';
  let remaining = num;
  for (const { value, numeral } of romanNumeralMap) {
    while (remaining >= value) {
      result += numeral;
      remaining -= value;
    }
  }
  return result;
};

const intToAlpha = (num: number): string => {
  let result = '';
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let value = num;
  while (value > 0) {
    const index = (value - 1) % 26;
    result = alphabet[index] + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
};

export const intToJapaneseCounting = (num: number): string => {
  const digits = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const units = ['', '十', '百', '千'];

  if (num === 0) return '零';
  if (num < 10) return digits[num];

  let result = '';
  let tempNum = num;
  let unitIndex = 0;

  while (tempNum > 0) {
    const digit = tempNum % 10;
    if (digit !== 0) {
      const digitStr = digit === 1 && unitIndex > 0 ? '' : digits[digit];
      result = digitStr + (unitIndex > 0 ? units[unitIndex] : '') + result;
    } else if (result && tempNum > 0) {
      if (!result.startsWith('零') && tempNum % 100 !== 0) {
        result = '零' + result;
      }
    }

    tempNum = Math.floor(tempNum / 10);
    unitIndex += 1;

    if (unitIndex > 3) break;
  }

  if (num >= 10 && num < 20) {
    result = result.replace(/^一十/, '十');
  }

  return result;
};

const normalizeChars = new Set(['', '', '○', 'o', '■', '□']);

export const normalizeLvlTextChar = (lvlText?: string): string | undefined => {
  if (!lvlText || !normalizeChars.has(lvlText)) return lvlText;

  if (lvlText === '') return '•';
  if (lvlText === '○' || lvlText === 'o') return '◦';
  if (lvlText === '■' || lvlText === '') return '▪';
  if (lvlText === '□') return '◯';
  return lvlText;
};

export const listNumberingHelpers = {
  generateOrderedListIndex,
  intToJapaneseCounting,
  normalizeLvlTextChar,
};

export type { NumberingHandler };
