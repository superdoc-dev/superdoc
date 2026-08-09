'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Moon, PanelLeft, Sun, X } from 'lucide-react';
import { useTheme } from 'next-themes';
import type { ComponentProps, ReactNode, SVGProps } from 'react';
import { useEffect, useState } from 'react';
import { useDocsLayout } from 'fumadocs-ui/layouts/docs';
import { useHomeLayout } from 'fumadocs-ui/layouts/home';
import { VersionMenu } from '@/components/version-menu';
import { repositoryApiUrl, repositoryUrl } from '@/lib/site-url';

const DOCS_NAV_ITEMS = [
  { label: 'Get started', href: '/start/what-superdoc-does', activePrefix: '/start' },
  { label: 'Editor', href: '/editor', activePrefix: '/editor' },
  { label: 'Agents & automation', href: '/agents/overview', activePrefix: '/agents' },
  { label: 'Document API', href: '/document-api/mental-model', activePrefix: '/document-api' },
] as const;

const CONTACT_URL = 'https://meetings.hubspot.com/caio-pizzol';

function GithubIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='2'
      strokeLinecap='round'
      strokeLinejoin='round'
      xmlns='http://www.w3.org/2000/svg'
      {...props}
    >
      <path d='M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4' />
      <path d='M9 18c-4.51 2-5-2-7-2' />
    </svg>
  );
}

export function SiteThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const isDark = mounted && resolvedTheme === 'dark';

  useEffect(() => setMounted(true), []);

  return (
    <button
      className={`sd-site-theme-switch ${className ?? ''}`}
      type='button'
      aria-label='Toggle theme'
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <Sun aria-hidden='true' /> : <Moon aria-hidden='true' />}
    </button>
  );
}

interface SiteHeaderProps extends ComponentProps<'header'> {
  desktopSearch: ReactNode;
  mobileSearch: ReactNode;
  themeSwitch: ReactNode;
  mobileMenuTrigger?: ReactNode;
}

function isActivePath(pathname: string, activePrefix: string) {
  return pathname === activePrefix || pathname.startsWith(`${activePrefix}/`);
}

