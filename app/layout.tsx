import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Set 4 Service - E2E Plan Review',
  description: 'End-to-end accessibility code review service for 255 California Street',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}