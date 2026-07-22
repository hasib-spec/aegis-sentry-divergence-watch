/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.module.unknownContextCritical = false;
    config.module.exprContextCritical = false;
    return config;
  },
};

module.exports = nextConfig;