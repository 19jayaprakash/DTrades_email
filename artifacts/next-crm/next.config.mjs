import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const reactQueryPath = path.dirname(require.resolve("@tanstack/react-query/package.json"));
const turbopackPath = process.platform === "win32" ? "./node_modules/@tanstack/react-query" : reactQueryPath;

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@workspace/api-client-react"],
  turbopack: {
    resolveAlias: {
      "@tanstack/react-query": turbopackPath,
    },
  },
  webpack: (config) => {
    config.resolve.alias["@tanstack/react-query"] = reactQueryPath;
    return config;
  }
};

export default nextConfig;
