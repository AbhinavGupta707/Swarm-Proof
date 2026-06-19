/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@swarmproof/types", "@swarmproof/events", "@swarmproof/testgen", "@swarmproof/db", "@swarmproof/ai"]
};

export default nextConfig;
