import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://african-business-daily.vercel.app'

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: 'African Business Daily — The Morning Digest',
  description:
    'Daily intelligence on African business: fintech, deals, logistics, energy, policy, and more across Nigeria, Kenya, South Africa, Egypt, Ghana, and Morocco.',
  openGraph: {
    title: 'African Business Daily',
    description: 'Daily intelligence on African business — curated, clustered, and ready every morning.',
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'African Business Daily',
    description: 'Daily intelligence on African business.',
  },
  robots: { index: true, follow: true },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
