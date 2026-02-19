import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Editor } from '../../../shared/types';
import { AIPlanner } from '../../planner';

const actionInstances: unknown[] = [];

const createActionInstance = () => ({
  find: vi.fn().mockResolvedValue({ success: true, results: [{ position: { from: 0, to: 10 } }] }),
  findAll: vi.fn().mockResolvedValue({ success: true, results: [{ position: { from: 0, to: 10 } }] }),
  highlight: vi.fn().mockResolvedValue({ success: true, results: [{ position: { from: 0, to: 10 } }] }),
  replace: vi.fn().mockResolvedValue({ success: true, results: [{ position: { from: 0, to: 10 } }] }),
  replaceAll: vi.fn().mockResolvedValue({ success: true, results: [{ position: { from: 0, to: 10 } }] }),
  literalReplace: vi.fn().mockResolvedValue({ success: true, results: [{ position: { from: 0, to: 10 } }] }),
  insertTrackedChange: vi.fn().mockResolvedValue({ success: true, results: [{ position: { from: 0, to: 10 } }] }),
  insertTrackedChanges: vi.fn().mockResolvedValue({ success: true, results: [{ position: { from: 0, to: 10 } }] }),
  insertComment: vi.fn().mockResolvedValue({ success: true, results: [{ position: { from: 0, to: 10 } }] }),
  insertComments: vi.fn().mockResolvedValue({ success: true, results: [{ position: { from: 0, to: 10 } }] }),
  summarize: vi.fn().mockResolvedValue({ success: true, results: [{ position: { from: 0, to: 10 } }] }),
  insertContent: vi.fn().mockResolvedValue({ success: true, results: [{ position: { from: 0, to: 10 } }] }),
});

vi.mock('../../services/ai-actions-service', () => {
  const factory = vi.fn(() => {
    const instance = createActionInstance();
    actionInstances.push(instance);
    return instance;
  });
  return {
    AIActionsService: factory,
  };
});

function createMockProvider(response: string) {
  return {
    async *streamCompletion() {
      yield response;
    },
    getCompletion: vi.fn().mockResolvedValue(response),
  };
}

function createMockEditor(): Editor {
  const doc = {
    textBetween: vi.fn().mockReturnValue('Lorem ipsum dolor sit amet.'),
    textContent: 'Lorem ipsum dolor sit amet.',
    content: { size: 128 },
  };
  const selection = { from: 0, to: 0, empty: true };
  const state = { doc, selection };

  return {
    state,
    view: { state },
    getJSON: vi.fn().mockReturnValue({ type: 'doc', content: [] }),
    getSchemaSummaryJSON: vi.fn().mockResolvedValue({ nodes: [], marks: [] }),
  } as unknown as Editor;
}

describe('AIPlanner', () => {
  beforeEach(() => {
    actionInstances.length = 0;
  });

  it('executes planned tools and returns metadata', async () => {
    const provider = createMockProvider(
      JSON.stringify({
        reasoning: 'Update intro and confirm to the user.',
        steps: [
          { id: '1', tool: 'replaceAll', instruction: 'Rewrite the introduction to be concise.' },
          { id: '2', tool: 'respond', instruction: 'The introduction was updated with a concise summary.' },
        ],
      }),
    );

    const builder = new AIPlanner({
      provider,
      editor: createMockEditor(),
    });

    const result = await builder.execute('Please polish the introduction');

    expect(result.success).toBe(true);
    expect(result.executedTools).toEqual(['replaceAll', 'respond']);
    expect(result.reasoning).toContain('Update intro');
    expect(result.response).toContain('introduction');

    const latestActions = actionInstances[actionInstances.length - 1];
    expect(latestActions.replaceAll).toHaveBeenCalledWith('Rewrite the introduction to be concise.');
  });

  it('passes literal replacement args to the deterministic tool', async () => {
    const provider = createMockProvider(
      JSON.stringify({
        reasoning: 'Swap brand names literally.',
        steps: [
          {
            id: '1',
            tool: 'literalReplace',
            instruction: 'Swap company names',
            args: { find: 'A', replace: 'B', caseSensitive: true },
          },
        ],
      }),
    );

    const builder = new AIPlanner({
      provider,
      editor: createMockEditor(),
    });

    const result = await builder.execute('Update brand name references');
    expect(result.executedTools).toEqual(['literalReplace']);

    const latestActions = actionInstances[actionInstances.length - 1];
    expect(latestActions.literalReplace).toHaveBeenCalledWith('A', 'B', {
      caseSensitive: true,
      trackChanges: false,
    });
  });

  it('fails gracefully when plan has no steps', async () => {
    const provider = createMockProvider(JSON.stringify({ reasoning: 'noop', steps: [] }));
    const builder = new AIPlanner({
      provider,
      editor: createMockEditor(),
    });

    const result = await builder.execute('Do something');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/plan/i);
    expect(result.executedTools).toEqual([]);
  });

  it('records warnings for unknown tools and continues with respond', async () => {
    const provider = createMockProvider(
      JSON.stringify({
        reasoning: 'One unsupported tool plus a final response.',
        steps: [
          { id: '1', tool: 'unknownTool', instruction: 'Do something special' },
          { id: '2', tool: 'respond', instruction: 'Unable to run the requested special tool.' },
        ],
      }),
    );

    const builder = new AIPlanner({
      provider,
      editor: createMockEditor(),
    });

    const result = await builder.execute('Try a custom thing');

    expect(result.success).toBe(true);
    expect(result.executedTools).toEqual(['respond']);
    expect(result.warnings?.[0]).toContain('Unknown tool');
    expect(result.response).toContain('Unable to run');
  });
});
