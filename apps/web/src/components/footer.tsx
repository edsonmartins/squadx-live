'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Logo } from '@/components/Logo';

// Custom GitHub icon SVG component (brand icons deprecated in lucide)
function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

// Custom Twitter/X icon SVG component
function TwitterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

const installLinks = [
  {
    name: 'Homebrew (macOS)',
    href: 'https://github.com/squadx/homebrew-squadx-live',
  },
  {
    name: 'Scoop (Windows)',
    href: 'https://github.com/squadx/scoop-squadx-live',
  },
  {
    name: 'WinGet (Windows)',
    href: 'https://github.com/microsoft/winget-pkgs/tree/master/manifests/s/SquadX/SquadXLive',
  },
  {
    name: 'Chocolatey (Windows)',
    href: 'https://community.chocolatey.org/packages/squadx-live',
  },
  { name: 'AUR (Arch)', href: 'https://aur.archlinux.org/packages/squadx-live-bin' },
  { name: 'APT (Debian)', href: 'https://github.com/squadx/squadx-live-apt' },
  { name: 'RPM (Fedora)', href: 'https://github.com/squadx/squadx-live-rpm' },
  { name: 'Gentoo', href: 'https://github.com/squadx/gentoo-squadx-live' },
  { name: 'Nix', href: 'https://github.com/squadx/squadx-live-nix' },
];

const socialLinks = [
  {
    name: 'GitHub',
    href: 'https://github.com/squadx/squadx-live',
    icon: GitHubIcon,
  },
  {
    name: 'X',
    href: 'https://x.com/squadxlive',
    icon: TwitterIcon,
  },
];

export function Footer() {
  const t = useTranslations('footer');

  const productLinks = [
    { name: t('features'), href: '/features' },
    { name: t('download'), href: '/download' },
    { name: t('pricing'), href: '/pricing' },
    { name: t('changelog'), href: '/changelog' },
  ];

  const resourceLinks = [
    { name: t('documentation'), href: '/docs' },
    { name: t('faq'), href: '/docs#faq' },
    { name: t('systemRequirements'), href: '/docs#requirements' },
    { name: t('troubleshooting'), href: '/docs#troubleshooting' },
  ];

  const companyLinks = [
    { name: t('about'), href: '/about' },
    { name: t('blog'), href: '/blog' },
    { name: t('privacyPolicy'), href: '/privacy' },
    { name: t('termsOfService'), href: '/terms' },
  ];

  return (
    <footer className="border-t border-gray-200 bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid grid-cols-2 gap-8 lg:grid-cols-5">
          {/* Brand */}
          <div className="col-span-2 lg:col-span-1">
            <Logo size="lg" />
            <p className="mt-4 text-sm text-gray-600">
              {t('description')}
            </p>
            <div className="mt-6 flex gap-4">
              {socialLinks.map((item) => (
                <a
                  key={item.name}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-500 transition-colors hover:text-gray-900"
                >
                  <span className="sr-only">{item.name}</span>
                  <item.icon className="h-5 w-5" />
                </a>
              ))}
            </div>
          </div>

          {/* Product links */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{t('product')}</h3>
            <ul className="mt-4 space-y-3">
              {productLinks.map((item) => (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className="text-sm text-gray-600 transition-colors hover:text-gray-900"
                  >
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Install links */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{t('install')}</h3>
            <ul className="mt-4 space-y-3">
              {installLinks.map((item) => (
                <li key={item.name}>
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-gray-600 transition-colors hover:text-gray-900"
                  >
                    {item.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources links */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{t('resources')}</h3>
            <ul className="mt-4 space-y-3">
              {resourceLinks.map((item) => (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className="text-sm text-gray-600 transition-colors hover:text-gray-900"
                  >
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company links */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{t('company')}</h3>
            <ul className="mt-4 space-y-3">
              {companyLinks.map((item) => (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className="text-sm text-gray-600 transition-colors hover:text-gray-900"
                  >
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 border-t border-gray-200 pt-8">
          <p className="text-center text-sm text-gray-500">
            &copy; {new Date().getFullYear()}{' '}
            <a
              href="https://squadx.live"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-700"
            >
              SquadX Team
            </a>{' '}
            {t('copyright')}
          </p>
        </div>
      </div>
    </footer>
  );
}
