import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
const staticExport = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  ...(staticExport ? { output: "export" as const } : {}),
  trailingSlash: true,
  images: { unoptimized: true },
  agentRules: false,
  serverExternalPackages: ["better-sqlite3"],
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  ...(basePath ? { basePath } : {}),
};

export default nextConfig;
