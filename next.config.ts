import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // User-generated content comes from arbitrary URLs (Supabase storage, Dropbox, etc.)
    // Using unoptimized avoids needing to whitelist every possible domain
    unoptimized: true,
  },
};

export default nextConfig;
