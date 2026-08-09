import type { ReactNode } from 'react';

type CalloutVariant = 'info' | 'success' | 'warning' | 'error';

type CalloutProps = {
  children: ReactNode;
  title?: string;
  variant?: CalloutVariant;
};

const labels: Record<CalloutVariant, string> = {
  info: 'Note',
  success: 'Success',
  warning: 'Important',
  error: 'Error',
};

export function Callout({ children, title, variant = 'info' }: CalloutProps) {
  return (
    <aside
      className='sd-callout'
      data-variant={variant}
      aria-label={title ? `${labels[variant]}: ${title}` : labels[variant]}
    >
      <span className='sd-callout-marker' aria-hidden='true' />
      <div className='sd-callout-content'>
        {title ? <p className='sd-callout-title'>{title}</p> : null}
        <div className='sd-callout-description'>{children}</div>
      </div>
    </aside>
  );
}
