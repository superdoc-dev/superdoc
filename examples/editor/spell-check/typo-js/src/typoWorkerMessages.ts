export type TypoWorkerIssue = {
  segmentId: string;
  start: number;
  end: number;
  kind: 'spelling';
  message: string;
  replacements: string[];
};

export type TypoWorkerPayload = {
  segments: { id: string; text: string }[];
  maxSuggestions: number;
};

export type TypoWorkerRequest = {
  id: number;
  type: 'check';
  payload: TypoWorkerPayload;
};

/** Tells the worker to stop work for a timed-out or aborted check (id matches the check request). */
export type TypoWorkerCancelMessage = {
  type: 'cancel';
  id: number;
};

export type TypoWorkerIncomingMessage = TypoWorkerRequest | TypoWorkerCancelMessage;

type TypoWorkerResultMessage = {
  id: number;
  type: 'result';
  issues: TypoWorkerIssue[];
};

type TypoWorkerErrorMessage = {
  id: number;
  type: 'error';
  error: string;
};

export type TypoWorkerResponse = TypoWorkerResultMessage | TypoWorkerErrorMessage;
