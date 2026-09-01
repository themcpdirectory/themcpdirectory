import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  experimental: {
    extensionAlias: {
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
    },
  },
  outputFileTracingRoot: path.resolve(import.meta.dirname, "../.."),
  typedRoutes: true,
};

export default nextConfig;
