/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  
  // Image optimization for better mobile experience
  images: {
    domains: [
      'img.youtube.com',
      'i.ytimg.com',
    ],
    formats: ['image/webp', 'image/avif'],
  },
};

module.exports = nextConfig;