import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import Script from 'next/script';
import { PWAInstallButton } from '@/components/pwa';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: {
    default: 'SquadX Live - Collaborative Screen Sharing with Remote Control',
    template: '%s | SquadX Live',
  },
  description:
    'Open source collaborative screen sharing with simultaneous remote mouse and keyboard control. Real-time whiteboard, WebRTC encryption, and cross-platform apps. Like Screenhero, reimagined.',
  keywords: [
    'screen sharing',
    'remote control',
    'pair programming',
    'collaboration',
    'webrtc',
    'whiteboard',
    'excalidraw',
    'open source',
    'screenhero alternative',
  ],
  authors: [{ name: 'SquadX Team' }],
  creator: 'SquadX',
  publisher: 'SquadX',
  formatDetection: {
    email: false,
    telephone: false,
  },
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://squadx.live'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://squadx.live',
    siteName: 'SquadX Live',
    title: 'SquadX Live - Collaborative Screen Sharing with Remote Control',
    description:
      'Open source collaborative screen sharing with simultaneous remote mouse and keyboard control. Real-time whiteboard and WebRTC encryption.',
    images: [
      {
        url: '/banner.png',
        width: 1200,
        height: 630,
        alt: 'SquadX Live - Collaborative Development Platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SquadX Live - Collaborative Screen Sharing with Remote Control',
    description:
      'Open source collaborative screen sharing with simultaneous remote mouse and keyboard control. Real-time whiteboard and WebRTC encryption.',
    images: ['/banner.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/favicon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon-180x180.png', sizes: '180x180' },
      { url: '/icons/apple-touch-icon-152x152.png', sizes: '152x152' },
      { url: '/icons/apple-touch-icon-144x144.png', sizes: '144x144' },
      { url: '/icons/apple-touch-icon-120x120.png', sizes: '120x120' },
    ],
    other: [{ rel: 'msapplication-TileImage', url: '/icons/apple-touch-icon-144x144.png' }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'SquadX Live',
  },
  other: {
    'msapplication-TileColor': '#0f172a',
    'msapplication-config': '/icons/browserconfig.xml',
  },
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen font-sans">
        {children}
        <PWAInstallButton />
        {/* Datafast Analytics */}
        <Script
          defer
          src="https://datafa.st/js/script.js"
          data-website-id="dfid_tUrFgv4cjOcfrfM3ofldI"
          data-domain="squadx.live"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
