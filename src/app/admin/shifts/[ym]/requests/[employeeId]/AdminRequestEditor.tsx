"use client";
import { useRouter } from "next/navigation";
import { RequestEditor, type EditorDay, type EditorPattern } from "@/components/shift/RequestEditor";
import { adminSubmitRequestAction } from "../../../actions";

export function AdminRequestEditor(props: { ym: string; employeeId: string; initialDays: EditorDay[]; initialComment: string; patterns: EditorPattern[] }) {
  const router = useRouter();
  return (
    <RequestEditor
      initialDays={props.initialDays}
      initialComment={props.initialComment}
      patterns={props.patterns}
      readOnly={false}
      submitLabel="保存（代理入力）"
      onSubmit={async (days, comment) => {
        const r = await adminSubmitRequestAction(props.ym, props.employeeId, days, comment);
        if (r.ok) router.refresh();
        return r;
      }}
    />
  );
}
