import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { FieldList } from '../defaults/FieldList';
import type { TemplateField } from '../types';

afterEach(cleanup);

const baseProps = {
  fields: [] as TemplateField[],
  onSelect: vi.fn(),
  onDelete: vi.fn(),
};

describe('FieldList', () => {
  it('renders field count in header', () => {
    const fields: TemplateField[] = [
      { id: '1', alias: 'Name' },
      { id: '2', alias: 'Email' },
    ];
    render(<FieldList {...baseProps} fields={fields} />);
    expect(screen.getByText('Template Fields (2)')).toBeInTheDocument();
  });

  it('shows empty state message when no fields', () => {
    render(<FieldList {...baseProps} />);
    expect(screen.getByText(/No fields yet/)).toBeInTheDocument();
  });

  it('renders each field with alias', () => {
    const fields: TemplateField[] = [
      { id: '1', alias: 'Name' },
      { id: '2', alias: 'Email' },
    ];
    render(<FieldList {...baseProps} fields={fields} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
  });

  it('shows mode badge', () => {
    const fields: TemplateField[] = [
      { id: '1', alias: 'Name', mode: 'inline' },
      { id: '2', alias: 'Sig', mode: 'block' },
    ];
    render(<FieldList {...baseProps} fields={fields} />);
    expect(screen.getByText('inline')).toBeInTheDocument();
    expect(screen.getByText('block')).toBeInTheDocument();
  });

  it('shows fieldType badge for signer fields', () => {
    const fields: TemplateField[] = [{ id: '1', alias: 'Signer Field', fieldType: 'signer' }];
    render(<FieldList {...baseProps} fields={fields} />);
    expect(screen.getByText('signer')).toBeInTheDocument();
  });

  it('shows fieldType badge for owner fields', () => {
    const fields: TemplateField[] = [{ id: '1', alias: 'Owner Field', fieldType: 'owner' }];
    render(<FieldList {...baseProps} fields={fields} />);
    expect(screen.getByText('owner')).toBeInTheDocument();
  });

  it('calls onSelect when clicking a field', () => {
    const onSelect = vi.fn();
    const fields: TemplateField[] = [{ id: '1', alias: 'Name' }];
    render(<FieldList {...baseProps} fields={fields} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Name'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: '1', alias: 'Name' }));
  });

  it('calls onDelete when clicking delete button', () => {
    const onDelete = vi.fn();
    const fields: TemplateField[] = [{ id: '1', alias: 'Name' }];
    render(<FieldList {...baseProps} fields={fields} onDelete={onDelete} />);
    fireEvent.click(screen.getByTitle('Delete field'));
    expect(onDelete).toHaveBeenCalledWith('1');
  });

  it('highlights selected field with different background', () => {
    const fields: TemplateField[] = [
      { id: '1', alias: 'Name' },
      { id: '2', alias: 'Email' },
    ];
    render(<FieldList {...baseProps} fields={fields} selectedFieldId='1' />);
    // The FieldItem container with title="Name" has the background style
    const nameItem = screen.getByTitle('Name');
    expect(nameItem.getAttribute('style')).toContain('rgb(239, 246, 255)');
  });

  it('groups fields by group ID with expandable sections', () => {
    const fields: TemplateField[] = [
      { id: '1', alias: 'Name', group: 'grp-abc-123456' },
      { id: '2', alias: 'Name', group: 'grp-abc-123456' },
      { id: '3', alias: 'Solo' },
    ];
    render(<FieldList {...baseProps} fields={fields} />);
    // Group header shows first field alias and count
    expect(screen.getByText(/2 fields/)).toBeInTheDocument();
    // Solo field is rendered directly
    expect(screen.getByText('Solo')).toBeInTheDocument();
  });
});
