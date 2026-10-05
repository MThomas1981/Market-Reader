/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@market-reader/core'],
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }] },
  async headers() {
    // The mobile app (and Expo web during development) calls these routes.
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type' },
        ],
      },
    ];
  },
};

export default nextConfig;
