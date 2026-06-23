import type { NextConfig } from "next";

// Origin của Express API (mặc định cho dev). Đặt API_ORIGIN trong .env để đổi.
const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:3300";

const nextConfig: NextConfig = {
  // Proxy mọi request /api/* sang Express backend để giữ nguyên 53 test + extension.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_ORIGIN}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
