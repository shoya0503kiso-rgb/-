import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ミニゲーム（public/*.html）を拡張子なしのURLで開けるようにする
  async rewrites() {
    return [
      { source: "/dealer-quest", destination: "/dealer-quest.html" },
      { source: "/drawing-battle", destination: "/drawing-battle.html" },
    ];
  },
};

export default nextConfig;
