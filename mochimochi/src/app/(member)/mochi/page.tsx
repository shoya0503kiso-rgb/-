import { requireMember } from "@/server/member-auth";
import { mochiStatus } from "@/server/mochi";
import { getBrand, getSettings } from "@/server/settings";
import { MochiTapper } from "./MochiTapper";

export const dynamic = "force-dynamic";

export default async function MochiPage() {
  const member = await requireMember("/mochi");
  const [brand, s, status] = await Promise.all([getBrand(), getSettings(), mochiStatus(member.id)]);
  return (
    <MochiTapper
      label={brand.mochiLabel}
      word={brand.mochiWord}
      soundUrl={brand.soundUrl}
      pointName={s.pointName}
      winPoints={s.mochiWinPoints}
      initial={status}
    />
  );
}
