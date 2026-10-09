"use client";
import { useActionState } from "react";
import type { Employee } from "@prisma/client";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { saveEmployeeAction, setPinAction } from "./actions";

export function EmployeeForm({ employee }: { employee?: Employee }) {
  const [state, action, pending] = useActionState(saveEmployeeAction.bind(null, employee?.id ?? null), null);
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.message && <Alert kind="success">{state.message}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="名前（打刻画面に表示）">
          <Input name="name" defaultValue={employee?.name} required maxLength={30} />
        </Field>
        <Field label="ふりがな" hint="並び順に使用">
          <Input name="kana" defaultValue={employee?.kana} />
        </Field>
        <Field label="雇用区分">
          <Select name="employmentType" defaultValue={employee?.employmentType ?? "PART"}>
            <option value="PART">アルバイト</option>
            <option value="FULL">正社員</option>
            <option value="OTHER">その他</option>
          </Select>
        </Field>
        <Field label="表示順" hint="小さいほど先に表示">
          <Input name="sortOrder" type="number" defaultValue={employee?.sortOrder ?? 0} />
        </Field>
        <Field label="時給（円）" hint="給与目安（Phase 4）に使用。任意">
          <Input name="hourlyWage" type="number" min={0} defaultValue={employee?.hourlyWage ?? ""} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="基本 最大日数/月" hint="月次条件の初期値">
            <Input name="baseMaxDays" type="number" min={0} max={31} defaultValue={employee?.baseMaxDays ?? ""} />
          </Field>
          <Field label="基本 最低日数/月">
            <Input name="baseMinDays" type="number" min={0} max={31} defaultValue={employee?.baseMinDays ?? ""} />
          </Field>
        </div>
      </div>
      <Field label="メモ（恒常的な情報）">
        <Textarea name="note" rows={3} defaultValue={employee?.note} />
      </Field>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="active" defaultChecked={employee?.active ?? true} className="h-5 w-5" />
        在籍中（外すと打刻画面・シフト対象から外れます。勤怠データは残ります）
      </label>
      <Button type="submit" disabled={pending}>{employee ? "保存" : "登録"}</Button>
    </form>
  );
}

export function PinForm({ employeeId, hasPin }: { employeeId: string; hasPin: boolean }) {
  const [state, action, pending] = useActionState(setPinAction.bind(null, employeeId), null);
  return (
    <form action={action} className="space-y-3">
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.message && <Alert kind="success">{state.message}</Alert>}
      <p className="text-sm text-slate-600">
        現在：{hasPin ? "PINあり（打刻時に4桁入力）" : "PINなし（名前タップだけで打刻）"}
      </p>
      <div className="flex gap-2">
        <Input name="pin" inputMode="numeric" pattern="\d{4}|" maxLength={4} placeholder="4桁の数字（空欄で解除）" className="max-w-56" />
        <Button type="submit" variant="secondary" disabled={pending}>設定</Button>
      </div>
    </form>
  );
}
