import type { CSSProperties, ReactNode } from 'react';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { DocsArticleHeader, SiteThemeToggle } from '@/components/site-header';
import { baseOptions } from '@/lib/layout';
import { source } from '@/lib/source';

export default function DocumentationArticleLayout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      {...baseOptions()}
      tree={source.getPageTree()}
      sidebar={{ collapsible: true }}
      slots={{ header: DocsArticleHeader, themeSwitch: SiteThemeToggle }}
      containerProps={{
        className: 'sd-branded-docs-layout',
        style: {
          gridTemplate: `"header header header header header"
"sidebar sidebar toc-popover toc toc"
"sidebar sidebar main toc toc" 1fr / minmax(0, 1fr) var(--fd-sidebar-col) minmax(0, calc(var(--fd-layout-width,97rem) - var(--fd-sidebar-width) - var(--fd-toc-width))) var(--fd-toc-width) minmax(0, 1fr)`,
          '--fd-header-height': '64px',
        } as CSSProperties,
      }}
    >
      {children}
    </DocsLayout>
  );
}
