'use client';

import type { ReactNode } from 'react';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';

const runtimes = ['Browser', 'Headless'] as const;
const storageKey = 'superdoc-docs-runtime';

type Runtime = (typeof runtimes)[number];

type RuntimeExampleTabsProps = {
  children: ReactNode;
};

type RuntimeExampleProps = {
  children: ReactNode;
  runtime: Runtime;
};

export function RuntimeExampleTabs({ children }: RuntimeExampleTabsProps) {
  return (
    <Tabs className='sd-runtime-tabs' items={[...runtimes]} groupId={storageKey} persist>
      {children}
    </Tabs>
  );
}

export function RuntimeExample({ children, runtime }: RuntimeExampleProps) {
  return <Tab value={runtime}>{children}</Tab>;
}
