import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Lilita_One, Nunito } from 'next/font/google'
import './globals.css'

const display = Lilita_One({ weight: '400', subsets: ['latin'], variable: '--font-display-face' })
const body = Nunito({ subsets: ['latin'], variable: '--font-body', weight: ['600', '800', '900'] })

export const metadata: Metadata = {
  title: 'Splash Dash - 3D Obstacle Course',
  description:
    'A splashy 3D TV-show obstacle course for Android. Jump, duck and super-bounce across big balls, sweepers and wrecking balls without falling in the pool.',
  applicationName: 'Splash Dash',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Splash Dash', statusBarStyle: 'black-translucent' },
  icons: { icon: '/icon-512.png', apple: '/icon-512.png' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#0b1f4a',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="font-sans antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
