import { redirect } from "next/navigation";

// ゲームコーナーはスロットと宝くじ（じゃんけん・チンチロはなくした）
export default function GamePage() {
  redirect("/game/slot");
}
