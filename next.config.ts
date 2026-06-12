import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "bwip-js", "exceljs"],
  
  experimental: {
    cacheComponents: true,
  },
  
  // Cache configuration
  cacheHandler: undefined, // Use default Next.js cache handler
  cacheMaxMemorySize: 50 * 1024 * 1024, // 50MB
  
  // Image configuration (updated defaults for Next.js 16)
  images: {
    minimumCacheTTL: 60, // Updated default: 60 seconds
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384], // Updated defaults
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    formats: ["image/webp"],
  },
};

export default nextConfig;
