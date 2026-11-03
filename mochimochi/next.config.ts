import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // リポジトリ直下に別アプリ（シフト管理くん）があるため、このフォルダを基準にする
  outputFileTracingRoot: process.cwd(),
  experimental: {
    // ロゴ・音声のアップロード（管理画面の設定）用
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
