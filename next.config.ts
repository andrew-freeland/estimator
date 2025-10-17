import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const BUILD_OUTPUT = process.env.NEXT_STANDALONE_OUTPUT
  ? "standalone"
  : undefined;

export default () => {
  const nextConfig: NextConfig = {
    output: BUILD_OUTPUT,
    cleanDistDir: true,
    devIndicators: {
      position: "bottom-right",
    },
    env: {
      NO_HTTPS: process.env.NO_HTTPS,
    },
    experimental: {
      taint: true,
      authInterrupts: true,
      // Research-backed fix: Next.js 15.3.2 memory optimization
      webpackMemoryOptimizations: true, // Reduce memory usage during build
      workerThreads: false, // Disable build workers to avoid conflicts
    },
    webpack: (config, { isServer }) => {
      // Fix better-auth Edge Runtime compatibility
      if (!isServer) {
        config.resolve.fallback = {
          ...config.resolve.fallback,
          fs: false,
          net: false,
          tls: false,
        };
      }

      // Exclude better-auth from Edge Runtime bundling
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push({
          "better-auth": "better-auth",
          "better-auth/cookies": "better-auth/cookies",
        });
      }

      return config;
    },
  };
  const withNextIntl = createNextIntlPlugin();
  return withNextIntl(nextConfig);
};
