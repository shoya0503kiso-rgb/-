import { PageHeader } from "@/components/ui";
import { lineLoginEnabled } from "@/server/line";
import { prisma } from "@/server/db";
import { getBrand, getRankTiers, getSettings } from "@/server/settings";
import { SettingsForms } from "./SettingsForms";

export default async function SettingsPage() {
  const [s, brand, ranks, rules] = await Promise.all([getSettings(), getBrand(), getRankTiers(), prisma.placePointRule.findMany({ orderBy: { place: "asc" } })]);
  return (
    <div className="space-y-4">
      <PageHeader title="設定" description="ロゴ・店名・ポイント量・ゲームの確率・ランクなど。数字はすべて仮の値なので、運用しながら調整してください" />
      <SettingsForms
        brand={{
          storeName: s.storeName,
          storeSubName: s.storeSubName,
          pointName: s.pointName,
          mochiLabel: s.mochiLabel,
          mochiWord: s.mochiWord,
          logoUrl: brand.logoUrl,
          hasLogo: brand.hasLogo,
          soundUrl: brand.soundUrl,
        }}
        numbers={{
          dayChangeHour: s.dayChangeHour,
          checkinPoints: s.checkinPoints,
          stampsPerCard: s.stampsPerCard,
          stampCardBonus: s.stampCardBonus,
          jankenWinPoints: s.jankenWinPoints,
          chinchiroWinPoints: s.chinchiroWinPoints,
          chinchiroBigWinPoints: s.chinchiroBigWinPoints,
          mochiWinOdds: s.mochiWinOdds,
          mochiWinPoints: s.mochiWinPoints,
          mochiDailyWinLimit: s.mochiDailyWinLimit,
          guestSignupEnabled: s.guestSignupEnabled,
          geoEnabled: s.geoEnabled,
          geoLat: s.geoLat,
          geoLng: s.geoLng,
          geoRadiusM: s.geoRadiusM,
        }}
        ranks={ranks.map((r) => ({ name: r.name, minVisits: r.minVisits, color: r.color }))}
        placePoints={{
          darts: rules.filter((r) => r.game === "darts").map((r) => r.points),
          poker: rules.filter((r) => r.game === "poker").map((r) => r.points),
        }}
        lineEnabled={lineLoginEnabled()}
      />
    </div>
  );
}
