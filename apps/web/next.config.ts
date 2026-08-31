import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(import.meta.dirname, "../.."),
  },
  typedRoutes: true,
};

export default nextConfig;
