import type { ReactNode } from 'react';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { DocsHomeHeader, SiteThemeToggle } from '@/components/site-header';
import { baseOptions } from '@/lib/layout';

export default function DocumentationHomeLayout({ children }: { children: ReactNode }) {
  return (
    <HomeLayout {...baseOptions()} slots={{ header: DocsHomeHeader, themeSwitch: SiteThemeToggle }}>
      {children}
    </HomeLayout>
  );
}
