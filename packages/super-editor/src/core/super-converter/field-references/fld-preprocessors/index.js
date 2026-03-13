import { preProcessPageInstruction } from './page-preprocessor.js';
import { preProcessNumPagesInstruction } from './num-pages-preprocessor.js';
import { preProcessPageRefInstruction } from './page-ref-preprocessor.js';
import { preProcessHyperlinkInstruction } from './hyperlink-preprocessor.js';
import { preProcessTocInstruction } from './toc-preprocessor.js';
import { preProcessIndexInstruction } from './index-preprocessor.js';
import { preProcessXeInstruction } from './xe-preprocessor.js';
import { preProcessTcInstruction as preProcessTcFieldInstruction } from './tc-preprocessor.js';
import { preProcessRefInstruction } from './ref-preprocessor.js';
import { preProcessNoterefInstruction } from './noteref-preprocessor.js';
import { preProcessStylerefInstruction } from './styleref-preprocessor.js';
import { preProcessSeqInstruction } from './seq-preprocessor.js';
import { preProcessCitationInstruction } from './citation-preprocessor.js';
import { preProcessBibliographyInstruction } from './bibliography-preprocessor.js';
import { preProcessTaInstruction } from './ta-preprocessor.js';
import { preProcessToaInstruction } from './toa-preprocessor.js';

/**
 * @callback InstructionPreProcessor
 * @param {import('../../v2/types/index.js').OpenXmlNode[]} nodesToCombine
 * @param {string} instruction
 * @param {import('../../v2/docxHelper').ParsedDocx} [docx] - The docx object.
 * @returns {import('../../v2/types/index.js').OpenXmlNode[]}
 */

/**
 * Gets the correct pre-processor function for a given instruction.
 * @param {string} instruction The instruction text.
 * @returns {InstructionPreProcessor | null} The pre-processor function or null if not found.
 */
export const getInstructionPreProcessor = (instruction) => {
  const instructionType = instruction.split(' ')[0];
  switch (instructionType) {
    case 'PAGE':
      return preProcessPageInstruction;
    case 'NUMPAGES':
      return preProcessNumPagesInstruction;
    case 'PAGEREF':
      return preProcessPageRefInstruction;
    case 'HYPERLINK':
      return preProcessHyperlinkInstruction;
    case 'TOC':
      return preProcessTocInstruction;
    case 'INDEX':
      return preProcessIndexInstruction;
    case 'XE':
      return preProcessXeInstruction;
    case 'TC':
      return preProcessTcFieldInstruction;
    case 'REF':
      return preProcessRefInstruction;
    case 'NOTEREF':
      return preProcessNoterefInstruction;
    case 'STYLEREF':
      return preProcessStylerefInstruction;
    case 'SEQ':
      return preProcessSeqInstruction;
    case 'CITATION':
      return preProcessCitationInstruction;
    case 'BIBLIOGRAPHY':
      return preProcessBibliographyInstruction;
    case 'TA':
      return preProcessTaInstruction;
    case 'TOA':
      return preProcessToaInstruction;
    default:
      return null;
  }
};
