import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import SuperDocTemplateBuilder from '../index';
import type { SuperDocTemplateBuilderHandle } from '../types';

const insertStructuredContentInlineMock = vi.fn(() => true);
const insertStructuredContentBlockMock = vi.fn(() => true);

vi.mock('superdoc', () => {
  class MockSuperDoc {
    activeEditor: any;
    superdocStore: any;

    constructor(options: { onReady?: () => void }) {
      this.activeEditor = {
        state: {
          selection: { from: 0, to: 0 },
          doc: { textBetween: () => '' },
        },
        view: {
          coordsAtPos: () => ({ left: 0, top: 0, bottom: 0 }),
          dispatch: vi.fn(),
        },
        commands: {
          insertStructuredContentInline: insertStructuredContentInlineMock,
          insertStructuredContentBlock: insertStructuredContentBlockMock,
        },
        helpers: {
          structuredContentCommands: {
            getStructuredContentTags: () => [],
          },
        },
        on: vi.fn(),
      };

      this.superdocStore = {
        documents: [{ getPresentationEditor: () => ({ coordsAtPos: () => ({ left: 0, top: 0, bottom: 0 }) }) }],
      };

      queueMicrotask(() => options.onReady?.());
    }

    destroy() {}

    setDocumentMode() {}
  }

  return { SuperDoc: MockSuperDoc };
});

const renderBuilder = async () => {
  const ref = createRef<SuperDocTemplateBuilderHandle>();
  const onReady = vi.fn();

  render(
    <SuperDocTemplateBuilder ref={ref} document={{ mode: 'editing' }} fields={{ available: [] }} onReady={onReady} />,
  );

  await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(ref.current).not.toBeNull());

  return ref;
};

describe('SuperDocTemplateBuilder presetContent insertion', () => {
  beforeEach(() => {
    insertStructuredContentInlineMock.mockClear();
    insertStructuredContentBlockMock.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('passes presetContent.html to block insert command', async () => {
    const ref = await renderBuilder();
    let result = false;

    await act(async () => {
      result = ref.current!.insertBlockField({
        alias: 'Sample Table',
        presetContent: { html: '<table><tr><th>Date</th></tr></table>' },
      });
    });

    expect(result).toBe(true);
    expect(insertStructuredContentBlockMock).toHaveBeenCalledTimes(1);
    expect(insertStructuredContentBlockMock).toHaveBeenCalledWith(
      expect.objectContaining({
        html: '<table><tr><th>Date</th></tr></table>',
      }),
    );
    const firstBlockCallArg = (insertStructuredContentBlockMock as any).mock.calls[0]?.[0];
    expect(firstBlockCallArg).toBeDefined();
    expect(firstBlockCallArg).not.toHaveProperty('text');
  });

  it('passes presetContent.json to block insert command', async () => {
    const ref = await renderBuilder();
    const json = { type: 'paragraph', content: [{ type: 'text', text: 'Preset block' }] };
    let result = false;

    await act(async () => {
      result = ref.current!.insertBlockField({
        alias: 'Preset Block',
        presetContent: { json },
      });
    });

    expect(result).toBe(true);
    expect(insertStructuredContentBlockMock).toHaveBeenCalledTimes(1);
    expect(insertStructuredContentBlockMock).toHaveBeenCalledWith(
      expect.objectContaining({
        json,
      }),
    );
    const firstBlockCallArg = (insertStructuredContentBlockMock as any).mock.calls[0]?.[0];
    expect(firstBlockCallArg).toBeDefined();
    expect(firstBlockCallArg).not.toHaveProperty('text');
  });

  it('keeps text fallback for block fields without presetContent', async () => {
    const ref = await renderBuilder();
    let result = false;

    await act(async () => {
      result = ref.current!.insertBlockField({
        alias: 'Signature',
        defaultValue: 'Default signature content',
      });
    });

    expect(result).toBe(true);
    expect(insertStructuredContentBlockMock).toHaveBeenCalledTimes(1);
    expect(insertStructuredContentBlockMock).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Default signature content',
      }),
    );
  });

  it('ignores presetContent for inline insertion', async () => {
    const ref = await renderBuilder();
    let result = false;

    await act(async () => {
      result = ref.current!.insertField({
        alias: 'Inline Name',
        defaultValue: 'Alice',
        presetContent: { html: '<ul><li>Ignored</li></ul>' },
      });
    });

    expect(result).toBe(true);
    expect(insertStructuredContentInlineMock).toHaveBeenCalledTimes(1);
    expect(insertStructuredContentInlineMock).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Alice',
      }),
    );
    expect(insertStructuredContentBlockMock).not.toHaveBeenCalled();
  });
});
