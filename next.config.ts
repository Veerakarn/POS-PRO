import type { NextConfig } from "next";

function getPublicHostname() {
  const publicUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!publicUrl) return undefined;

  try {
    return new URL(publicUrl).hostname;
  } catch {
    return undefined;
  }
}

const publicHostname = getPublicHostname();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
      ...(publicHostname ? { allowedOrigins: [publicHostname] } : {}),
    },
  },
  async headers() {
    return [{
      source: "/sw.js",
      headers: [
        { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
      ],
    }, {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }];
  },
  ...(publicHostname
    ? {
        allowedDevOrigins: [publicHostname],
      }
    : {}),
};

export default nextConfig;
