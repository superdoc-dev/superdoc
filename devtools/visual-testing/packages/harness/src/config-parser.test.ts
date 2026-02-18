import { describe, it, expect } from 'vitest';
import { parseConfig, buildUrl, describeConfig } from './config-parser.js';

describe('parseConfig', () => {
  it('should default layout to true', () => {
    const config = parseConfig('');
    expect(config.layout).toBe(true);
  });

  it('should disable layout when layout=0', () => {
    const config = parseConfig('?layout=0');
    expect(config.layout).toBe(false);
  });

  it('should parse toolbar modes', () => {
    expect(parseConfig('?toolbar=full').toolbar).toBe('full');
    expect(parseConfig('?toolbar=minimal').toolbar).toBe('minimal');
    expect(parseConfig('?toolbar=none').toolbar).toBe('none');
    expect(parseConfig('').toolbar).toBe('none');
  });

  it('should parse comments modes', () => {
    expect(parseConfig('?comments=on').comments).toBe('on');
    expect(parseConfig('?comments=panel').comments).toBe('panel');
    expect(parseConfig('?comments=readonly').comments).toBe('readonly');
    expect(parseConfig('?comments=off').comments).toBe('off');
    expect(parseConfig('').comments).toBe('off');
  });

  it('should parse viewport dimensions', () => {
    const config = parseConfig('?width=1200&height=800');
    expect(config.viewport.width).toBe(1200);
    expect(config.viewport.height).toBe(800);
  });

  it('should use default viewport when not specified', () => {
    const config = parseConfig('');
    expect(config.viewport.width).toBe(1600);
    expect(config.viewport.height).toBe(1200);
  });

  it('should parse hideCaret, hideSelection, and caretBlink', () => {
    // Defaults to true
    expect(parseConfig('').hideCaret).toBe(true);
    expect(parseConfig('').hideSelection).toBe(true);
    expect(parseConfig('').caretBlink).toBe(true);

    // Can be disabled
    expect(parseConfig('?hideCaret=0').hideCaret).toBe(false);
    expect(parseConfig('?hideSelection=0').hideSelection).toBe(false);
    expect(parseConfig('?caretBlink=0').caretBlink).toBe(false);
  });

  it('should parse extensions', () => {
    expect(parseConfig('?extensions=a,b,c').extensions).toEqual(['a', 'b', 'c']);
    expect(parseConfig('').extensions).toEqual([]);
  });
});

describe('buildUrl', () => {
  it('should build URL with no params for defaults', () => {
    const url = buildUrl('http://localhost:9989', {});
    expect(url).toBe('http://localhost:9989');
  });

  it('should add layout=0 only when explicitly false', () => {
    const url = buildUrl('http://localhost:9989', { layout: false });
    expect(url).toBe('http://localhost:9989?layout=0');
  });

  it('should not add layout param when true (default)', () => {
    const url = buildUrl('http://localhost:9989', { layout: true });
    expect(url).toBe('http://localhost:9989');
  });

  it('should add toolbar when not none', () => {
    const url = buildUrl('http://localhost:9989', { toolbar: 'full' });
    expect(url).toBe('http://localhost:9989?toolbar=full');
  });

  it('should add comments when not off', () => {
    const url = buildUrl('http://localhost:9989', { comments: 'panel' });
    expect(url).toBe('http://localhost:9989?comments=panel');
  });

  it('should combine multiple params', () => {
    const url = buildUrl('http://localhost:9989', {
      layout: false,
      toolbar: 'full',
      comments: 'on',
    });
    expect(url).toContain('layout=0');
    expect(url).toContain('toolbar=full');
    expect(url).toContain('comments=on');
  });
});

describe('describeConfig', () => {
  it('should return "default" for all defaults', () => {
    const config = parseConfig('');
    expect(describeConfig(config)).toBe('default');
  });

  it('should note when layout is disabled', () => {
    const config = parseConfig('?layout=0');
    expect(describeConfig(config)).toContain('no-layout');
  });

  it('should note toolbar mode', () => {
    const config = parseConfig('?toolbar=full');
    expect(describeConfig(config)).toContain('toolbar-full');
  });

  it('should note comments mode', () => {
    const config = parseConfig('?comments=panel');
    expect(describeConfig(config)).toContain('comments-panel');
  });
});
