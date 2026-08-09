import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

export function baseOptions(): BaseLayoutProps {
  return {
    links: [
      {
        text: 'Get started',
        url: '/start/what-superdoc-does',
        active: 'nested-url',
      },
      {
        text: 'Editor',
        url: '/editor',
        active: 'nested-url',
      },
      {
        text: 'Agents & automation',
        url: '/agents/overview',
        active: 'nested-url',
      },
      {
        text: 'Document API',
        url: '/document-api/mental-model',
        active: 'nested-url',
      },
      {
        text: 'Resources',
        url: '/resources/security',
        active: 'nested-url',
      },
    ],
    nav: {
      title: <span className='sd-sidebar-title'>Documentation</span>,
      url: '/',
      transparentMode: 'none',
    },
  };
}
