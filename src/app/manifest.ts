import type { MetadataRoute } from "next";

// iPad の「ホーム画面に追加」で、打刻画面をアプリのように全画面で開けるようにする（起動時は打刻画面）
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "シフト管理くん",
    short_name: "シフト管理",
    description: "勤怠打刻・シフト管理",
    start_url: "/kiosk",
    display: "standalone",
    orientation: "any",
    background_color: "#f1f5f9",
    theme_color: "#0f766e",
    lang: "ja",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
