import './globals.css';
import type { Metadata } from 'next';
import { Inter, IBM_Plex_Mono } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Set 4 Service - E2E Plan Review',
  description: 'End-to-end accessibility code review service for 255 California Street',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`h-full ${inter.variable} ${plexMono.variable}`}>
      <body className="h-full font-sans antialiased bg-paper text-ink-900">{children}</body>
    </html>
  );
}
