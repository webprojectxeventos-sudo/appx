import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // User-generated content comes from arbitrary URLs (Supabase storage, Dropbox, etc.)
    // Using unoptimized avoids needing to whitelist every possible domain
    unoptimized: true,
  },
  async headers() {
    const rules = [
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
    ]

    // Static assets: `immutable` is only safe in prod, where Next.js hashes
    // filenames so a content change ⇒ URL change. In dev, chunk URLs are
    // unhashed (e.g. /_next/static/chunks/app/(scanner)/scanner/page.js)
    // and their content changes on every edit; marking them immutable makes
    // the browser pin to the first version it saw across rebuilds, silently
    // showing stale UI. In dev, skip this rule entirely so Next.js's own
    // cache-control defaults apply — Next 16 also warns loudly if you
    // override headers on /_next/static/* during development.
    if (process.env.NODE_ENV === 'production') {
      rules.push({
        source: '/_next/static/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      })
    }

    return rules
  },
};

export default nextConfig;
