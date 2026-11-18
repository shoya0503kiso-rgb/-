import type { Metadata, Viewport } from "next";
import { CATCH_COPY, STORE } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  title: `${CATCH_COPY.text}｜${STORE.name} カジノ体験型 貸し切り忘年会`,
  description: `${STORE.name}（${STORE.kind}）のカジノ体験型 貸し切り忘年会。8〜30名様、ポーカー＋2時間飲み放題。11月・12月 毎日受付。`,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0c0c0f",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
