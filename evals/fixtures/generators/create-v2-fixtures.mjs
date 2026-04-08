#!/usr/bin/env node
/**
 * Creates 4 v2 DOCX fixture documents with rich formatting.
 *
 * These fixtures are designed to be "fragile" — they contain structures
 * (tables, tracked changes, comments, nested lists, bold terms) that raw
 * XML manipulation will break if not done carefully. SuperDoc tools handle
 * these structures correctly.
 *
 * Output:
 *   evals/fixtures/consulting-agreement.docx
 *   evals/fixtures/pricing-proposal.docx
 *   evals/fixtures/contract-redlines.docx
 *   evals/fixtures/policy-manual.docx
 *
 * Usage: node scripts/create-v2-fixtures.mjs
 */

import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AlignmentType,
  BorderStyle,
  CommentRangeEnd,
  CommentRangeStart,
  CommentReference,
  DeletedTextRun,
  Document,
  Footer,
  Header,
  HeadingLevel,
  InsertedTextRun,
  LevelFormat,
  Packer,
  PageBreak,
  PageNumberElement,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '..', 'fixtures');

// ---------------------------------------------------------------------------
// Helper: save buffer to file
// ---------------------------------------------------------------------------

async function saveDocx(doc, filename) {
  const buffer = await Packer.toBuffer(doc);
  const outPath = join(FIXTURES_DIR, filename);
  writeFileSync(outPath, buffer);
  console.log(`  Created: ${outPath} (${(buffer.byteLength / 1024).toFixed(1)} KB)`);
  return outPath;
}

// ---------------------------------------------------------------------------
// 1. consulting-agreement.docx
// ---------------------------------------------------------------------------

