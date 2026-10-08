import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Dev-only: allow the QA harness (and a phone on the LAN) to reach the dev
  // client over whatever host it used, instead of only `localhost`.
  allowedDevOrigins: ["127.0.0.1", "192.168.1.98"],
  serverExternalPackages: ["pg", "ws"],
  experimental: {
    optimizePackageImports: ["framer-motion", "wagmi", "viem"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        // The game shell is the one screen that must never be cached or embedded
        // — a stale snapshot mid-match is a corrupted match.
        source: "/arena/(.*)",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
