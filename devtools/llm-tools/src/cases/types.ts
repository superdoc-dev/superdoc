export type CaseAssertion = {
  type: string;
  description?: string;
  [key: string]: unknown;
};

export type CaseDefinition = {
  testId: string;
  fixture: string;
  user: string;
  allowedSequences: string[][];
  assertions?: CaseAssertion[];
  metadata?: Record<string, unknown>;
};

export type CaseLoadError = {
  filePath: string;
  message: string;
  issues?: Array<{ path: string; message: string }>;
};

export type CaseLoadResult = {
  cases: CaseDefinition[];
  errors: CaseLoadError[];
};
