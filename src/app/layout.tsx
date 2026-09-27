import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Accounts Copilot',
  description:
    'Financial insights and actions for the accounts department, backed by QuickBooks Online.',
  icons: { icon: '/globlex-ai-logo.webp' },
};

export const viewport: Viewport = {
  themeColor: '#1a1c1f',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
