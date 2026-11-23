import { redirect } from "next/navigation";

// スタンプカレンダーはホームに入ったので、前のURLはホームへ
export default function CalendarPage() {
  redirect("/me");
}
