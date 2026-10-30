import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ミニゲーム「ディーラークエスト」（public/dealer-quest.html）を /dealer-quest で開けるようにする
  async rewrites() {
    return [{ source: "/dealer-quest", destination: "/dealer-quest.html" }];
  },
};

export default nextConfig;
