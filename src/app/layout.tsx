import type { Metadata, Viewport } from 'next';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';
import './globals.css';

export const metadata: Metadata = {
  title: 'Accounts Copilot',
  description:
    'Financial insights and actions for the accounts department, with QuickBooks Online as an optional connection.',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
  // iOS ignores the web manifest for "Add to Home Screen" and reads these instead.
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Accounts Copilot',
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
