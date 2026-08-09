'use client';

import type { ReactNode } from 'react';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';

const versions = ['V2', 'V1'] as const;

type Version = (typeof versions)[number];

export function MigrationExampleTabs({ children }: { children: ReactNode }) {
  return (
    <Tabs className='sd-runtime-tabs' items={[...versions]} groupId='superdoc-migration-version' persist>
      {children}
    </Tabs>
  );
}

type MigrationExampleProps = {
  children: ReactNode;
  version: Version;
  test?: 'headless' | 'node' | 'browser' | 'compile';
  testCase?: string;
};

export function MigrationExample({ children, version }: MigrationExampleProps) {
  return <Tab value={version}>{children}</Tab>;
}
