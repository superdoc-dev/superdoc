import { describe, it, expect } from 'vitest';
import * as xmljs from 'xml-js';
import { serializeOpcXml } from './xml-serialization.js';

function parse(xml) {
  return xmljs.xml2js(xml, { compact: false });
}

describe('serializeOpcXml', () => {
  it('escapes & in attribute values so the output XML is well-formed', () => {
    const tree = parse('<?xml version="1.0"?><Root><A href="http://x.com/?a=1&amp;b=2"/></Root>');

    const out = serializeOpcXml(tree);

    expect(out).toContain('href="http://x.com/?a=1&amp;b=2"');
    expect(out).not.toMatch(/href="http:\/\/x\.com\/\?a=1&b=2"/);

    const parsed = new DOMParser().parseFromString(out, 'application/xml');
    expect(parsed.querySelector('parsererror')).toBeNull();
  });

  it('escapes <, >, and " in attribute values', () => {
    const tree = parse('<?xml version="1.0"?><Root><A label="&lt;tag&gt;" title="&quot;hi&quot;"/></Root>');

    const out = serializeOpcXml(tree);

    expect(out).toContain('label="&lt;tag&gt;"');
    expect(out).toContain('title="&quot;hi&quot;"');
  });

  it('preserves attribute values that contain no XML-significant characters', () => {
    const tree = parse('<?xml version="1.0"?><Root><A href="numbering.xml"/></Root>');
    expect(serializeOpcXml(tree)).toContain('href="numbering.xml"');
  });

  it('does not double-escape already-escaped sequences (single round-trip)', () => {
    // xml-js's xml2js decodes entities; serializeOpcXml re-encodes them once.
    const tree = parse('<?xml version="1.0"?><Root><A href="a&amp;b"/></Root>');
    const out = serializeOpcXml(tree);
    expect(out).toContain('href="a&amp;b"');
    expect(out).not.toContain('&amp;amp;');
  });

  it('round-trips through parse → serialize → parse without losing entities', () => {
    const original = '<?xml version="1.0"?><Root><A href="http://x.com/?a=1&amp;b=2&amp;c=3"/></Root>';
    const out = serializeOpcXml(parse(original));
    const reparsed = parse(out);
    const a = reparsed.elements[0].elements[0];
    expect(a.attributes.href).toBe('http://x.com/?a=1&b=2&c=3');
  });
});
