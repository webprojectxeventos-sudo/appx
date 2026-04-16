import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // User-generated content comes from arbitrary URLs (Supabase storage, Dropbox, etc.)
    // Using unoptimized avoids needing to whitelist every possible domain
    unoptimized: true,
  },
  async headers() {
    return [
      {
        // HTML pages: always revalidate so deploys are picked up immediately
        source: '/((?!_next/static|_next/image|favicon|logo|icon|manifest).*)',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(self)',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
      {
        // Static assets: immutable, cached forever (Next.js hashes filenames)
        source: '/_next/static/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ]
  },
};

export default nextConfig;
