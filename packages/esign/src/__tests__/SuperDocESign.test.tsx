import { createRef } from 'react';
import type { FC, ComponentType } from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import SuperDocESign from '../index';
import type { FieldComponentProps, SuperDocESignHandle, SuperDocESignProps, AuditEvent } from '../types';

import { SuperDoc } from 'superdoc';
import {
  getAuditEventTypes,
  resetAuditEvents,
  getLastConstructorOptions,
  resetLastConstructorOptions,
} from '../test/setup';

const scrollListeners = new WeakMap<HTMLElement, EventListener>();
const originalAddEventListener = HTMLElement.prototype.addEventListener;

beforeAll(() => {
  HTMLElement.prototype.addEventListener = function (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) {
    if (type === 'scroll' && typeof listener === 'function') {
      scrollListeners.set(this as HTMLElement, listener);
    }
    return originalAddEventListener.call(this, type, listener, options);
  };
});

afterAll(() => {
  HTMLElement.prototype.addEventListener = originalAddEventListener;
});

type ScrollMetrics = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
};

const configureScrollElement = (element: HTMLElement, initial: ScrollMetrics) => {
  const metrics: ScrollMetrics = { ...initial };

  Object.defineProperties(element, {
    scrollTop: {
      configurable: true,
      get: () => metrics.scrollTop,
      set: (value: number) => {
        metrics.scrollTop = value;
      },
    },
    scrollHeight: {
      configurable: true,
      get: () => metrics.scrollHeight,
      set: (value: number) => {
        metrics.scrollHeight = value;
      },
    },
    clientHeight: {
      configurable: true,
      get: () => metrics.clientHeight,
      set: (value: number) => {
        metrics.clientHeight = value;
      },
    },
  });

  const dispatch = () => {
    const listener = scrollListeners.get(element);
    if (listener) {
      listener.call(element, new Event('scroll'));
    }
  };

  const update = (partial: Partial<ScrollMetrics>, shouldDispatch = true) => {
    if (partial.scrollTop !== undefined) metrics.scrollTop = partial.scrollTop;
    if (partial.scrollHeight !== undefined) metrics.scrollHeight = partial.scrollHeight;
    if (partial.clientHeight !== undefined) metrics.clientHeight = partial.clientHeight;
    if (shouldDispatch) dispatch();
  };

  return { update, dispatch, metrics };
};

type MockFn = ReturnType<typeof vi.fn>;
type MockEditor = {
  commands: Record<string, MockFn>;
  helpers: { structuredContentCommands: Record<string, MockFn> };
  state: Record<string, unknown>;
  view: { dispatch: MockFn };
};
type SuperDocMockType = typeof SuperDoc & {
  mockUpdateStructuredContentById: MockFn;
  mockGetStructuredContentTags: MockFn;
  mockAppendRowsToStructuredContentTable: MockFn;
  mockGetStructuredContentTablesById: MockFn;
  mockDestroy: MockFn;
  mockEditor: MockEditor;
};

const superDocMock = SuperDoc as unknown as SuperDocMockType;

const baseDocument: SuperDocESignProps['document'] = {
  source: '<p>Test Document</p>',
  mode: 'full',
  validation: {
    scroll: {
      required: false,
    },
  },
};

const renderComponent = (
  props: Partial<SuperDocESignProps> = {},
  options: { ref?: React.RefObject<SuperDocESignHandle | null> } = {},
) => {
  const { document: customDocument, ...restProps } = props;

  const mergedProps: SuperDocESignProps = {
    eventId: 'evt_test',
    fields: {},
    onSubmit: vi.fn(),
    ...restProps,
    document: {
      ...baseDocument,
      ...(customDocument || {}),
    },
  } as SuperDocESignProps;

  return render(<SuperDocESign ref={options.ref} {...mergedProps} />);
};

