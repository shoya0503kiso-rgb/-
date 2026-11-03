"use client";

import { useEffect, useRef, useState } from "react";
import { inputClass } from "@/components/ui";
import { createMemberAction, searchMembersAction } from "@/app/admin/members/actions";

export type PickedMember = { id: string; nickname: string; visitCount: number };

/** ニックネームで検索して会員を選ぶ。見つからなければその場で新規登録もできる */
export function MemberPicker({ onPick, placeholder = "ニックネームで検索", exclude = [] }: { onPick: (m: PickedMember) => void; placeholder?: string; exclude?: string[] }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<PickedMember[]>([]);
  const [open, setOpen] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const id = ++seq.current;
    const t = setTimeout(async () => {
      const r = await searchMembersAction(q);
      if (id === seq.current) setItems(r);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const shown = items.filter((m) => !exclude.includes(m.id));

  function pick(m: PickedMember) {
    onPick(m);
    setQ("");
    setOpen(false);
  }

  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className={inputClass}
      />
      {open && (
        <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {shown.map((m) => (
            <li key={m.id}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(m)} className="flex w-full justify-between px-3 py-2 text-left hover:bg-rose-50">
                <span>{m.nickname}</span>
                <span className="text-xs text-slate-500">来店{m.visitCount}回</span>
              </button>
            </li>
          ))}
          {shown.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">見つかりません</li>}
          {q.trim() && (
            <li className="border-t border-slate-100">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={async () => {
                  if (!confirm(`「${q.trim()}」を新しい会員として登録しますか？`)) return;
                  const res = await createMemberAction(q.trim());
                  if (!res.ok) return alert(res.error);
                  pick(res.data!);
                }}
                className="w-full px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50"
              >
                ＋「{q.trim()}」を新規登録
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
