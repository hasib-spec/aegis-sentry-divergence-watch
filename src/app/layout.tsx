import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AEGIS·SENTRY — Planetary Defense Readiness Engine",
  description:
    "Real-time NASA Sentry-II vs ESA NEOCC/Aegis divergence engine with Yarkovsky Sensitivity Index, gravitational keyhole detection, impact corridor projection, and Rubin LSST follow-up triage.",
  openGraph: {
    title: "AEGIS·SENTRY v3.0 — Planetary Defense Readiness Engine",
    description:
      "Where NASA and ESA disagree on asteroid impact risk — quantified live. Yarkovsky sensitivity. Keyhole alerts. Impact corridors. Rubin triage.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AEGIS·SENTRY v3.0",
    description: "NASA vs ESA asteroid risk divergence, quantified in real time.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#030308] text-zinc-200 antialiased">
        <div className="fixed inset-0 pointer-events-none z-0">
          <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-cyan-500/[0.03] rounded-full blur-[150px]" />
          <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-orange-500/[0.03] rounded-full blur-[150px]" />
        </div>
        <main className="relative z-10">{children}</main>
      </body>
    </html>
  );
}
