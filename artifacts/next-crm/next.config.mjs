import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    resolveAlias: {
      "@tanstack/react-query": "./node_modules/@tanstack/react-query",
    },
  },
  webpack: (config) => {
    config.resolve.alias["@tanstack/react-query"] = path.resolve(__dirname, "node_modules/@tanstack/react-query");
    return config;
  }
};

export default nextConfig;
