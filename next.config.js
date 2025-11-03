/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Ensure TypeScript checks run during build
    ignoreBuildErrors: false,
  },
  // Allow external images if needed
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  // Externalize packages that have native dependencies or cause bundling issues
  serverExternalPackages: ['pdf-parse'],
  webpack: config => {
    config.externals = config.externals || [];
    config.externals.push({
      canvas: 'commonjs canvas',
    });

    // Ignore missing optional dependencies
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
    };

    return config;
  },
};

module.exports = nextConfig;
