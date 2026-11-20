import { requireMember } from "@/server/member-auth";
import { slotStatus } from "@/server/casino";
import { getSettings } from "@/server/settings";
import { SlotMachine } from "./SlotMachine";

export const dynamic = "force-dynamic";

export default async function SlotPage() {
  const member = await requireMember("/game/slot");
  const [st, s] = await Promise.all([slotStatus(member.id), getSettings()]);
  if (!st.enabled) {
    return <p className="rounded-2xl bg-white p-6 text-center text-slate-600 ring-1 ring-rose-100">スロットはいまお休み中です</p>;
  }
  return <SlotMachine initial={st} pointName={s.pointName} characterName={s.characterName} />;
}
