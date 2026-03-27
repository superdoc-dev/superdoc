// Minimal vitest reporter that logs each file as it starts.
// Usage: --reporter=./scripts/ci-file-reporter.js
export default class CIFileReporter {
  onTestFileStart(test) {
    const name = test?.moduleId || test?.filepath || test?.name || 'unknown';
    console.log(`[CI] >>> Starting: ${name}`);
  }

  onTestFileResult(test) {
    const name = test?.moduleId || test?.filepath || test?.name || 'unknown';
    console.log(`[CI] <<< Finished: ${name}`);
  }
}
