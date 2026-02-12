import type { NextConfig } from 'next';
import withSerwistInit from '@serwist/next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
});

const nextConfig: NextConfig = {
  // Enable React strict mode for better development experience
  reactStrictMode: true,

  // Enable Turbopack (Next.js 16+ default)
  turbopack: {},

  // Standalone output for Docker deployment
  output: 'standalone',

  // TODO: Remove after running Supabase migrations and regenerating types
  typescript: {
    ignoreBuildErrors: true,
  },

  // Transpile shared packages
  transpilePackages: ['@squadx-live/shared-types'],

  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },

  // Headers for security
  headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ];
  },

  // Redirects
  redirects() {
    return [
      {
        source: '/github',
        destination: 'https://github.com/squadx/squadx-live',
        permanent: false,
      },
    ];
  },
};

export default withNextIntl(withSerwist(nextConfig));
