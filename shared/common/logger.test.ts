import { describe, it, expect, beforeEach } from 'bun:test';
import { createLogger, configureLogging, consoleSink, getGlobalLogLevel, type LogEntry } from './logger.js';

function capture() {
  const entries: LogEntry[] = [];
  const sink = (e: LogEntry) => entries.push(e);
  return { entries, sink };
}

describe('createLogger', () => {
  beforeEach(() => {
    // Reset global config to a known state between tests.
    configureLogging({ level: 'warn', sink: consoleSink });
  });

  it('prefixes output with the namespace', () => {
    const { entries, sink } = capture();
    const log = createLogger('super-converter', { level: 'debug', sink });
    log.warn('hi', 1);
    expect(entries).toHaveLength(1);
    expect(entries[0].prefix).toBe('[super-converter]');
    expect(entries[0].namespace).toBe('super-converter');
    expect(entries[0].args).toEqual(['hi', 1]);
    expect(entries[0].level).toBe('warn');
  });

  it('gates messages below the threshold', () => {
    const { entries, sink } = capture();
    const log = createLogger('x', { level: 'warn', sink });
    log.debug('hidden');
    log.info('hidden');
    log.warn('shown');
    log.error('shown');
    expect(entries.map((e) => e.level)).toEqual(['warn', 'error']);
  });

  it('silent level drops everything', () => {
    const { entries, sink } = capture();
    const log = createLogger('x', { level: 'silent', sink });
    log.error('nope');
    log.warn('nope');
    expect(entries).toHaveLength(0);
  });

  it('setLevel changes the threshold at runtime', () => {
    const { entries, sink } = capture();
    const log = createLogger('x', { level: 'warn', sink });
    log.debug('first');
    expect(entries).toHaveLength(0);
    log.setLevel('debug');
    log.debug('second');
    expect(entries).toHaveLength(1);
  });

  it('child() composes namespaces and inherits config', () => {
    const { entries, sink } = capture();
    const parent = createLogger('super-converter', { level: 'debug', sink });
    const child = parent.child('lists');
    child.info('nested');
    expect(entries[0].namespace).toBe('super-converter:lists');
    expect(entries[0].prefix).toBe('[super-converter:lists]');
  });

  it('falls back to the global level when none is pinned', () => {
    const { entries, sink } = capture();
    const log = createLogger('x', { sink });
    log.info('hidden at warn');
    expect(entries).toHaveLength(0);
    configureLogging({ level: 'debug' });
    log.info('shown at debug');
    expect(entries).toHaveLength(1);
  });

  it('routes to the global sink when no per-logger sink is set', () => {
    const { entries, sink } = capture();
    configureLogging({ level: 'debug', sink });
    const log = createLogger('x');
    log.debug('via global sink');
    expect(entries).toHaveLength(1);
    expect(entries[0].namespace).toBe('x');
  });

  it('omits the prefix for an empty namespace', () => {
    const { entries, sink } = capture();
    const log = createLogger('', { level: 'debug', sink });
    log.warn('no prefix');
    expect(entries[0].prefix).toBe('');
  });

  it('exposes the default global level', () => {
    expect(getGlobalLogLevel()).toBe('warn');
  });
});
