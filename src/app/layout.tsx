import type { Metadata, Viewport } from 'next';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';
import { BRAND } from '@/lib/brand';
import './globals.css';

export const metadata: Metadata = {
  title: `${BRAND.name} · ${BRAND.tagline}`,
  description: BRAND.marketing,
  manifest: '/manifest.json',
  icons: {
    icon: [
      // ?v= makes browsers drop a cached copy of the old favicon.
      { url: '/favicon.ico?v=2', sizes: 'any' },
      { url: '/icons/favicon-16.png?v=2', sizes: '16x16', type: 'image/png' },
      { url: '/icons/favicon-32.png?v=2', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png?v=2', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png?v=2', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png?v=2',
  },
  // iOS ignores the web manifest for "Add to Home Screen" and reads these instead.
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: BRAND.shortName,
  },
};

export const viewport: Viewport = {
  themeColor: '#0a1a35',
  // Lets the background reach into notch/home-indicator safe areas on
  // iPhone/iPad instead of leaving a hard edge, now that the app can run
  // full-screen as an installed PWA.
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
