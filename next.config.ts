import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  allowedDevOrigins: ["home.tailb9c821.ts.net"],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
