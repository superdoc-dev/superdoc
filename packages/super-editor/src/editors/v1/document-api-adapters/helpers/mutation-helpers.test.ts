import { DocumentApiAdapterError } from '../errors.js';
import {
  requireEditorCommand,
  requireSchemaMark,
  ensureTrackedCapability,
  rejectTrackedMode,
} from './mutation-helpers.js';

function makeEditor(overrides: Record<string, unknown> = {}): any {
  return {
    commands: {},
    schema: { marks: {} },
    options: {},
    ...overrides,
  };
}

describe('requireEditorCommand', () => {
  it('returns the command when present', () => {
    const command = () => true;
    expect(requireEditorCommand(command, 'test')).toBe(command);
  });

  it('throws CAPABILITY_UNAVAILABLE with reason: missing_command when absent', () => {
    expect(() => requireEditorCommand(undefined, 'test.op')).toThrow(DocumentApiAdapterError);
    try {
      requireEditorCommand(undefined, 'test.op');
    } catch (error) {
      const err = error as DocumentApiAdapterError;
      expect(err.code).toBe('CAPABILITY_UNAVAILABLE');
      expect(err.details).toEqual({ reason: 'missing_command' });
      expect(err.message).toContain('test.op');
    }
  });
});

describe('requireSchemaMark', () => {
  it('returns the mark type when present', () => {
    const boldMark = { name: 'bold' };
    const editor = makeEditor({ schema: { marks: { bold: boldMark } } });
    expect(requireSchemaMark(editor, 'bold', 'format.bold')).toBe(boldMark);
  });

  it('throws CAPABILITY_UNAVAILABLE with reason: missing_mark when absent', () => {
    const editor = makeEditor();
    expect(() => requireSchemaMark(editor, 'bold', 'format.bold')).toThrow(DocumentApiAdapterError);
    try {
      requireSchemaMark(editor, 'bold', 'format.bold');
    } catch (error) {
      const err = error as DocumentApiAdapterError;
      expect(err.code).toBe('CAPABILITY_UNAVAILABLE');
      expect(err.details).toEqual({ reason: 'missing_mark', markName: 'bold' });
    }
  });
});

describe('ensureTrackedCapability', () => {
  it('does not throw when all prerequisites are met', () => {
    const editor = makeEditor({
      commands: { insertTrackedChange: () => true },
      schema: { marks: { trackFormat: {} } },
      options: { user: { name: 'test' } },
    });
    expect(() => ensureTrackedCapability(editor, { operation: 'test', requireMarks: ['trackFormat'] })).not.toThrow();
  });

  it('throws with reason: missing_command when insertTrackedChange is missing', () => {
    const editor = makeEditor({ options: { user: { name: 'test' } } });
    try {
      ensureTrackedCapability(editor, { operation: 'test.op' });
      throw new Error('expected throw');
    } catch (error) {
      const err = error as DocumentApiAdapterError;
      expect(err.code).toBe('CAPABILITY_UNAVAILABLE');
      expect(err.details).toEqual({ reason: 'missing_command' });
    }
  });

  it('throws with reason: missing_mark when a required mark is missing', () => {
    const editor = makeEditor({
      commands: { insertTrackedChange: () => true },
      options: { user: { name: 'test' } },
    });
    try {
      ensureTrackedCapability(editor, { operation: 'test.op', requireMarks: ['trackFormat'] });
      throw new Error('expected throw');
    } catch (error) {
      const err = error as DocumentApiAdapterError;
      expect(err.code).toBe('CAPABILITY_UNAVAILABLE');
      expect(err.details).toEqual({ reason: 'missing_mark', markName: 'trackFormat' });
    }
  });

  it('throws with reason: missing_user when user is not configured', () => {
    const editor = makeEditor({
      commands: { insertTrackedChange: () => true },
    });
    try {
      ensureTrackedCapability(editor, { operation: 'test.op' });
      throw new Error('expected throw');
    } catch (error) {
      const err = error as DocumentApiAdapterError;
      expect(err.code).toBe('CAPABILITY_UNAVAILABLE');
      expect(err.details).toEqual({ reason: 'missing_user' });
    }
  });
});

describe('rejectTrackedMode', () => {
  it('does not throw for direct mode', () => {
    expect(() => rejectTrackedMode('test.op', { changeMode: 'direct' })).not.toThrow();
  });

  it('does not throw when options are undefined', () => {
    expect(() => rejectTrackedMode('test.op')).not.toThrow();
  });

  it('throws CAPABILITY_UNAVAILABLE for tracked mode', () => {
    try {
      rejectTrackedMode('test.op', { changeMode: 'tracked' });
      throw new Error('expected throw');
    } catch (error) {
      const err = error as DocumentApiAdapterError;
      expect(err.code).toBe('CAPABILITY_UNAVAILABLE');
      expect(err.details).toEqual({ reason: 'tracked_mode_unsupported' });
    }
  });
});
