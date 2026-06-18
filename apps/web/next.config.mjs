/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@swarmproof/types", "@swarmproof/events", "@swarmproof/testgen"]
};

export default nextConfig;
