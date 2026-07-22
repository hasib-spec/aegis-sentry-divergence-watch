import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AEGIS·SENTRY — Planetary Defense Readiness Engine",
  description:
    "Real-time NASA Sentry-II vs ESA NEOCC/Aegis divergence engine with Yarkovsky Sensitivity Index, gravitational keyhole detection, impact corridor projection, deflection planning, and Rubin LSST follow-up triage.",
  manifest: "/manifest.json",
  openGraph: {
    title: "AEGIS·SENTRY v4.0 — Planetary Defense Readiness Engine",
    description:
      "Where NASA and ESA disagree on asteroid impact risk — quantified live. Yarkovsky sensitivity. Keyhole alerts. Impact corridors. Deflection planning. Observatory integration.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AEGIS·SENTRY v4.0",
    description:
      "NASA vs ESA asteroid risk divergence, quantified in real time. Now with observatory feeds, export, and collaboration.",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "AEGIS·SENTRY",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#030308",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/icon-152.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <meta name="apple-mobile-web-app-title" content="AEGIS·SENTRY" />
        <meta name="application-name" content="AEGIS·SENTRY" />
        <meta name="msapplication-TileColor" content="#030308" />
        <meta name="msapplication-TileImage" content="/icons/icon-144.png" />
      </head>
      <body className="min-h-screen bg-[#030308] text-zinc-200 antialiased">
        <div className="fixed inset-0 pointer-events-none z-0">
          <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-cyan-500/[0.03] rounded-full blur-[150px]" />
          <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-orange-500/[0.03] rounded-full blur-[150px]" />
        </div>
        <main className="relative z-10">{children}</main>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}

function ServiceWorkerRegistrar() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
              navigator.serviceWorker.register('/sw.js', { scope: '/' })
                .then(function(reg) {
                  console.log('[AEGIS] SW registered:', reg.scope);
                })
                .catch(function(err) {
                  console.warn('[AEGIS] SW registration failed:', err);
                });
            });
          }
        `,
      }}
    />
  );
}