/** @type {import('next').NextConfig} */

// Proxy API calls to the FastAPI backend so the browser talks same-origin
// (no CORS, tokens stay first-party). Override the target with API_PROXY_TARGET.
const API_TARGET = process.env.API_PROXY_TARGET || "http://127.0.0.1:8000";

const nextConfig = {
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_TARGET}/api/:path*` },
      { source: "/health", destination: `${API_TARGET}/health` },
    ];
  },
};

export default nextConfig;
