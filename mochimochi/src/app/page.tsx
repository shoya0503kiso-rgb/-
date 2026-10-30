import { redirect } from "next/navigation";
import { liffStateTarget } from "@/lib/paths";

// LINE（LIFF）から開いたときは liff.state に本来の行き先（例：/checkin?c=…）が入っている
export default async function Home({ searchParams }: { searchParams: Promise<{ "liff.state"?: string }> }) {
  const sp = await searchParams;
  redirect(liffStateTarget(sp["liff.state"]));
}