async function createConsultingAgreement() {
  console.log('Creating consulting-agreement.docx...');

  const doc = new Document({
    creator: 'SuperDoc Fixtures',
    title: 'Consulting Agreement',
    description: 'Consulting agreement between Astra Dynamics and Globex Industries',
    sections: [
      {
        properties: {},
        children: [
          // Title
          new Paragraph({
            text: 'CONSULTING SERVICES AGREEMENT',
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),

          // Parties intro
          new Paragraph({
            children: [
              new TextRun(
                'This Consulting Services Agreement (the "Agreement") is entered into as of January 1, 2026, by and between '
              ),
              new TextRun({ text: 'Astra Dynamics', bold: true }),
              new TextRun(', a Delaware corporation ("Client"), and '),
              new TextRun({ text: 'Globex Industries', bold: true }),
              new TextRun(', an Illinois limited liability company ("Consultant").'),
            ],
            spacing: { after: 300 },
          }),

          // Section 1: Definitions
          new Paragraph({
            text: '1. Definitions',
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
          }),

          new Paragraph({
            children: [
              new TextRun('For purposes of this Agreement, the following terms have the meanings set forth below:'),
            ],
            spacing: { after: 200 },
          }),

          new Paragraph({
            children: [
              new TextRun('"'),
              new TextRun({ text: 'Confidential Information', bold: true }),
              new TextRun(
                '" means any non-public information disclosed by either party to the other, ' +
                  'whether orally or in writing, that is designated as confidential or that reasonably should be ' +
                  'understood to be confidential given the nature of the information and the circumstances of disclosure.'
              ),
            ],
            spacing: { after: 200 },
          }),

          new Paragraph({
            children: [
              new TextRun('"'),
              new TextRun({ text: 'Services', bold: true }),
              new TextRun(
                '" means the consulting, advisory, and professional services to be performed by ' +
                  'Consultant for Client as described in Exhibit A attached hereto and incorporated herein by reference.'
              ),
            ],
            spacing: { after: 200 },
          }),

          new Paragraph({
            children: [
              new TextRun('"'),
              new TextRun({ text: 'Deliverables', bold: true }),
              new TextRun(
                '" means all work product, reports, analyses, recommendations, documents, ' +
                  'software, data, and other materials created, developed, or produced by Consultant in connection ' +
                  'with the Services.'
              ),
            ],
            spacing: { after: 300 },
          }),

          // Section 2: Scope of Services
          new Paragraph({
            text: '2. Scope of Services',
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
          }),

          new Paragraph({
            children: [
              new TextRun(
                '2.1  Consultant shall perform the Services as described herein with reasonable care, ' +
                  'skill, and diligence, in accordance with applicable professional standards. The specific scope, ' +
                  'timeline, and milestones for the Services are set forth in the applicable Statement of Work.'
              ),
            ],
            spacing: { after: 200 },
          }),

          new Paragraph({
            children: [
              new TextRun(
                '2.2  Consultant shall provide Client with progress reports and shall make ' +
                  'Deliverables available for review at the milestones specified in the applicable Statement of Work. ' +
                  'Client shall review and provide feedback within ten (10) business days of receipt.'
              ),
            ],
            spacing: { after: 300 },
          }),

          // Section 3: Confidentiality
          new Paragraph({
            text: '3. Confidentiality',
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
          }),

          new Paragraph({
            children: [
              new TextRun(
                '3.1  Each party (as a receiving party) agrees to hold the disclosing party\'s ' +
                  'Confidential Information in strict confidence and not to disclose such Confidential Information to ' +
                  'any third party without the prior written consent of the disclosing party.'
              ),
            ],
            spacing: { after: 200 },
          }),

          new Paragraph({
            children: [
              new TextRun('3.2  The obligations set forth in Section 3.1 shall not apply to information that: ' +
                '(a) is or becomes publicly available through no breach of this Agreement; ' +
                '(b) was rightfully known to the receiving party prior to disclosure; or ' +
                '(c) is required to be disclosed by applicable law or court order ('),
              new TextRun({ text: 'see Section 3.2', italics: true }),
              new TextRun(' for exceptions).'),
            ],
            spacing: { after: 300 },
          }),

          // Section 4: Indemnification
          new Paragraph({
            text: '4. Indemnification',
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
          }),

          new Paragraph({
            children: [
              new TextRun(
                '4.1  Mutual Indemnification. Each party (the "Indemnifying Party") shall indemnify, ' +
                  'defend, and hold harmless the other party and its officers, directors, employees, and agents ' +
                  '(each an "Indemnified Party") from and against any claims, damages, losses, liabilities, costs, ' +
                  'and expenses (including reasonable attorneys\' fees) arising out of or related to: (a) any material ' +
                  'breach of this Agreement by the Indemnifying Party; or (b) the gross negligence or willful misconduct ' +
                  'of the Indemnifying Party.'
              ),
            ],
            spacing: { after: 200 },
          }),

          new Paragraph({
            children: [
              new TextRun(
                '4.2  Liability Cap. Notwithstanding anything to the contrary herein, the aggregate ' +
                  'liability of either party under this Section 4 shall not exceed '
              ),
              new TextRun({ text: '$250,000', bold: true }),
              new TextRun(
                ' (two hundred fifty thousand dollars) per occurrence, except in cases of ' +
                  'gross negligence, fraud, or willful misconduct.'
              ),
            ],
            spacing: { after: 300 },
          }),

          // Section 5: Payment Terms
          new Paragraph({
            text: '5. Payment Terms',
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
          }),

          new Paragraph({
            children: [
              new TextRun(
                '5.1  Fees. Client shall pay Consultant at a rate of '
              ),
              new TextRun({ text: '$150 per hour', bold: true }),
              new TextRun(
                ' for all Services performed under this Agreement. Consultant shall invoice Client monthly ' +
                  'for hours worked during the preceding calendar month, accompanied by reasonable supporting documentation.'
              ),
            ],
            spacing: { after: 200 },
          }),

          new Paragraph({
            children: [
              new TextRun(
                '5.2  Payment Due Date. All undisputed invoices are due and payable within '
              ),
              new TextRun({ text: 'net 45 days', bold: true }),
              new TextRun(
                ' of the invoice date. Invoices not paid within such period shall accrue interest at ' +
                  'a rate of 1.5% per month (or the maximum rate permitted by law, if less).'
              ),
            ],
            spacing: { after: 300 },
          }),

          // Section 6: Term and Termination
          new Paragraph({
            text: '6. Term and Termination',
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
          }),

          new Paragraph({
            children: [
              new TextRun(
                '6.1  Term. This Agreement shall commence on the Effective Date and shall continue ' +
                  'for a period of one (1) year unless earlier terminated in accordance with this Section 6.'
              ),
            ],
            spacing: { after: 200 },
          }),

          new Paragraph({
            children: [
              new TextRun(
                '6.2  Termination for Convenience. Either party may terminate this Agreement upon ' +
                  'thirty (30) days\' prior written notice to the other party. In the event of termination for ' +
                  'convenience, Client shall pay Consultant for all Services performed through the effective date ' +
                  'of termination.'
              ),
            ],
            spacing: { after: 200 },
          }),

          new Paragraph({
            children: [
              new TextRun(
                '6.3  Survival. Sections 1, 3, 4, and 5 shall survive any termination or expiration of this Agreement.'
              ),
            ],
            spacing: { after: 400 },
          }),

          // Signature block
          new Paragraph({
            children: [new TextRun('IN WITNESS WHEREOF, the parties have executed this Agreement as of the date first written above.')],
            spacing: { after: 400 },
          }),

          new Paragraph({
            children: [new TextRun({ text: 'ASTRA DYNAMICS', bold: true })],
          }),
          new Paragraph({ children: [new TextRun('By: _________________________________')] }),
          new Paragraph({ children: [new TextRun('Name:'), new TextRun('   ')], spacing: { after: 200 } }),

          new Paragraph({
            children: [new TextRun({ text: 'GLOBEX INDUSTRIES', bold: true })],
          }),
          new Paragraph({ children: [new TextRun('By: _________________________________')] }),
          new Paragraph({ children: [new TextRun('Name:'), new TextRun('   ')] }),
        ],
      },
    ],
  });

  return saveDocx(doc, 'consulting-agreement.docx');
}

// ---------------------------------------------------------------------------
// 2. pricing-proposal.docx
// ---------------------------------------------------------------------------

async function createPricingProposal() {
  console.log('Creating pricing-proposal.docx...');

  // Table rows: header + 3 data rows
  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      new TableCell({
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'BDD7EE' },
        children: [new Paragraph({ children: [new TextRun({ text: 'Plan', bold: true })] })],
      }),
      new TableCell({
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'BDD7EE' },
        children: [new Paragraph({ children: [new TextRun({ text: 'Monthly Price', bold: true })] })],
      }),
      new TableCell({
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'BDD7EE' },
        children: [new Paragraph({ children: [new TextRun({ text: 'Users', bold: true })] })],
      }),
      new TableCell({
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'BDD7EE' },
        children: [new Paragraph({ children: [new TextRun({ text: 'Support Level', bold: true })] })],
      }),
    ],
  });

  function makeDataRow(plan, price, users, support) {
    return new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({ children: [new TextRun(plan)] })],
        }),
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun(price)],
              alignment: AlignmentType.RIGHT,
            }),
          ],
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun(users)] })],
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun(support)] })],
        }),
      ],
    });
  }

  const pricingTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: '4472C4' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: '4472C4' },
      left: { style: BorderStyle.SINGLE, size: 1, color: '4472C4' },
      right: { style: BorderStyle.SINGLE, size: 1, color: '4472C4' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: '4472C4' },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: '4472C4' },
    },
    rows: [
      headerRow,
      makeDataRow('Starter', '$49', '5', 'Email'),
      makeDataRow('Professional', '$199', '25', 'Priority'),
      makeDataRow('Enterprise', '$399', 'Unlimited', 'Dedicated'),
    ],
  });

  const doc = new Document({
    creator: 'SuperDoc Fixtures',
    title: 'Pricing Proposal',
    description: 'Pricing proposal from Globex Industries',
    sections: [
      {
        properties: {
          page: {
            size: {
              // US Letter: 8.5 x 11 inches (in twips: 12240 x 15840)
              width: 12240,
              height: 15840,
            },
          },
        },
        children: [
          // Title
          new Paragraph({
            text: 'PRICING PROPOSAL',
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
          }),

          new Paragraph({
            children: [new TextRun({ text: 'Globex Industries', bold: true })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),

          // Intro paragraph before table
          new Paragraph({
            children: [
              new TextRun(
                'We are pleased to present the following pricing options for Globex Industries\' suite of ' +
                  'enterprise software solutions. Each plan is designed to meet the needs of organizations at ' +
                  'different stages of growth, from early-stage startups to large multinational enterprises.'
              ),
            ],
            spacing: { after: 400 },
          }),

          new Paragraph({
            text: 'Available Plans',
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 200, after: 300 },
          }),

          // The pricing table
          pricingTable,

          // Post-table paragraph
          new Paragraph({
            children: [
              new TextRun(
                'All prices are in USD and are billed on a monthly basis. Annual billing is available at a ' +
                  '15% discount. Enterprise plan pricing may vary based on custom integrations and volume commitments. ' +
                  'Please contact your account representative for a customized quote.'
              ),
            ],
            spacing: { before: 400, after: 300 },
          }),

          new Paragraph({
            children: [
              new TextRun(
                'This proposal is valid for 30 days from the date of issue. Terms and conditions apply. ' +
                  'For questions, please reach out to sales@globex-industries.example.com.'
              ),
            ],
            spacing: { after: 400 },
          }),
        ],
      },
    ],
  });

  return saveDocx(doc, 'pricing-proposal.docx');
}

