/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["@seepine/edge-tts", "ws"],
  },
};

export default nextConfig;
