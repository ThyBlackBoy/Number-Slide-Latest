import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Number Slide',
  description: 'Online number slide game',
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