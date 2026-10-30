import type { Metadata, Viewport } from "next";
import { getSettings } from "@/server/settings";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  // DB に繋がらない（ビルド中など）ときも画面は出す
  const s = await getSettings().catch(() => ({ storeName: "アミューズメントバーもちもち", brandVersion: 0 }));
  return {
    title: s.storeName,
    description: `${s.storeName} 会員アプリ`,
    icons: { icon: `/brand/logo?v=${s.brandVersion}` },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f43f5e",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
