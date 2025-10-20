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
      AUTH_DISABLED: process.env.AUTH_DISABLED || "true",
    },
    trailingSlash: true,
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
      // Temporarily disable experimental features that might cause issues
      // webpackMemoryOptimizations: true,
      // workerThreads: false,
      // serverSourceMaps: false,
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
