"use client";
import type { ComponentProps } from "react";

/** 入力が変わったら自動で送信する GET フォーム（絞り込み用） */
export function AutoSubmitForm(props: ComponentProps<"form">) {
  return <form {...props} onChange={(e) => e.currentTarget.requestSubmit()} />;
}
