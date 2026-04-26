import './globals.css';

export const metadata = {
  title: {
    default: 'EV Buggy — Smart Electric Transport',
    template: '%s | EV Buggy',
  },
  description: 'Affordable, eco-friendly electric buggy rides for your apartment complex. Subscribe in seconds.',
  themeColor: '#22c55e',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
  },
  viewport: {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
    maximumScale: 1,
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
