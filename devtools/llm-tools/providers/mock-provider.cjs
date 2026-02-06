/**
 * Promptfoo provider that returns a deterministic mock response.
 * Used for testing the eval pipeline without making real LLM calls.
 */
class MockProvider {
  constructor(options = {}) {
    this.options = options;
  }

  id() {
    return 'superdoc-mock-provider';
  }

  async callApi(prompt) {
    return {
      output: `MOCK_RESPONSE: ${String(prompt)}`,
    };
  }
}

module.exports = MockProvider;
