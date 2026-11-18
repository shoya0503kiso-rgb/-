import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // リポジトリ直下に別アプリ（シフト管理くん）があるため、このフォルダを基準にする
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
