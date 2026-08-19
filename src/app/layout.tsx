import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Instrument_Sans, IBM_Plex_Mono, Montserrat } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { headers } from "next/headers";

// Display: solo el logo, los títulos de página y las cifras hero.
// En ningún otro lado — si aparece en más lugares deja de destacar nada.
const serif = Instrument_Serif({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

// Todo el resto de la interfaz
const sans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

// Toda cifra: montos, porcentajes, fechas, cantidades. Sin excepción,
// incluso dentro de un párrafo. Es la convención del proyecto (580 usos).
const mono = IBM_Plex_Mono({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

// Fuente para el diseño de la carta/menú (estilo editorial)
const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-menu-sans",
  display: "swap",
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#1B3A2D',
};

export const metadata: Metadata = {
  title: "Tero Restó",
  description: "Sistema de gestión gastronómica y control de costos",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Tero Restó",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersList = headers()
  const pathname = headersList.get('x-next-pathname') || ''
  // Páginas a pantalla completa (sin sidebar). Hasta V.41 también estaban el
  // menú público del QR y la carta para imprimir, que se sacaron: la carta
  // impresa la diseña cada restaurante a su estilo, no el sistema.
  const isFullScreen = pathname === '/login'

  return (
    <html lang="es" className={`${serif.variable} ${sans.variable} ${mono.variable} ${montserrat.variable}`}>
      <head>
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icons/icon-152x152.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="167x167" href="/icons/icon-192x192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Tero Restó" />
        <link rel="apple-touch-startup-image" href="/icons/icon-512x512.png" />
      </head>
      <body className="font-sans antialiased">
        {isFullScreen ? (
          children
        ) : (
          <div className="flex h-screen bg-cream">
            <Sidebar />
            <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden mobile-content-padding">
              {children}
            </main>
          </div>
        )}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(function(registrations) {
                  for (let registration of registrations) {
                    registration.unregister().then(function() {
                      console.log('SW unregistered');
                    });
                  }
                });
                caches.keys().then(function(names) {
                  for (let name of names) {
                    caches.delete(name);
                    console.log('Cache deleted:', name);
                  }
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
