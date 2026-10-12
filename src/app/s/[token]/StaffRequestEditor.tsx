"use client";
import { useRouter } from "next/navigation";
import { RequestEditor, type EditorDay, type EditorPattern } from "@/components/shift/RequestEditor";
import { submitStaffRequestAction } from "./actions";

export function StaffRequestEditor(props: { token: string; ym: string; readOnly: boolean; initialDays: EditorDay[]; initialComment: string; patterns: EditorPattern[] }) {
  const router = useRouter();
  return (
    <RequestEditor
      initialDays={props.initialDays}
      initialComment={props.initialComment}
      patterns={props.patterns}
      readOnly={props.readOnly}
      onSubmit={async (days, comment) => {
        const r = await submitStaffRequestAction(props.token, props.ym, days, comment);
        if (r.ok) router.refresh();
        return r;
      }}
    />
  );
}
