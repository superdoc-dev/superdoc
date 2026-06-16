import { describe, expect, test } from 'bun:test';
import { CliError } from '../../lib/errors';
import { parseOperationArgs } from '../../lib/operation-args';

describe('parseOperationArgs target validation', () => {
  test('rejects legacy text-address target-json payloads for paragraph format operations', () => {
    expect(() =>
      parseOperationArgs('doc.format.paragraph.setMarkRunProps', [
        '--target-json',
        '{"kind":"text","blockId":"p1","range":{"start":0,"end":4}}',
        '--mark-run-props-json',
        '{"bold":true}',
      ]),
    ).toThrow(CliError);
  });

  test('still accepts legacy text-address target-json payloads for inline format operations', () => {
    expect(() =>
      parseOperationArgs('doc.format.apply', [
        '--target-json',
        '{"kind":"text","blockId":"p1","range":{"start":0,"end":4}}',
        '--inline-json',
        '{"bold":true}',
      ]),
    ).not.toThrow();
  });
});
