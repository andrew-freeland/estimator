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
    // Build optimization settings
    eslint: {
      ignoreDuringBuilds: true,
    },
    typescript: {
      ignoreBuildErrors: true,
    },
    productionBrowserSourceMaps: false,
    experimental: {
      taint: true,
      authInterrupts: true,
      // Research-backed fix: Next.js 15.3.2 memory optimization
      webpackMemoryOptimizations: true, // Reduce memory usage during build
      workerThreads: false, // Disable build workers to avoid conflicts
      serverSourceMaps: false, // Disable server source maps
      optimizePackageImports: [
        "date-fns",
        "lodash",
        "lucide-react",
        "googleapis",
        "@aws-sdk/client-s3",
        "@radix-ui/react-dialog",
        "@radix-ui/react-dropdown-menu",
        "@radix-ui/react-popover",
        "@radix-ui/react-select",
        "@radix-ui/react-tabs",
        "@radix-ui/react-tooltip",
      ],
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
