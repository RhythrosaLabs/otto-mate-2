import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "playwright"],
  images: {
    domains: ["ppl-ai-code-interpreter-files.s3.amazonaws.com", "r2cdn.perplexity.ai", "assets.pipedream.net"],
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  devIndicators: {
    appIsrStatus: false,
    buildActivity: false,
  },
  // Keep bolt proxy rewrite available as fallback
  async rewrites() {
    return [
      {
        source: "/bolt/:path*",
        destination: "http://localhost:5173/:path*",
      },
      {
        source: "/kilocode/:path*",
        destination: "http://localhost:3100/:path*",
      },
    ];
  },
  // Enable cross-origin isolation on the Computer UI so bolt.diy WebContainers
  // can use SharedArrayBuffer. Scoped to /computer/* only (not API routes or
  // static assets). "credentialless" allows the cross-origin iframe to load.
  async headers() {
    return [
      {
        source: "/computer",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
        ],
      },
      {
        source: "/computer/:path((?!coding-companion).*)",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
        ],
      },
      {
        source: "/bolt/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
        ],
      },
      {
        source: "/kilocode/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
