import { GameNav } from "./GameNav";

// ゲームコーナー：スロット・宝くじ
export default function GameLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <GameNav />
      {children}
    </div>
  );
}