// ---------------------------------------------------------------------------
// 3. contract-redlines.docx
// ---------------------------------------------------------------------------

async function createContractRedlines() {
  console.log('Creating contract-redlines.docx...');

  const editorAuthor = 'Jane Editor';
  const editorDate = new Date('2026-01-15T10:00:00Z');
  const reviewerAuthor = 'Bob Reviewer';
  const reviewerDate = new Date('2026-01-16T14:30:00Z');

  // Comments are passed as raw option objects — Comments class wraps them in new Comment() internally
  const commentsChildren = [
    {
      id: 1,
      author: reviewerAuthor,
      initials: 'BR',
      date: reviewerDate,
      children: [
        new Paragraph({
          children: [
            new TextRun(
              'This payment clause needs to be clarified. Net 45 seems long — please confirm with Finance.'
            ),
          ],
        }),
      ],
    },
    {
      id: 2,
      author: reviewerAuthor,
      initials: 'BR',
      date: reviewerDate,
      children: [
        new Paragraph({
          children: [
            new TextRun(
              'Liability cap should reference the total contract value, not a flat amount. Suggest revising.'
            ),
          ],
        }),
      ],
    },
  ];

  const doc = new Document({
    creator: 'SuperDoc Fixtures',
    title: 'Services Agreement with Redlines',
    description: 'Services agreement between Umbrella Corp and Initech Ltd with tracked changes',
    comments: { children: commentsChildren },
    sections: [
      {
        properties: {},
        children: [
          // Title
          new Paragraph({
            text: 'SERVICES AGREEMENT',
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
          }),

          new Paragraph({
            children: [
              new TextRun('This Services Agreement (the "Agreement") is entered into as of '),
              new InsertedTextRun({
                text: 'February 1, 2026',
                author: editorAuthor,
                date: editorDate,
                id: 1,
                bold: false,
              }),
              new TextRun(' by and between '),
              new TextRun({ text: 'Umbrella Corp', bold: true }),
              new TextRun(' ("Client") and '),
              new TextRun({ text: 'Initech Ltd', bold: true }),
              new TextRun(' ("Provider").'),
            ],
            spacing: { after: 300 },
          }),

          // Section 1: Services
          new Paragraph({
            text: '1. Services',
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
          }),

          new Paragraph({
            children: [
              new TextRun(
                '1.1  Provider shall perform the services described in Schedule A to this Agreement (the "Services"). ' +
                  'Provider represents that it has the expertise, qualifications, and resources necessary to perform the Services.'
              ),
            ],
            spacing: { after: 200 },
          }),

          new Paragraph({
            children: [
              new TextRun(
                '1.2  Provider shall perform the Services in a professional and workmanlike manner, consistent with ' +
                  'industry standards and in compliance with all applicable laws and regulations.'
              ),
              new InsertedTextRun({
                text: ' Provider shall designate a project lead responsible for day-to-day communications with Client.',
                author: editorAuthor,
                date: editorDate,
                id: 2,
              }),
            ],
            spacing: { after: 300 },
          }),

          // Section 2: Payment
          new Paragraph({
            text: '2. Payment',
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
          }),

          // Paragraph with a comment range
          new Paragraph({
            children: [
              new CommentRangeStart(1),
              new TextRun(
                '2.1  Client shall pay all undisputed invoices within '
              ),
              new DeletedTextRun({
                text: 'net 30',
                author: editorAuthor,
                date: editorDate,
                id: 3,
              }),
              new InsertedTextRun({
                text: 'net 45',
                author: editorAuthor,
                date: editorDate,
                id: 4,
              }),
              new TextRun(
                ' days of the invoice date. Late payments shall accrue interest at 1.5% per month.'
              ),
              new CommentRangeEnd(1),
              new CommentReference(1),
            ],
            spacing: { after: 200 },
          }),

          new Paragraph({
            children: [
              new TextRun(
                '2.2  Client shall reimburse Provider for all reasonable and pre-approved out-of-pocket expenses ' +
                  'incurred in connection with the Services, provided such expenses are documented with receipts.'
              ),
            ],
            spacing: { after: 300 },
          }),

          // Section 3: Liability
          new Paragraph({
            text: '3. Liability',
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
          }),

          // Paragraph with second comment
          new Paragraph({
            children: [
              new CommentRangeStart(2),
              new TextRun(
                '3.1  In no event shall either party be liable for any indirect, incidental, special, ' +
                  'or consequential damages arising out of this Agreement. Each party\'s total liability shall not exceed '
              ),
              new DeletedTextRun({
                text: '$100,000',
                author: editorAuthor,
                date: editorDate,
                id: 5,
              }),
              new TextRun(' $500,000'),
              new TextRun('.'),
              new CommentRangeEnd(2),
              new CommentReference(2),
            ],
            spacing: { after: 300 },
          }),

          // Section 4: Confidentiality
          new Paragraph({
            text: '4. Confidentiality',
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
          }),

          new Paragraph({
            children: [
              new TextRun(
                '4.1  Each party agrees to maintain the other party\'s Confidential Information in strict confidence ' +
                  'and not to use or disclose it except as necessary to perform this Agreement.'
              ),
            ],
            spacing: { after: 200 },
          }),

          new Paragraph({
            children: [
              new TextRun('4.2  The confidentiality obligations under this Agreement shall survive for '),
              new InsertedTextRun({
                text: 'three (3)',
                author: editorAuthor,
                date: editorDate,
                id: 6,
              }),
              new TextRun(' years following termination or expiration of the Agreement.'),
            ],
            spacing: { after: 300 },
          }),

          // Section 5: Termination
          new Paragraph({
            text: '5. Termination',
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
          }),

          new Paragraph({
            children: [
              new TextRun(
                '5.1  Either party may terminate this Agreement upon thirty (30) days\' written notice. ' +
                  'Upon termination, Client shall pay for all Services performed through the termination date.'
              ),
            ],
            spacing: { after: 200 },
          }),

          new Paragraph({
            children: [
              new TextRun(
                '5.2  Either party may terminate this Agreement immediately upon written notice if the other party ' +
                  'materially breaches this Agreement and fails to cure such breach within fifteen (15) days after ' +
                  'written notice of the breach.'
              ),
            ],
            spacing: { after: 400 },
          }),
        ],
      },
    ],
  });

  return saveDocx(doc, 'contract-redlines.docx');
}

