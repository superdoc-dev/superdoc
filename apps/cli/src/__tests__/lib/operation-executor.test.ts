import { describe, expect, test } from 'bun:test';
import { CliError } from '../../lib/errors';
import { executeOperation } from '../../lib/operation-executor';

function emptyContext() {
  return {} as Parameters<typeof executeOperation>[0]['context'];
}

describe('executeOperation validation error codes', () => {
  test('keeps generated SDK wrapper validation for trackChanges.decide as VALIDATION_ERROR', async () => {
    try {
      await executeOperation({
        mode: 'wrapper',
        operationId: 'doc.trackChanges.decide',
        commandName: 'track-changes decide',
        tokens: ['--decision', 'maybe', '--target-json', '{"kind":"all"}'],
        context: emptyContext(),
      });
      throw new Error('Expected executeOperation to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).code).toBe('VALIDATION_ERROR');
    }
  });

  test('maps generated SDK wrapper validation for insert changeMode to INVALID_INPUT', async () => {
    try {
      await executeOperation({
        mode: 'wrapper',
        operationId: 'doc.insert',
        commandName: 'insert',
        tokens: ['--value', 'text', '--change-mode', 'banana'],
        context: emptyContext(),
      });
      throw new Error('Expected executeOperation to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).code).toBe('INVALID_INPUT');
    }
  });

  test('maps call validation for images.setSize to COMMAND_FAILED', async () => {
    try {
      await executeOperation({
        mode: 'call',
        operationId: 'doc.images.setSize',
        input: {
          sessionId: 'session-1',
          imageId: 'image-1',
          size: {},
        },
        context: emptyContext(),
      });
      throw new Error('Expected executeOperation to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).code).toBe('COMMAND_FAILED');
    }
  });

  test('maps call validation for images.setZOrder to COMMAND_FAILED', async () => {
    try {
      await executeOperation({
        mode: 'call',
        operationId: 'doc.images.setZOrder',
        input: {
          sessionId: 'session-1',
          imageId: 'image-1',
          zOrder: {},
        },
        context: emptyContext(),
      });
      throw new Error('Expected executeOperation to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).code).toBe('COMMAND_FAILED');
    }
  });

  test('keeps call validation for create.image as INVALID_INPUT', async () => {
    try {
      await executeOperation({
        mode: 'call',
        operationId: 'doc.create.image',
        input: {
          doc: '/tmp/test.docx',
          src: 42,
        },
        context: emptyContext(),
      });
      throw new Error('Expected executeOperation to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).code).toBe('INVALID_INPUT');
    }
  });

  test('keeps ordinary wrapper validation as VALIDATION_ERROR', async () => {
    try {
      await executeOperation({
        mode: 'wrapper',
        operationId: 'doc.replace',
        commandName: 'replace',
        tokens: ['--text', 'new text', '--target-json', '{"bad":true}'],
        context: emptyContext(),
      });
      throw new Error('Expected executeOperation to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).code).toBe('VALIDATION_ERROR');
    }
  });
});
