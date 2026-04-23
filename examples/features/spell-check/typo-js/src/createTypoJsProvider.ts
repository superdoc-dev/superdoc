import type { TypoWorkerCancelMessage, TypoWorkerIssue, TypoWorkerRequest, TypoWorkerResponse } from './typoWorkerMessages';

type PendingRequest = {
  resolve: (value: { issues: TypoWorkerIssue[] }) => void;
  reject: (error: unknown) => void;
  cleanup: () => void;
};

function createAbortError(): DOMException | Error {
  try {
    return new DOMException('The operation was aborted.', 'AbortError');
  } catch {
    const error = new Error('The operation was aborted.');
    error.name = 'AbortError';
    return error;
  }
}

export async function createTypoJsProvider() {
  // Run Typo.js work inside a dedicated worker to avoid UI stalls.
  const worker = new Worker(new URL('./typoWorker.ts', import.meta.url), { type: 'module' });
  const pending = new Map<number, PendingRequest>();
  let nextRequestId = 0;

  const handleMessage = (event: MessageEvent<TypoWorkerResponse>) => {
    const message = event.data;
    const entry = pending.get(message.id);
    if (!entry) return;

    pending.delete(message.id);
    entry.cleanup();

    if (message.type === 'result') {
      entry.resolve({ issues: message.issues });
    } else {
      entry.reject(new Error(message.error));
    }
  };

  const handleError = (event: ErrorEvent) => {
    const error = new Error(event.message || 'Typo worker crashed');

    for (const [, entry] of pending) {
      entry.cleanup();
      entry.reject(error);
    }

    pending.clear();
  };

  worker.addEventListener('message', handleMessage);
  worker.addEventListener('error', handleError);

  return {
    id: 'typo-js',

    getCapabilities() {
      return {
        issueKinds: ['spelling' as const],
        supportsSuggestions: true,
        requiresNetwork: false,
      };
    },

    async check(request: {
      segments: { id: string; text: string }[];
      maxSuggestions?: number;
      signal?: AbortSignal;
    }) {
      if (request.signal?.aborted) {
        throw createAbortError();
      }

      return new Promise<{ issues: TypoWorkerIssue[] }>((resolve, reject) => {
        const requestId = ++nextRequestId;
        const maxSuggestions = request.maxSuggestions ?? 5;

        const cleanup = () => {
          request.signal?.removeEventListener('abort', onAbort);
        };

        const onAbort = () => {
          pending.delete(requestId);
          cleanup();
          const cancel: TypoWorkerCancelMessage = { type: 'cancel', id: requestId };
          worker.postMessage(cancel);
          reject(createAbortError());
        };

        pending.set(requestId, {
          resolve,
          reject,
          cleanup,
        });

        request.signal?.addEventListener('abort', onAbort);

        const payload: TypoWorkerRequest = {
          id: requestId,
          type: 'check',
          payload: {
            segments: request.segments,
            maxSuggestions,
          },
        };

        worker.postMessage(payload);
      });
    },

    dispose() {
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
      worker.terminate();

      for (const [, entry] of pending) {
        entry.cleanup();
        entry.reject(new Error('Typo.js provider disposed'));
      }

      pending.clear();
    },
  };
}
