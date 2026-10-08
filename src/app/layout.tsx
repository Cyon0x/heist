import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: {
    default: "HEIST — Steal. Outsmart. Escape.",
    template: "%s · HEIST",
  },
  description:
    "Competitive 1v1 onchain extraction. Two thieves enter the same facility for one Core. Hack the cameras, breach the vault, and be the one who walks out.",
  applicationName: "HEIST",
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:4320"),
  openGraph: {
    title: "HEIST — Steal. Outsmart. Escape.",
    description: "Competitive 1v1 onchain extraction on Arc Mainnet. Stake USDC. Win 90%.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#080b10",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Self-hosted Archivo + IBM Plex Mono. Linked rather than @import-ed so
            the fonts are discovered in the first HTML payload. */}
        <link rel="preload" as="font" type="font/woff2" href="/fonts/archivo-latin.woff2" crossOrigin="anonymous" />
        <link rel="preload" as="font" type="font/woff2" href="/fonts/plex-mono-400.woff2" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-css-tags -- these are self-hosted
            @font-face rules, not a page stylesheet; a plain link is what lets the
            browser start the font request in the first HTML payload. */}
        <link rel="stylesheet" href="/fonts/fonts.css" />
      </head>
      <body>
        <div className="ground-facility" aria-hidden />
        <div className="grain" aria-hidden />
        <a
          href="#main"
          className="btn btn-action sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[200]"
        >
          Skip to content
        </a>
        <Providers>
          <SiteHeader />
          <main id="main">{children}</main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
