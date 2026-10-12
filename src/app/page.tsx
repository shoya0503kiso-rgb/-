import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { KIOSK_COOKIE } from "@/server/session-token";

export default async function Home() {
  const isKiosk = (await cookies()).has(KIOSK_COOKIE);
  redirect(isKiosk ? "/kiosk" : "/admin");
}
