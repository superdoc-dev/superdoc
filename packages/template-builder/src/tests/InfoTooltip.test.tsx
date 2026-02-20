import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { InfoTooltip } from '../defaults/InfoTooltip';

afterEach(cleanup);

describe('InfoTooltip', () => {
  it('renders the "?" icon', () => {
    render(<InfoTooltip text='Help text' />);
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('shows tooltip text on mouseEnter', () => {
    render(<InfoTooltip text='Help text here' />);
    const icon = screen.getByText('?').closest('span')!;
    fireEvent.mouseEnter(icon);
    expect(screen.getByText('Help text here')).toBeInTheDocument();
  });

  it('hides tooltip on mouseLeave', () => {
    render(<InfoTooltip text='Help text here' />);
    const icon = screen.getByText('?').closest('span')!;
    fireEvent.mouseEnter(icon);
    expect(screen.getByText('Help text here')).toBeInTheDocument();
    fireEvent.mouseLeave(icon);
    expect(screen.queryByText('Help text here')).toBeNull();
  });

  it('stops propagation on click', () => {
    const parentHandler = vi.fn();
    render(
      <div onClick={parentHandler}>
        <InfoTooltip text='Help' />
      </div>,
    );
    const icon = screen.getByText('?').closest('span')!;
    fireEvent.click(icon);
    expect(parentHandler).not.toHaveBeenCalled();
  });
});
