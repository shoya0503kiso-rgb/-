"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { createMemberAction } from "./actions";

/** スマホを持っていないお客さんなどを店側で登録する */
export function NewMemberButton() {
  const router = useRouter();
  async function onClick() {
    const name = prompt("新しい会員のニックネーム");
    if (!name) return;
    const res = await createMemberAction(name);
    if (!res.ok) return alert(res.error);
    router.push(`/admin/members/${res.data!.id}`);
  }
  return (
    <Button variant="secondary" onClick={onClick}>
      ＋ 会員を追加
    </Button>
  );
}
