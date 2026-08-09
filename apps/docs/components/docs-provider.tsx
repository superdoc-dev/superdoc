'use client';

import type { ReactNode } from 'react';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { DocsSearchDialog } from '@/components/docs-search-dialog';

export function DocsProvider({ children }: { children: ReactNode }) {
  return <RootProvider search={{ SearchDialog: DocsSearchDialog }}>{children}</RootProvider>;
}
