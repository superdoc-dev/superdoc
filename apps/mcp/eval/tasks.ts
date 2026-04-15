/**
 * Eval task definitions — real-world document tasks with scoring criteria.
 */

export interface Task {
  id: string;
  name: string;
  prompt: string;
  fixture: string;
  expect: {
    containsText?: string[];
    excludesText?: string[];
    minComments?: number;
    minTrackedChanges?: number;
    maxToolCalls?: number;
  };
}

const FIXTURES = '../../../evals/fixtures';

export const tasks: Task[] = [
  {
    id: 'simple-replace',
    name: 'Find and replace text',
    prompt:
      'In this NDA, find every occurrence of "Iqidis Corp" and replace it with "Nova Industries". Save the result.',
    fixture: `${FIXTURES}/nda.docx`,
    expect: {
      containsText: ['Nova Industries'],
      excludesText: ['Iqidis Corp'],
      maxToolCalls: 8,
    },
  },
  {
    id: 'add-comments',
    name: 'Review and comment on contract',
    prompt:
      "Review this lease agreement from the tenant's perspective. Add comments on any clauses that seem unfavorable or unclear to the tenant. Save the result.",
    fixture: `${FIXTURES}/lease-agreement.docx`,
    expect: {
      minComments: 3,
      maxToolCalls: 8,
    },
  },
  {
    id: 'redline',
    name: 'Redline contract with tracked changes',
    prompt:
      'Redline this NDA: suggest changing the confidentiality period to 5 years, and increase the liability cap to $1,000,000. Use tracked changes. Save.',
    fixture: `${FIXTURES}/nda.docx`,
    expect: {
      minTrackedChanges: 1,
      maxToolCalls: 8,
    },
  },
  {
    id: 'create-doc',
    name: 'Create document from scratch',
    prompt:
      'Create a 1-page project status report with: a title, executive summary (2 sentences), 3 bullet points of progress, and a next steps section. Save it.',
    fixture: '',
    expect: {
      containsText: ['progress', 'next'],
      maxToolCalls: 6,
    },
  },
  {
    id: 'read-summarize',
    name: 'Read and extract information',
    prompt:
      'Read this employment offer and tell me: (1) the company name, (2) the position title, (3) the salary amount, (4) the start date.',
    fixture: `${FIXTURES}/employment-offer.docx`,
    expect: {
      maxToolCalls: 4,
    },
  },
  {
    id: 'format-text',
    name: 'Find and format text',
    prompt: 'In this memorandum, find all dollar amounts and make them bold. Save the result.',
    fixture: `${FIXTURES}/memorandum.docx`,
    expect: {
      maxToolCalls: 8,
    },
  },
];