// ---------------------------------------------------------------------------
// 4. policy-manual.docx
// ---------------------------------------------------------------------------

async function createPolicyManual() {
  console.log('Creating policy-manual.docx...');

  // Pass numbering config as plain object — Document wraps it in new Numbering() internally
  const numberingConfig = {
    config: [
      {
        reference: 'policy-list',
        levels: [
          {
            level: 0,
            format: LevelFormat.DECIMAL,
            text: '%1.',
            alignment: AlignmentType.LEFT,
            start: 1,
            style: {
              paragraph: { indent: { left: 360, hanging: 360 } },
              run: { bold: true },
            },
          },
          {
            level: 1,
            format: LevelFormat.DECIMAL,
            text: '%1.%2',
            alignment: AlignmentType.LEFT,
            start: 1,
            style: {
              paragraph: { indent: { left: 720, hanging: 360 } },
            },
          },
          {
            level: 2,
            format: LevelFormat.LOWER_LETTER,
            text: '%3)',
            alignment: AlignmentType.LEFT,
            start: 1,
            style: {
              paragraph: { indent: { left: 1080, hanging: 360 } },
            },
          },
        ],
      },
    ],
  };

  // Helper to create a list paragraph at a given level
  function listPara(text, level, opts = {}) {
    return new Paragraph({
      numbering: {
        reference: 'policy-list',
        level,
      },
      children: [
        new TextRun(text),
      ],
      spacing: { after: 100, ...opts.spacing },
    });
  }

  const doc = new Document({
    creator: 'SuperDoc Fixtures',
    title: 'Astra Dynamics Internal Policy Manual',
    description: 'Company policy manual with nested numbered lists, headers, and footers',
    numbering: numberingConfig,
    sections: [
      {
        properties: {},
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: 'Astra Dynamics \u2014 Internal Policy Manual',
                    bold: true,
                  }),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun('Page '),
                  new PageNumberElement(),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
        children: [
          // Manual title
          new Paragraph({
            text: 'INTERNAL POLICY MANUAL',
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
          }),

          new Paragraph({
            children: [new TextRun({ text: 'Astra Dynamics', bold: true })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
          }),

          new Paragraph({
            children: [new TextRun('Effective Date: January 1, 2026')],
            alignment: AlignmentType.CENTER,
            spacing: { after: 600 },
          }),

          // Section 1 heading
          new Paragraph({
            text: 'Section 1: Code of Conduct',
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
          }),

          new Paragraph({
            children: [
              new TextRun(
                'All employees of Astra Dynamics are expected to conduct themselves with the highest standards ' +
                  'of integrity, professionalism, and respect. The following policies govern employee behavior.'
              ),
            ],
            spacing: { after: 300 },
          }),

          // Level 0: Section 1
          listPara('General Conduct', 0),

          // Level 1: 1.1
          listPara('Employees shall treat all colleagues, clients, and partners with dignity and respect.', 1),

          // Level 1: 1.2
          listPara('Discrimination, harassment, and retaliation of any kind are strictly prohibited.', 1),

          // Level 0: Section 2
          listPara('Conflicts of Interest', 0),

          // Level 1: 2.1
          listPara('Employees must disclose any actual or potential conflicts of interest to their manager.', 1),

          // Level 1: 2.2
          listPara('Employees may not engage in outside employment that conflicts with their duties at Astra Dynamics.', 1),

          // Page break before Section 2
          new Paragraph({
            children: [new PageBreak()],
          }),

          // Section 2 heading
          new Paragraph({
            text: 'Section 2: Information Security',
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
          }),

          new Paragraph({
            children: [
              new TextRun(
                'Astra Dynamics takes the security of its information assets seriously. All employees are ' +
                  'required to comply with the following information security policies.'
              ),
            ],
            spacing: { after: 300 },
          }),

          // Level 0: Section 1 (within this page context, listing continues)
          listPara('Access Control', 0),

          // Level 1: 1.1
          listPara(
            'Employees must use strong, unique passwords for all company systems and change them every 90 days.',
            1
          ),

          // Level 2: a)
          listPara('Passwords must be at least 12 characters and include uppercase, lowercase, numbers, and symbols.', 2),

          // Level 2: b)
          listPara('Multi-factor authentication is required for all cloud-based services.', 2),

          // Level 1: 1.2
          listPara(
            'Access to sensitive systems must be granted on a least-privilege basis and reviewed quarterly.',
            1
          ),

          // Level 0: Section 2
          listPara('Data Classification', 0),

          // Level 1: 2.1
          listPara('All company data must be classified as Public, Internal, Confidential, or Restricted.', 1),

          // Level 1: 2.2
          listPara(
            'Restricted data must be encrypted in transit and at rest, and access logs must be maintained.',
            1
          ),

          // Page break before Section 3
          new Paragraph({
            children: [new PageBreak()],
          }),

          // Section 3 heading
          new Paragraph({
            text: 'Section 3: Remote Work Policy',
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
          }),

          new Paragraph({
            children: [
              new TextRun(
                'Astra Dynamics supports flexible remote work arrangements. Employees working remotely must adhere ' +
                  'to the policies set forth in this section.'
              ),
            ],
            spacing: { after: 300 },
          }),

          listPara('Eligibility and Approval', 0),

          listPara(
            'Remote work arrangements must be approved by the employee\'s direct manager and HR.',
            1
          ),

          listPara(
            'Employees on a performance improvement plan are not eligible for remote work without VP approval.',
            1
          ),

          // Section 3.2 — this section should have exactly 2 subpoints (a, b)
          // The benchmark task will add more subpoints here
          listPara('Home Office Requirements', 0),

          listPara(
            'Employees working remotely must maintain a dedicated, ergonomically appropriate workspace.',
            1
          ),

          // 3.2 subsection — level 1
          listPara(
            'The following minimum equipment requirements apply to all remote work arrangements:',
            1
          ),

          // 3.2 subpoints at level 2 — benchmark will add to this list
          listPara('A reliable internet connection with minimum 25 Mbps download speed.', 2),
          listPara('A company-approved laptop or desktop computer in good working condition.', 2),

          // Closing paragraph
          new Paragraph({
            children: [
              new TextRun(
                'This policy manual is reviewed annually. Employees are responsible for staying current with ' +
                  'policy updates. Questions should be directed to the People Operations team.'
              ),
            ],
            spacing: { before: 400, after: 200 },
          }),
        ],
      },
    ],
  });

  return saveDocx(doc, 'policy-manual.docx');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Creating v2 fixture documents...\n');

  try {
    await createConsultingAgreement();
    await createPricingProposal();
    await createContractRedlines();
    await createPolicyManual();

    console.log('\nAll fixtures created successfully.');
  } catch (err) {
    console.error('\nError creating fixtures:', err);
    process.exit(1);
  }
}

main();
