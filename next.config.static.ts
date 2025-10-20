import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  env: {
    AUTH_DISABLED: "true",
    NODE_ENV: "production",
  },
};

export default nextConfig;
