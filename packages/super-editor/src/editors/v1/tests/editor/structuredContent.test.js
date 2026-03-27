import { loadTestDataForEditorTests, initTestEditor } from '@tests/helpers/helpers';
import { expect } from 'vitest';
import {
  getStructuredContentBlockTags,
  getStructuredContentInlineTags,
  getStructuredContentTags,
  getStructuredContentTagsById,
  getStructuredContentByGroup,
  createTagObject,
  parseTagObject,
  hasGroup,
  getGroup,
} from '@extensions/structured-content/structuredContentHelpers/index';

describe('Structured content tests', () => {
  const filename = 'blank-doc.docx';
  let docx, media, mediaFiles, fonts, editor;

  beforeAll(async () => ({ docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(filename)));
  beforeEach(() => ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts })));

  it('tests commands and helpers for structued content inline', () => {
    editor.commands.insertStructuredContentInline({
      text: 'Structured content inline 1',
      attrs: { id: '1' },
    });
    editor.commands.insertStructuredContentInline({
      json: { type: 'text', text: 'Structured content inline 2' },
      attrs: { id: '2' },
    });

    expect(getStructuredContentTags(editor.state).length).toBe(2);
    expect(getStructuredContentInlineTags(editor.state).length).toBe(2);
    expect(getStructuredContentBlockTags(editor.state).length).toBe(0);

    expect(getStructuredContentTagsById('1', editor.state).length).toBe(1);
    expect(getStructuredContentTagsById('2', editor.state).length).toBe(1);
    expect(getStructuredContentTagsById(['1', '2'], editor.state).length).toBe(2);

    const structuredContent1 = getStructuredContentTagsById('1', editor.state)[0];
    const structuredContent2 = getStructuredContentTagsById('2', editor.state)[0];

    expect(structuredContent1.node.textContent).toBe('Structured content inline 1');
    expect(structuredContent2.node.textContent).toBe('Structured content inline 2');

    editor.commands.updateStructuredContentById('1', {
      text: 'Structured content inline 1 - Updated',
      attrs: { alias: 'Updated' },
    });
    editor.commands.updateStructuredContentById('2', {
      json: { type: 'text', text: 'Structured content inline 2 - Updated' },
      attrs: { alias: 'Updated' },
    });

    const structuredContent1Updated = getStructuredContentTagsById('1', editor.state)[0];
    const structuredContent2Updated = getStructuredContentTagsById('2', editor.state)[0];

    expect(structuredContent1Updated.node.textContent).toBe('Structured content inline 1 - Updated');
    expect(structuredContent2Updated.node.textContent).toBe('Structured content inline 2 - Updated');

    expect(structuredContent1Updated.node.attrs.alias).toBe('Updated');
    expect(structuredContent2Updated.node.attrs.alias).toBe('Updated');

    editor.commands.deleteStructuredContentById(['1', '2']);

    expect(getStructuredContentTags(editor.state).length).toBe(0);
  });

  it('tests commands and helpers for structued content block', () => {
    editor.commands.insertStructuredContentBlock({
      html: '<p>Structured content block 1</p>',
      attrs: { id: '1' },
    });
    editor.commands.insertStructuredContentBlock({
      json: { type: 'paragraph', content: [{ type: 'text', text: 'Structured content block 2' }] },
      attrs: { id: '2' },
    });

    expect(getStructuredContentTags(editor.state).length).toBe(2);
    expect(getStructuredContentBlockTags(editor.state).length).toBe(2);
    expect(getStructuredContentInlineTags(editor.state).length).toBe(0);

    expect(getStructuredContentTagsById('1', editor.state).length).toBe(1);
    expect(getStructuredContentTagsById('2', editor.state).length).toBe(1);
    expect(getStructuredContentTagsById(['1', '2'], editor.state).length).toBe(2);

    const structuredContent1 = getStructuredContentTagsById('1', editor.state)[0];
    const structuredContent2 = getStructuredContentTagsById('2', editor.state)[0];

    expect(structuredContent1.node.textContent).toBe('Structured content block 1');
    expect(structuredContent2.node.textContent).toBe('Structured content block 2');

    editor.commands.updateStructuredContentById('1', {
      html: '<p>Structured content block 1 - Updated</p>',
      attrs: { alias: 'Updated' },
    });
    editor.commands.updateStructuredContentById('2', {
      json: { type: 'paragraph', content: [{ type: 'text', text: 'Structured content block 2 - Updated' }] },
      attrs: { alias: 'Updated' },
    });

    const structuredContent1Updated = getStructuredContentTagsById('1', editor.state)[0];
    const structuredContent2Updated = getStructuredContentTagsById('2', editor.state)[0];

    expect(structuredContent1Updated.node.textContent).toBe('Structured content block 1 - Updated');
    expect(structuredContent2Updated.node.textContent).toBe('Structured content block 2 - Updated');

    expect(structuredContent1Updated.node.attrs.alias).toBe('Updated');
    expect(structuredContent2Updated.node.attrs.alias).toBe('Updated');

    editor.commands.deleteStructuredContent(getStructuredContentTags(editor.state));

    expect(getStructuredContentTags(editor.state).length).toBe(0);
  });

  it('tests JSON tag utility functions', () => {
    // Test createTagObject
    const tag1 = createTagObject({ group: 'customer-info' });
    expect(tag1).toBe('{"group":"customer-info"}');

    const tag2 = createTagObject({ group: 'terms', style: 'header' });
    expect(tag2).toBe('{"group":"terms","style":"header"}');

    // Test parseTagObject
    const parsed1 = parseTagObject('{"group":"customer-info"}');
    expect(parsed1).toEqual({ group: 'customer-info' });

    const parsed2 = parseTagObject('inline_text_sdt');
    expect(parsed2).toBe(null);

    // Test hasGroup
    expect(hasGroup('{"group":"customer-info"}')).toBe(true);
    expect(hasGroup('inline_text_sdt')).toBe(false);
    expect(hasGroup('{"style":"header"}')).toBe(false);

    // Test getGroup
    expect(getGroup('{"group":"customer-info"}')).toBe('customer-info');
    expect(getGroup('inline_text_sdt')).toBe(null);
    expect(getGroup('{"style":"header"}')).toBe(null);
  });

  it('tests group-based operations for inline structured content', () => {
    // Create multiple fields with the same group
    editor.commands.insertStructuredContentInline({
      text: 'Customer Name 1',
      attrs: { group: 'customer-info', alias: 'Customer' },
    });
    editor.commands.insertStructuredContentInline({
      text: 'Customer Name 2',
      attrs: { group: 'customer-info', alias: 'Customer' },
    });
    editor.commands.insertStructuredContentInline({
      text: 'Customer Name 3',
      attrs: { group: 'customer-info', alias: 'Customer' },
    });
    editor.commands.insertStructuredContentInline({
      text: 'Invoice Number',
      attrs: { group: 'invoice-info', alias: 'Invoice' },
    });

    // Verify tags are JSON-encoded
    const allFields = getStructuredContentTags(editor.state);
    expect(allFields.length).toBe(4);
    expect(allFields[0].node.attrs.tag).toBe('{"group":"customer-info"}');
    expect(allFields[3].node.attrs.tag).toBe('{"group":"invoice-info"}');

    // Test retrieval by group
    const customerFields = getStructuredContentByGroup('customer-info', editor.state);
    const invoiceFields = getStructuredContentByGroup('invoice-info', editor.state);

    expect(customerFields.length).toBe(3);
    expect(invoiceFields.length).toBe(1);

    expect(customerFields[0].node.textContent).toBe('Customer Name 1');
    expect(customerFields[1].node.textContent).toBe('Customer Name 2');
    expect(customerFields[2].node.textContent).toBe('Customer Name 3');
    expect(invoiceFields[0].node.textContent).toBe('Invoice Number');

    // Test retrieval by multiple groups
    const multipleGroupFields = getStructuredContentByGroup(['customer-info', 'invoice-info'], editor.state);
    expect(multipleGroupFields.length).toBe(4);

    // Test update all fields by group
    editor.commands.updateStructuredContentByGroup('customer-info', {
      text: 'John Doe',
      attrs: { alias: 'Customer Updated' },
    });

    const updatedCustomerFields = getStructuredContentByGroup('customer-info', editor.state);
    expect(updatedCustomerFields.length).toBe(3);
    expect(updatedCustomerFields[0].node.textContent).toBe('John Doe');
    expect(updatedCustomerFields[1].node.textContent).toBe('John Doe');
    expect(updatedCustomerFields[2].node.textContent).toBe('John Doe');
    expect(updatedCustomerFields[0].node.attrs.alias).toBe('Customer Updated');

    // Invoice field should remain unchanged
    const unchangedInvoiceFields = getStructuredContentByGroup('invoice-info', editor.state);
    expect(unchangedInvoiceFields[0].node.textContent).toBe('Invoice Number');

    // Test delete by group
    editor.commands.deleteStructuredContentByGroup('customer-info');

    expect(getStructuredContentByGroup('customer-info', editor.state).length).toBe(0);
    expect(getStructuredContentByGroup('invoice-info', editor.state).length).toBe(1);
    expect(getStructuredContentTags(editor.state).length).toBe(1);

    // Clean up
    editor.commands.deleteStructuredContentByGroup('invoice-info');
    expect(getStructuredContentTags(editor.state).length).toBe(0);
  });

  it('tests group-based operations for block structured content', () => {
    // Create multiple blocks with the same group
    editor.commands.insertStructuredContentBlock({
      html: '<p>Terms Section 1</p>',
      attrs: { group: 'terms', alias: 'Terms' },
    });
    editor.commands.insertStructuredContentBlock({
      html: '<p>Terms Section 2</p>',
      attrs: { group: 'terms', alias: 'Terms' },
    });
    editor.commands.insertStructuredContentBlock({
      html: '<p>Privacy Policy</p>',
      attrs: { group: 'privacy', alias: 'Privacy' },
    });

    // Test retrieval by group
    const termsBlocks = getStructuredContentByGroup('terms', editor.state);
    const privacyBlocks = getStructuredContentByGroup('privacy', editor.state);

    expect(termsBlocks.length).toBe(2);
    expect(privacyBlocks.length).toBe(1);

    // Test update all blocks by group
    editor.commands.updateStructuredContentByGroup('terms', {
      html: '<p>Updated Terms Content</p>',
      attrs: { alias: 'Terms Updated' },
    });

    const updatedTermsBlocks = getStructuredContentByGroup('terms', editor.state);
    expect(updatedTermsBlocks.length).toBe(2);
    expect(updatedTermsBlocks[0].node.textContent).toBe('Updated Terms Content');
    expect(updatedTermsBlocks[1].node.textContent).toBe('Updated Terms Content');
    expect(updatedTermsBlocks[0].node.attrs.alias).toBe('Terms Updated');

    // Test delete multiple groups at once
    editor.commands.deleteStructuredContentByGroup(['terms', 'privacy']);
    expect(getStructuredContentTags(editor.state).length).toBe(0);
  });

  it('tests group operations with mixed inline and block content', () => {
    // Create mixed content with same group
    editor.commands.insertStructuredContentInline({
      text: 'Inline Header',
      attrs: { group: 'header' },
    });
    editor.commands.insertStructuredContentBlock({
      html: '<p>Block Header</p>',
      attrs: { group: 'header' },
    });
    editor.commands.insertStructuredContentInline({
      text: 'Another Inline Header',
      attrs: { group: 'header' },
    });

    // Should find all types with the same group
    const headerFields = getStructuredContentByGroup('header', editor.state);
    expect(headerFields.length).toBe(3);

    // Update all by group
    editor.commands.updateStructuredContentByGroup('header', {
      attrs: { alias: 'Header Updated' },
    });

    const updatedHeaders = getStructuredContentByGroup('header', editor.state);
    expect(updatedHeaders[0].node.attrs.alias).toBe('Header Updated');
    expect(updatedHeaders[1].node.attrs.alias).toBe('Header Updated');
    expect(updatedHeaders[2].node.attrs.alias).toBe('Header Updated');

    // Delete all by group
    editor.commands.deleteStructuredContentByGroup('header');
    expect(getStructuredContentTags(editor.state).length).toBe(0);
  });

  it('tests group operations with non-existent groups', () => {
    // Try to get non-existent group
    const nonExistent = getStructuredContentByGroup('non-existent', editor.state);
    expect(nonExistent.length).toBe(0);

    // Try to update non-existent group (should not throw error)
    expect(() => {
      editor.commands.updateStructuredContentByGroup('non-existent', { text: 'Test' });
    }).not.toThrow();

    // Try to delete non-existent group (should not throw error)
    expect(() => {
      editor.commands.deleteStructuredContentByGroup('non-existent');
    }).not.toThrow();
  });
});