function SiteHeader({
  desktopSearch,
  mobileSearch,
  themeSwitch,
  mobileMenuTrigger,
  className,
  ...props
}: SiteHeaderProps) {
  const pathname = usePathname();
  const [openMenuPathname, setOpenMenuPathname] = useState<string | null>(null);
  const [githubStars, setGithubStars] = useState('909');
  const menuOpen = openMenuPathname === pathname;

  useEffect(() => {
    const controller = new AbortController();

    fetch(repositoryApiUrl, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: unknown) => {
        if (
          typeof data === 'object' &&
          data !== null &&
          'stargazers_count' in data &&
          typeof data.stargazers_count === 'number'
        ) {
          setGithubStars(data.stargazers_count.toLocaleString());
        }
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, []);

  return (
    <header id='nd-nav' className={`sd-site-header ${className ?? ''}`} {...props}>
      <nav className='sd-site-header-inner' aria-label='Primary navigation'>
        {/* The brand link and the version share one grid item. The header grid
            declares three columns, so a fourth child would drop the actions
            block into an implicit second row and overflow the 64px header. They
            stay separate elements because a version selector nested inside the
            home link would not be independently clickable. */}
        <div className='sd-site-brand-group'>
          <Link className='sd-site-brand' href='/' aria-label='SuperDoc documentation home'>
            <Image
              className='sd-site-brand-mark'
              src='/brand/superdoc-mark.webp'
              alt=''
              width={36}
              height={40}
              priority
            />
            <span className='sd-site-wordmark'>SuperDoc</span>
          </Link>
          <VersionMenu />
        </div>

        <div className='sd-site-nav-links'>
          {DOCS_NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              className='sd-site-nav-link'
              data-active={isActivePath(pathname, item.activePrefix)}
              href={item.href}
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className='sd-site-actions'>
          <div className='sd-site-search'>{desktopSearch}</div>
          <div className='sd-site-search-compact'>{mobileSearch}</div>
          {themeSwitch}
          <a
            className='sd-site-icon-link sd-site-github-link'
            href={repositoryUrl}
            target='_blank'
            rel='noreferrer'
            aria-label='SuperDoc on GitHub'
          >
            <GithubIcon aria-hidden='true' />
            <span className='sd-site-github-count'>{githubStars}</span>
          </a>
          <a className='sd-site-contact' href={CONTACT_URL} target='_blank' rel='noreferrer'>
            <span className='sd-site-contact-full'>Talk to an engineer</span>
            <span className='sd-site-contact-compact'>Book a chat</span>
          </a>
        </div>

        <div className='sd-site-mobile-actions'>
          {mobileSearch}
          {mobileMenuTrigger}
          <button
            className='sd-site-menu-button'
            type='button'
            aria-label={menuOpen ? 'Close site menu' : 'Open site menu'}
            aria-expanded={menuOpen}
            aria-controls='sd-site-mobile-menu'
            onClick={() => setOpenMenuPathname((openPathname) => (openPathname === pathname ? null : pathname))}
          >
            {menuOpen ? <X aria-hidden='true' /> : <Menu aria-hidden='true' />}
          </button>
        </div>
      </nav>

      {menuOpen ? (
        <div className='sd-site-mobile-menu' id='sd-site-mobile-menu'>
          {mobileMenuTrigger == null ? (
            <nav aria-label='Mobile navigation'>
              {DOCS_NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  className='sd-site-mobile-link'
                  data-active={isActivePath(pathname, item.activePrefix)}
                  href={item.href}
                  onClick={() => setOpenMenuPathname(null)}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          ) : null}
          <div className='sd-site-mobile-utilities'>
            <a href={repositoryUrl} target='_blank' rel='noreferrer' aria-label='SuperDoc on GitHub'>
              <GithubIcon aria-hidden='true' />
              <span>{githubStars}</span>
            </a>
            {themeSwitch}
            <a className='sd-site-contact' href={CONTACT_URL} target='_blank' rel='noreferrer'>
              Talk to an engineer
            </a>
          </div>
        </div>
      ) : null}
    </header>
  );
}

export function DocsHomeHeader(props: ComponentProps<'header'>) {
  const { slots } = useHomeLayout();
  const SearchFull = slots.searchTrigger && slots.searchTrigger.full;
  const SearchSmall = slots.searchTrigger && slots.searchTrigger.sm;
  const ThemeSwitch = slots.themeSwitch;

  return (
    <SiteHeader
      {...props}
      desktopSearch={SearchFull ? <SearchFull hideIfDisabled /> : null}
      mobileSearch={SearchSmall ? <SearchSmall hideIfDisabled className='sd-site-mobile-control' /> : null}
      themeSwitch={ThemeSwitch ? <ThemeSwitch /> : null}
    />
  );
}

export function DocsArticleHeader(props: ComponentProps<'header'>) {
  const { slots } = useDocsLayout();
  const SearchFull = slots.searchTrigger && slots.searchTrigger.full;
  const SearchSmall = slots.searchTrigger && slots.searchTrigger.sm;
  const ThemeSwitch = slots.themeSwitch;
  const SidebarTrigger = slots.sidebar && slots.sidebar.trigger;

  return (
    <SiteHeader
      {...props}
      desktopSearch={SearchFull ? <SearchFull hideIfDisabled /> : null}
      mobileSearch={SearchSmall ? <SearchSmall hideIfDisabled className='sd-site-mobile-control' /> : null}
      themeSwitch={ThemeSwitch ? <ThemeSwitch /> : null}
      mobileMenuTrigger={
        SidebarTrigger ? (
          /* A distinct icon from the site menu beside it. Two identical
             hamburgers give no clue that one opens the page tree and the other
             opens site utilities. */
          <SidebarTrigger className='sd-site-menu-button' aria-label='Browse documentation'>
            <PanelLeft aria-hidden='true' />
          </SidebarTrigger>
        ) : null
      }
    />
  );
}
