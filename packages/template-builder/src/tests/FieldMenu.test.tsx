import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { FieldMenu } from '../defaults/FieldMenu';
import type { FieldDefinition, TemplateField } from '../types';

afterEach(cleanup);

const defaultProps = {
  isVisible: true,
  availableFields: [
    { id: 'name', label: 'Full Name', mode: 'inline' as const },
    { id: 'sig', label: 'Signature', mode: 'block' as const, fieldType: 'signer' },
  ] satisfies FieldDefinition[],
  onSelect: vi.fn(),
  onClose: vi.fn(),
};

describe('FieldMenu', () => {
  it('returns null when isVisible is false', () => {
    const { container } = render(<FieldMenu {...defaultProps} isVisible={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders when isVisible is true', () => {
    render(<FieldMenu {...defaultProps} />);
    expect(screen.getByText(/Available Fields/)).toBeInTheDocument();
  });

  it('shows Available Fields section with field count', () => {
    render(<FieldMenu {...defaultProps} />);
    expect(screen.getByText(/Available Fields \(2\)/)).toBeInTheDocument();
  });

  it('shows Existing Fields section when existingFields provided', () => {
    const existingFields: TemplateField[] = [{ id: 'e1', alias: 'Existing One', mode: 'inline' }];
    render(<FieldMenu {...defaultProps} existingFields={existingFields} />);
    expect(screen.getByText(/Existing Fields \(1\)/)).toBeInTheDocument();
  });

  it('shows fieldType badge on available fields', () => {
    render(<FieldMenu {...defaultProps} />);
    expect(screen.getByText('signer')).toBeInTheDocument();
  });

  it('shows fieldType badge on existing fields', () => {
    const existingFields: TemplateField[] = [{ id: 'e1', alias: 'Signer Field', fieldType: 'signer' }];
    render(<FieldMenu {...defaultProps} existingFields={existingFields} />);
    const signerBadges = screen.getAllByText('signer');
    expect(signerBadges.length).toBeGreaterThanOrEqual(1);
  });

  it('shows "+ Create New Field" when allowCreate is true', () => {
    render(<FieldMenu {...defaultProps} allowCreate={true} />);
    expect(screen.getByText('+ Create New Field')).toBeInTheDocument();
  });

  it('hides create button when allowCreate is false', () => {
    render(<FieldMenu {...defaultProps} allowCreate={false} />);
    expect(screen.queryByText('+ Create New Field')).toBeNull();
  });

  it('shows Owner/Signer radio buttons after clicking Create New Field, Owner default', () => {
    render(<FieldMenu {...defaultProps} allowCreate={true} />);
    fireEvent.click(screen.getByText('+ Create New Field'));

    const ownerRadio = screen.getByDisplayValue('owner') as HTMLInputElement;
    const signerRadio = screen.getByDisplayValue('signer') as HTMLInputElement;
    expect(ownerRadio.checked).toBe(true);
    expect(signerRadio.checked).toBe(false);
  });

  it('calls onSelect when clicking an available field', () => {
    const onSelect = vi.fn();
    render(<FieldMenu {...defaultProps} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Full Name'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'name', label: 'Full Name' }));
  });

  it('calls onSelectExisting when clicking an existing field', () => {
    const onSelectExisting = vi.fn();
    const existingFields: TemplateField[] = [{ id: 'e1', alias: 'Existing One' }];
    render(<FieldMenu {...defaultProps} existingFields={existingFields} onSelectExisting={onSelectExisting} />);
    fireEvent.click(screen.getByText('Existing One'));
    expect(onSelectExisting).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1', alias: 'Existing One' }));
  });

  it('calls onClose when clicking Close', () => {
    const onClose = vi.fn();
    render(<FieldMenu {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows filter query text', () => {
    render(<FieldMenu {...defaultProps} filterQuery='sig' />);
    expect(screen.getByText('sig')).toBeInTheDocument();
    expect(screen.getByText(/Filtering results for/)).toBeInTheDocument();
  });
});
