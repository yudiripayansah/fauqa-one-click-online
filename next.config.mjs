/** @type {import('next').NextConfig} */
const nextConfig = {
  cacheComponents: true,
  // Development: admin di app.localhost, situs di <slug>.localhost.
  allowedDevOrigins: ['*.localhost'],
  experimental: {
    // Unggah file satu per satu: video maks. 50 MB (PRD §4.8) + overhead multipart.
    serverActions: { bodySizeLimit: '52mb' },
  },
  turbopack: {
    rules: {
      '*.css': { loaders: ['@tailwindcss/turbopack'], as: '*.css' },
    },
  },
};

export default nextConfig;
