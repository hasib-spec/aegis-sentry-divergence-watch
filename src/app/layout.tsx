import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AEGIS-SENTRY | NASA vs ESA Asteroid Risk Divergence",
  description:
    "Real-time scientific engine comparing NASA Sentry-II and ESA NEOCC/Aegis impact probability calculations. Keplerian propagation. Yarkovsky modeling. Palermo Scale recomputation.",
  keywords: [
    "planetary defense",
    "asteroid",
    "NASA Sentry",
    "ESA NEOCC",
    "Palermo Scale",
    "Yarkovsky effect",
    "orbital mechanics",
  ],
  openGraph: {
    title: "AEGIS-SENTRY Divergence Watch",
    description:
      "Where NASA and ESA disagree on whether an asteroid will hit Earth.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AEGIS-SENTRY: NASA vs ESA Asteroid Risk Divergence",
    description:
      "Same rock. Two agencies. Different answers. Live scientific engine.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-void text-zinc-200 antialiased grid-overlay">
        <div className="fixed inset-0 pointer-events-none z-0">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-nasa/5 rounded-full blur-[128px]" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-esa/5 rounded-full blur-[128px]" />
        </div>
        <main className="relative z-10">{children}</main>
      </body>
    </html>
  );
}