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
};

export default nextConfig;
