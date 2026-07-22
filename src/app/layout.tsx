import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "AEGIS-SENTRY | NASA vs ESA Asteroid Risk Divergence",
  description:
    "Real-time scientific engine comparing NASA Sentry-II and ESA NEOCC/Aegis impact probability calculations.",
  openGraph: {
    title: "AEGIS-SENTRY Divergence Watch",
    description:
      "Where NASA and ESA disagree on whether an asteroid will hit Earth.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          href="https://cesium.com/downloads/cesiumjs/releases/1.122/Build/Cesium/Widgets/widgets.css"
          rel="stylesheet"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `window.CESIUM_BASE_URL = "https://cesium.com/downloads/cesiumjs/releases/1.122/Build/Cesium/";`,
          }}
        />
        <script src="https://cesium.com/downloads/cesiumjs/releases/1.122/Build/Cesium/Cesium.js" />
      </head>
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