const waitForSuperDocReady = async () => {
  await waitFor(() => {
    expect(superDocMock.mockGetStructuredContentTags).toHaveBeenCalled();
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  superDocMock.mockGetStructuredContentTags.mockReset();
  superDocMock.mockGetStructuredContentTags.mockReturnValue([]);
  superDocMock.mockUpdateStructuredContentById.mockReset();
  superDocMock.mockAppendRowsToStructuredContentTable.mockReset();
  superDocMock.mockGetStructuredContentTablesById.mockReset();
  superDocMock.mockGetStructuredContentTablesById.mockReturnValue([]);
  superDocMock.mockDestroy.mockReset();
  resetAuditEvents();
  resetLastConstructorOptions();
});

describe('SuperDocESign component', () => {
  it('renders with minimum required props', async () => {
    renderComponent();

    await waitForSuperDocReady();

    expect(screen.getByTestId('superdoc-esign-document')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument();
  });

  it('requires scroll completion before enabling submit when validation is enforced', async () => {
    const onSubmit = vi.fn();
    const ref = createRef<SuperDocESignHandle>();

    const { getByPlaceholderText, getByRole, getByTestId } = renderComponent(
      {
        onSubmit,
        document: {
          source: '<p>Scroll document</p>',
          mode: 'full',
          validation: { scroll: { required: true } },
        },
        fields: {
          signer: [
            {
              id: '1',
              type: 'signature',
              label: 'Signature',
              validation: { required: true },
            },
          ],
        },
      },
      { ref },
    );

    const scrollContainer = getByTestId('superdoc-scroll-container');
    const scrollController = configureScrollElement(scrollContainer, {
      scrollHeight: 200,
      clientHeight: 100,
      scrollTop: 0,
    });

    await waitForSuperDocReady();

    const submitButton = getByRole('button', { name: /submit/i });
    const input = getByPlaceholderText('Type your full name');
    fireEvent.change(input, { target: { value: 'Jane Doe' } });

    await waitFor(() => expect(submitButton).toBeDisabled());

    act(() => {
      scrollController.update({
        scrollHeight: 1000,
        clientHeight: 100,
        scrollTop: 950,
      });
    });

    await waitFor(() => {
      const state = ref.current?.getState();
      expect(state?.scrolled).toBe(true);
      expect(state?.isValid).toBe(true);
    });

    const updatedSubmitButton = getByRole('button', { name: /submit/i });
    await userEvent.click(updatedSubmitButton);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  it('invokes field and state change callbacks and updates SuperDoc document', async () => {
    const onFieldChange = vi.fn();
    const onStateChange = vi.fn();

    const { getByPlaceholderText } = renderComponent({
      onFieldChange,
      onStateChange,
      fields: {
        signer: [
          {
            id: '2',
            type: 'signature',
            label: 'Signature',
            validation: { required: true },
          },
        ],
      },
    });

    await waitForSuperDocReady();

    const input = getByPlaceholderText('Type your full name');
    fireEvent.change(input, { target: { value: 'John Doe' } });

    await waitFor(() => {
      expect(onFieldChange).toHaveBeenCalled();
      expect(onStateChange).toHaveBeenCalled();
    });

    const lastFieldChange = onFieldChange.mock.calls.at(-1)?.[0];
    expect(lastFieldChange).toMatchObject({
      id: '2',
      value: 'John Doe',
    });

    const lastState = onStateChange.mock.calls.at(-1)?.[0];
    expect(lastState?.fields.get('2')).toBe('John Doe');

    expect(superDocMock.mockUpdateStructuredContentById).toHaveBeenCalledWith(
      '2',
      expect.objectContaining({
        json: expect.objectContaining({
          attrs: expect.objectContaining({ src: expect.any(String) }),
        }),
      }),
    );
  });

  it('tracks audit trail and exposes ref methods', async () => {
    const ref = createRef<SuperDocESignHandle>();

    const { getByPlaceholderText, getByRole, getByTestId } = renderComponent(
      {
        document: {
          source: '<p>Scroll doc</p>',
          mode: 'full',
          validation: { scroll: { required: true } },
        },
        fields: {
          signer: [
            {
              id: '2',
              type: 'signature',
              label: 'Signature',
              validation: { required: true },
            },
          ],
        },
      },
      { ref },
    );

    await waitForSuperDocReady();
    await waitFor(() => expect(ref.current).toBeTruthy());

    const scrollContainer = getByTestId('superdoc-scroll-container');
    const scrollController = configureScrollElement(scrollContainer, {
      scrollHeight: 300,
      clientHeight: 100,
      scrollTop: 0,
    });

    const input = getByPlaceholderText('Type your full name');
    fireEvent.change(input, { target: { value: 'Audit User' } });

    act(() => {
      scrollController.update({ scrollTop: 250 });
    });

    const submitButton = getByRole('button', { name: /submit/i });
    await waitFor(() => expect(submitButton).not.toBeDisabled(), {
      timeout: 2000,
    });
    await userEvent.click(submitButton);

    await waitFor(() => {
      const auditTrail = ref.current?.getAuditTrail() ?? [];
      expect(auditTrail.length).toBeGreaterThanOrEqual(4);
    });

    const auditTrail = ref.current?.getAuditTrail() ?? [];
    const types = auditTrail.map((event) => event.type);
    expect(types[0]).toBe('ready');
    expect(types).to.include('field_change');
    expect(types.filter((type) => type === 'scroll').length).toBeGreaterThanOrEqual(1);
    expect(types).to.include('submit');

    auditTrail.forEach((event: AuditEvent) => {
      expect(typeof event.timestamp).toBe('string');
      expect(Number.isNaN(new Date(event.timestamp).getTime())).toBe(false);
    });

    const stateBeforeReset = ref.current?.getState();
    expect(stateBeforeReset).toMatchObject({
      scrolled: true,
      isValid: true,
      isSubmitting: false,
    });
    expect(stateBeforeReset?.fields.get('2')).toBe('Audit User');

    act(() => {
      ref.current?.reset();
    });

    const stateAfterReset = ref.current?.getState();
    expect(stateAfterReset).toMatchObject({
      scrolled: false,
      isValid: false,
    });
    expect(stateAfterReset?.fields.size).toBe(0);
    expect(ref.current?.getAuditTrail()).toEqual([]);
  });

  it('prefers custom components when provided', async () => {
    const onSubmit = vi.fn();
    const onDownload = vi.fn();

    const CustomField: FC<FieldComponentProps> = ({ onChange, label }) => (
      <div>
        <span>{label}</span>
        <button type='button' onClick={() => onChange('custom-value')}>
          Set Custom Value
        </button>
      </div>
    );
    const SubmitButton: FC<{
      onClick: () => void;
      isDisabled: boolean;
      isValid: boolean;
      isSubmitting: boolean;
    }> = ({ onClick, isDisabled, isValid }) => (
      <button type='button' onClick={onClick} disabled={isDisabled || !isValid}>
        Send It
      </button>
    );

    const DownloadButton: FC<{
      onClick: () => void;
      fileName?: string;
      isDisabled: boolean;
    }> = ({ onClick, isDisabled }) => (
      <button type='button' onClick={onClick} disabled={isDisabled}>
        Grab Copy
      </button>
    );

    renderComponent({
      onSubmit,
      onDownload,
      fields: {
        signer: [
          {
            id: '3',
            type: 'text',
            label: 'Custom Field',
            component: CustomField,
            validation: { required: true },
          },
        ],
      },
      submit: {
        component: SubmitButton as unknown as ComponentType<any>,
      },
      download: {
        component: DownloadButton as unknown as ComponentType<any>,
      },
    });

    await waitFor(() => expect(superDocMock).toHaveBeenCalled());
    await waitForSuperDocReady();

    expect(screen.getByText('Custom Field')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Type your full name')).not.toBeInTheDocument();

    await userEvent.click(screen.getByText('Set Custom Value'));

    const submitButton = screen.getByRole('button', { name: 'Send It' });
    await waitFor(() => expect(submitButton).not.toBeDisabled());
    await userEvent.click(submitButton);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    const downloadButton = screen.getByRole('button', { name: 'Grab Copy' });
    expect(downloadButton).toBeEnabled();
    await userEvent.click(downloadButton);
    await waitFor(() => expect(onDownload).toHaveBeenCalledTimes(1));

    const downloadPayload = onDownload.mock.calls.at(0)?.[0];
    expect(downloadPayload).toMatchObject({
      eventId: 'evt_test',
      fields: {
        signer: [{ id: '3', value: 'custom-value' }],
      },
      fileName: 'document.pdf',
    });
  });

  it('generates submit payload with expected structure and audit trail', async () => {
    const onSubmit = vi.fn();

    const { getByPlaceholderText, getByRole, getByTestId } = renderComponent({
      onSubmit,
      document: {
        source: '<p>Full payload doc</p>',
        mode: 'full',
        validation: { scroll: { required: true } },
      },
      fields: {
        document: [
          {
            id: '4',
            value: 'Document Value',
          },
        ],
        signer: [
          {
            id: '2',
            type: 'signature',
            label: 'Signature',
            validation: { required: true },
          },
        ],
      },
    });

    const scrollContainer = getByTestId('superdoc-scroll-container');
    const scrollController = configureScrollElement(scrollContainer, {
      scrollHeight: 400,
      clientHeight: 100,
      scrollTop: 0,
    });

    await waitForSuperDocReady();

    fireEvent.change(getByPlaceholderText('Type your full name'), {
      target: { value: 'Payload User' },
    });

    act(() => {
      scrollController.update({ scrollTop: 390 });
    });

    const submitButton = getByRole('button', { name: /submit/i });
    await waitFor(() => expect(submitButton).not.toBeDisabled());
    await userEvent.click(submitButton);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    await waitFor(() => {
      const types = getAuditEventTypes();
      expect(types).to.include('submit');
    });

    const submitData = onSubmit.mock.calls[0][0];
    expect(submitData.eventId).toBe('evt_test');
    expect(typeof submitData.timestamp).toBe('string');
    expect(Number.isNaN(new Date(submitData.timestamp).getTime())).toBe(false);
    expect(typeof submitData.duration).toBe('number');
    expect(submitData.isFullyCompleted).toBe(true);

    expect(submitData.documentFields).toEqual([{ id: '4', value: 'Document Value' }]);

    expect(submitData.signerFields).toEqual([{ id: '2', value: 'Payload User' }]);

    const auditTypes = submitData.auditTrail.map((event: AuditEvent) => event.type);
    expect(auditTypes).to.include.members(['ready', 'field_change']);
    expect(auditTypes).to.include('submit');
  });

  describe('table field support', () => {
    const mockTableTag = (id: string) => ({
      node: {
        attrs: { id },
        type: { name: 'structuredContentBlock' },
        textContent: '',
      },
    });

    it('calls appendRowsToStructuredContentTable for table type fields on initial load', async () => {
      // Mock structured content tags to include the table field
      superDocMock.mockGetStructuredContentTags.mockReturnValue([mockTableTag('table-1')]);

      // Mock table exists in document (required for append to be called)
      const mockTableNode = { childCount: 1, child: () => ({ nodeSize: 10 }) };
      superDocMock.mockGetStructuredContentTablesById.mockReturnValue([{ node: mockTableNode, pos: 100 }]);

      renderComponent({
        fields: {
          document: [
            {
              id: 'table-1',
              type: 'table',
              value: [['Row 1 Cell 1'], ['Row 2 Cell 1']],
            },
          ],
        },
      });

      await waitForSuperDocReady();

      await waitFor(() => {
        expect(superDocMock.mockAppendRowsToStructuredContentTable).toHaveBeenCalledWith({
          id: 'table-1',
          rows: [['Row 1 Cell 1'], ['Row 2 Cell 1']],
          copyRowStyle: true,
        });
      });
    });

    it('does not call appendRowsToStructuredContentTable for non-table fields', async () => {
      // Mock structured content tags to include the text field
      superDocMock.mockGetStructuredContentTags.mockReturnValue([mockTableTag('text-1')]);

      renderComponent({
        fields: {
          document: [
            {
              id: 'text-1',
              value: 'Simple text value',
            },
          ],
        },
      });

      await waitForSuperDocReady();

      await waitFor(() => {
        expect(superDocMock.mockUpdateStructuredContentById).toHaveBeenCalledWith('text-1', {
          text: 'Simple text value',
        });
      });

      expect(superDocMock.mockAppendRowsToStructuredContentTable).not.toHaveBeenCalled();
    });

    it('updates table field via ref.updateFieldInDocument', async () => {
      const ref = createRef<SuperDocESignHandle>();

      superDocMock.mockGetStructuredContentTags.mockReturnValue([mockTableTag('table-2')]);

      // Mock table exists in document (required for append to be called)
      const mockTableNode = { childCount: 1, child: () => ({ nodeSize: 10 }) };
      superDocMock.mockGetStructuredContentTablesById.mockReturnValue([{ node: mockTableNode, pos: 100 }]);

      renderComponent(
        {
          fields: {
            document: [
              {
                id: 'table-2',
                type: 'table',
                value: [['Initial']],
              },
            ],
          },
        },
        { ref },
      );

      await waitForSuperDocReady();
      await waitFor(() => expect(ref.current).toBeTruthy());

      // Clear the mock to check the update call
      superDocMock.mockAppendRowsToStructuredContentTable.mockClear();

      act(() => {
        ref.current?.updateFieldInDocument({
          id: 'table-2',
          type: 'table',
          value: [['Updated Row 1'], ['Updated Row 2'], ['Updated Row 3']],
        });
      });

      expect(superDocMock.mockAppendRowsToStructuredContentTable).toHaveBeenCalledWith({
        id: 'table-2',
        rows: [['Updated Row 1'], ['Updated Row 2'], ['Updated Row 3']],
        copyRowStyle: true,
      });
    });

    it('deletes existing rows (except row 0) before appending new ones', async () => {
      const ref = createRef<SuperDocESignHandle>();

      superDocMock.mockGetStructuredContentTags.mockReturnValue([mockTableTag('table-delete')]);

      // Mock a table with 3 existing rows (row 0 = header/template, rows 1-2 = data)
      const mockTableNode = {
        childCount: 3,
        child: () => ({ nodeSize: 10 }), // Each row has size 10
      };

      superDocMock.mockGetStructuredContentTablesById.mockReturnValue([{ node: mockTableNode, pos: 100 }]);

      // Mock the transaction
      const mockMapping = { map: (pos: number) => pos };
      const mockTr = {
        mapping: mockMapping,
        delete: vi.fn().mockReturnThis(),
      };

      // Get access to the mock editor to set up state.tr
      const mockEditor = superDocMock.mockEditor;
      mockEditor.state = { tr: mockTr };
      mockEditor.view.dispatch = vi.fn();

      renderComponent(
        {
          fields: {
            document: [
              {
                id: 'table-delete',
                type: 'table',
                value: [['Initial']],
              },
            ],
          },
        },
        { ref },
      );

      await waitForSuperDocReady();
      await waitFor(() => expect(ref.current).toBeTruthy());

      // Clear mocks before the update
      mockTr.delete.mockClear();
      mockEditor.view.dispatch.mockClear();
      superDocMock.mockAppendRowsToStructuredContentTable.mockClear();

      act(() => {
        ref.current?.updateFieldInDocument({
          id: 'table-delete',
          type: 'table',
          value: [['New Row 1'], ['New Row 2']],
        });
      });

      // Should delete rows 2 and 1 (keeping row 0 as header/template)
      expect(mockTr.delete).toHaveBeenCalledTimes(2);

      // Should dispatch the transaction once
      expect(mockEditor.view.dispatch).toHaveBeenCalledTimes(1);
      expect(mockEditor.view.dispatch).toHaveBeenCalledWith(mockTr);

      // Should append new rows after row 0 with copyRowStyle
      expect(superDocMock.mockAppendRowsToStructuredContentTable).toHaveBeenCalledWith({
        id: 'table-delete',
        rows: [['New Row 1'], ['New Row 2']],
        copyRowStyle: true,
      });
    });

    it('includes table fields in submit payload', async () => {
      const onSubmit = vi.fn();

      superDocMock.mockGetStructuredContentTags.mockReturnValue([mockTableTag('table-3'), mockTableTag('text-field')]);

      const { getByRole } = renderComponent({
        onSubmit,
        fields: {
          document: [
            {
              id: 'table-3',
              type: 'table',
              value: [['Table Value 1'], ['Table Value 2']],
            },
            {
              id: 'text-field',
              value: 'Text Value',
            },
          ],
        },
      });

      await waitForSuperDocReady();

      const submitButton = getByRole('button', { name: /submit/i });
      await userEvent.click(submitButton);

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

      const submitData = onSubmit.mock.calls[0][0];
      expect(submitData.documentFields).toEqual([
        { id: 'table-3', type: 'table', value: [['Table Value 1'], ['Table Value 2']] },
        { id: 'text-field', value: 'Text Value' },
      ]);
    });
  });

  describe('viewOptions configuration', () => {
    it('passes viewOptions directly to SuperDoc when provided', async () => {
      renderComponent({
        document: {
          source: '<p>Test</p>',
          viewOptions: { layout: 'web' },
        },
      });

      await waitForSuperDocReady();

      const options = getLastConstructorOptions();
      expect(options.viewOptions).toEqual({ layout: 'web' });
    });

    it('translates layoutMode "responsive" to viewOptions layout "web"', async () => {
      renderComponent({
        document: {
          source: '<p>Test</p>',
          layoutMode: 'responsive',
        },
      });

      await waitForSuperDocReady();

      const options = getLastConstructorOptions();
      expect(options.viewOptions).toEqual({ layout: 'web' });
    });

    it('translates layoutMode "paginated" to viewOptions layout "print"', async () => {
      renderComponent({
        document: {
          source: '<p>Test</p>',
          layoutMode: 'paginated',
        },
      });

      await waitForSuperDocReady();

      const options = getLastConstructorOptions();
      expect(options.viewOptions).toEqual({ layout: 'print' });
    });

    it('defaults to viewOptions layout "print" when neither viewOptions nor layoutMode is specified', async () => {
      renderComponent({
        document: {
          source: '<p>Test</p>',
        },
      });

      await waitForSuperDocReady();

      const options = getLastConstructorOptions();
      expect(options.viewOptions).toEqual({ layout: 'print' });
    });

    it('prefers viewOptions over deprecated layoutMode when both are provided', async () => {
      renderComponent({
        document: {
          source: '<p>Test</p>',
          viewOptions: { layout: 'print' },
          layoutMode: 'responsive',
        },
      });

      await waitForSuperDocReady();

      const options = getLastConstructorOptions();
      expect(options.viewOptions).toEqual({ layout: 'print' });
    });

    it('falls back to layoutMode when viewOptions is empty object', async () => {
      renderComponent({
        document: {
          source: '<p>Test</p>',
          viewOptions: {},
          layoutMode: 'responsive',
        },
      });

      await waitForSuperDocReady();

      const options = getLastConstructorOptions();
      expect(options.viewOptions).toEqual({ layout: 'web' });
    });
  });
});
