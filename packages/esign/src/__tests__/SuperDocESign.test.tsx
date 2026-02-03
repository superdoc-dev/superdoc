import React, { createRef } from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import SuperDocESign from '../index';
import type {
  FieldComponentProps,
  SuperDocESignHandle,
  SuperDocESignProps,
  AuditEvent,
} from '../types';

import { SuperDoc } from 'superdoc';
import { getAuditEventTypes, resetAuditEvents } from '../test/setup';

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
type SuperDocMockType = typeof SuperDoc & {
  mockUpdateStructuredContentById: MockFn;
  mockGetStructuredContentTags: MockFn;
  mockDestroy: MockFn;
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
  superDocMock.mockDestroy.mockReset();
  resetAuditEvents();
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
              id: 'sig-1',
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
            id: 'sig-field',
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
      id: 'sig-field',
      value: 'John Doe',
    });

    const lastState = onStateChange.mock.calls.at(-1)?.[0];
    expect(lastState?.fields.get('sig-field')).toBe('John Doe');

    expect(superDocMock.mockUpdateStructuredContentById).toHaveBeenCalledWith(
      'sig-field',
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
              id: 'sig-field',
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
    expect(stateBeforeReset?.fields.get('sig-field')).toBe('Audit User');

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

    const CustomField: React.FC<FieldComponentProps> = ({ onChange, label }) => (
      <div>
        <span>{label}</span>
        <button type="button" onClick={() => onChange('custom-value')}>
          Set Custom Value
        </button>
      </div>
    );
    const SubmitButton: React.FC<{
      onClick: () => void;
      isDisabled: boolean;
      isValid: boolean;
      isSubmitting: boolean;
    }> = ({ onClick, isDisabled, isValid }) => (
      <button type="button" onClick={onClick} disabled={isDisabled || !isValid}>
        Send It
      </button>
    );

    const DownloadButton: React.FC<{
      onClick: () => void;
      fileName?: string;
      isDisabled: boolean;
    }> = ({ onClick, isDisabled }) => (
      <button type="button" onClick={onClick} disabled={isDisabled}>
        Grab Copy
      </button>
    );

    renderComponent({
      onSubmit,
      onDownload,
      fields: {
        signer: [
          {
            id: 'custom-field',
            type: 'text',
            label: 'Custom Field',
            component: CustomField,
            validation: { required: true },
          },
        ],
      },
      submit: {
        component: SubmitButton as unknown as React.ComponentType<any>,
      },
      download: {
        component: DownloadButton as unknown as React.ComponentType<any>,
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
        signer: [{ id: 'custom-field', value: 'custom-value' }],
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
            id: 'doc-field',
            value: 'Document Value',
          },
        ],
        signer: [
          {
            id: 'sig-field',
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

    expect(submitData.documentFields).toEqual([{ id: 'doc-field', value: 'Document Value' }]);

    expect(submitData.signerFields).toEqual([{ id: 'sig-field', value: 'Payload User' }]);

    const auditTypes = submitData.auditTrail.map((event: AuditEvent) => event.type);
    expect(auditTypes).to.include.members(['ready', 'field_change']);
    expect(auditTypes).to.include('submit');
  });
});
