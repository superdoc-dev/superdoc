import { describe, it, expect } from 'bun:test';
import { createCliDomEnvironment } from './dom-environment';

describe('createCliDomEnvironment', () => {
  it('returns a document that supports createElement', () => {
    const env = createCliDomEnvironment();
    try {
      const div = env.document.createElement('div');
      expect(div.tagName).toBe('DIV');
    } finally {
      env.dispose();
    }
  });

  it('supports innerHTML round-trip', () => {
    const env = createCliDomEnvironment();
    try {
      const div = env.document.createElement('div');
      div.innerHTML = '<p>hello <strong>world</strong></p>';
      expect(div.innerHTML).toContain('<p>');
      expect(div.innerHTML).toContain('<strong>world</strong>');
    } finally {
      env.dispose();
    }
  });

  it('exposes DOMParser via document.defaultView', () => {
    const env = createCliDomEnvironment();
    try {
      const DOMParser = env.document.defaultView?.DOMParser;
      expect(DOMParser).toBeDefined();

      const parser = new DOMParser!();
      const parsed = parser.parseFromString('<p>test</p>', 'text/html');
      expect(parsed.body.innerHTML).toContain('test');
    } finally {
      env.dispose();
    }
  });

  it('supports element.dataset access', () => {
    const env = createCliDomEnvironment();
    try {
      const div = env.document.createElement('div');
      div.dataset.testKey = 'value';
      expect(div.dataset.testKey).toBe('value');
    } finally {
      env.dispose();
    }
  });

  it('dispose does not throw', () => {
    const env = createCliDomEnvironment();
    expect(() => env.dispose()).not.toThrow();
  });

  it('dispose can be called multiple times safely', () => {
    const env = createCliDomEnvironment();
    env.dispose();
    expect(() => env.dispose()).not.toThrow();
  });
});
