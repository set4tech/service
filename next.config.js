/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow external images if needed
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  webpack: config => {
    // Exclude pdf-parse test directory from build
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
