const path = require('node:path');
const { promises: fs } = require('node:fs');

require('tsx/cjs');

const { loadCases } = require('../src/cases/loader.ts');
const { loadToolSnapshot } = require('../src/tools/snapshot.ts');
const { getRunner } = require('../src/runners/index.ts');

const {
  isRecord,
  cloneJson,
  defaultModelForRunner,
  readOptionalNumber,
  getToolCallSequence,
  getErrorMessages,
  getFinalAssistantMessage,
  deriveFindContentExpectation,
} = require('./trace-utils.cjs');

/**
 * Promptfoo custom provider that runs LLM tool-use evaluation cases against
 * configurable model runners and returns structured trace output.
 *
 * @example
 * ```yaml
 * # promptfooconfig.yaml
 * providers:
 *   - id: file://providers/llm-trace-provider.cjs
 *     config:
 *       runner: openai-sdk
 *       model: gpt-5
 * ```
 */
class LlmTraceProvider {
  constructor(options = {}) {
    this.options = options;
    this.config = isRecord(options.config) ? options.config : {};
    this.rootDir = process.cwd();

    this.caseMapPromise = null;
    this.toolSnapshotPromise = null;
    this.fixtureCache = new Map();
  }

  id() {
    if (typeof this.config.label === 'string' && this.config.label.trim().length > 0) {
      return `llm-tools:${this.config.label.trim()}`;
    }

    const runner = this.resolveRunnerName({});
    const model = this.resolveModel({}, runner);
    return `llm-tools:${runner}:${model}`;
  }

  async getCaseMap() {
    if (!this.caseMapPromise) {
      this.caseMapPromise = (async () => {
        const casesDir = path.join(this.rootDir, 'cases');
        const { cases, errors } = await loadCases(casesDir);
        if (errors.length > 0) {
          throw new Error(
            `Case validation failed: ${errors
              .map((entry) => `${entry.filePath}: ${entry.message}`)
              .join(' | ')}`,
          );
        }

        return new Map(cases.map((caseDef) => [caseDef.testId, caseDef]));
      })();
    }

    return this.caseMapPromise;
  }

  async getToolSnapshot() {
    if (!this.toolSnapshotPromise) {
      this.toolSnapshotPromise = loadToolSnapshot(this.rootDir);
    }

    return this.toolSnapshotPromise;
  }

  async getFixtureState(fixtureName) {
    if (!this.fixtureCache.has(fixtureName)) {
      const fixturePath = path.join(this.rootDir, 'fixtures', 'docs', fixtureName);
      try {
        const raw = await fs.readFile(fixturePath, 'utf8');
        this.fixtureCache.set(fixtureName, JSON.parse(raw));
      } catch (err) {
        throw new Error(
          `Failed to load fixture "${fixtureName}": ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return cloneJson(this.fixtureCache.get(fixtureName));
  }

  resolveRunnerName(vars) {
    if (typeof this.config.runner === 'string' && this.config.runner.trim().length > 0) {
      return this.config.runner.trim();
    }

    if (typeof vars.runner === 'string' && vars.runner.trim().length > 0) {
      return vars.runner.trim();
    }

    return 'openai-sdk';
  }

  resolveModel(vars, runnerName) {
    if (typeof this.config.model === 'string' && this.config.model.trim().length > 0) {
      return this.config.model.trim();
    }

    if (typeof vars.model === 'string' && vars.model.trim().length > 0) {
      return vars.model.trim();
    }

    return defaultModelForRunner(runnerName);
  }

  resolveNumericOption(vars, optionName) {
    const fromConfig = readOptionalNumber(this.config[optionName]);
    if (fromConfig !== undefined) {
      return fromConfig;
    }

    return readOptionalNumber(vars[optionName]);
  }

  async callApi(prompt, context = {}) {
    try {
      const vars = isRecord(context.vars) ? context.vars : {};
      const testId =
        typeof vars.test_id === 'string' && vars.test_id.trim().length > 0
          ? vars.test_id.trim()
          : String(prompt ?? '').trim();

      if (testId.length === 0) {
        return {
          error: 'Missing test case ID. Set `vars.test_id` in promptfoo tests.',
        };
      }

      const runnerName = this.resolveRunnerName(vars);
      const runner = getRunner(runnerName);
      if (!runner) {
        return {
          error: `Unknown runner "${runnerName}".`,
        };
      }

      const caseMap = await this.getCaseMap();
      const caseDef = caseMap.get(testId);
      if (!caseDef) {
        return {
          error: `Unknown case testId "${testId}".`,
        };
      }

      const model = this.resolveModel(vars, runnerName);
      const temperature = this.resolveNumericOption(vars, 'temperature');
      const maxSteps = this.resolveNumericOption(vars, 'maxSteps');
      const timeoutMs = this.resolveNumericOption(vars, 'timeoutMs');
      const maxToolCallsPerStep = this.resolveNumericOption(vars, 'maxToolCallsPerStep');

      const [state, toolSnapshot] = await Promise.all([
        this.getFixtureState(caseDef.fixture),
        this.getToolSnapshot(),
      ]);

      const trace = await runner.runCase(
        {
          caseDef,
          state,
          toolSnapshot,
        },
        {
          model,
          temperature,
          maxSteps,
          timeoutMs,
          maxToolCallsPerStep,
        },
      );

      return {
        output: {
          testId,
          prompt: String(prompt ?? ''),
          runner: trace.runner ?? runnerName,
          model: trace.model ?? model,
          finalAssistant: getFinalAssistantMessage(trace),
          toolCallSequence: getToolCallSequence(trace),
          errorMessages: getErrorMessages(trace),
          trace,
          caseDefinition: {
            fixture: caseDef.fixture,
            user: caseDef.user,
            allowedSequences: caseDef.allowedSequences,
          },
          expectations: {
            findContent: deriveFindContentExpectation(caseDef, runnerName),
          },
        },
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

module.exports = LlmTraceProvider;
