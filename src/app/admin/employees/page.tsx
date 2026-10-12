import Link from "next/link";
import { Badge, Card, Empty, LinkButton, PageHeader, TableWrap, td, th } from "@/components/ui";
import { EMPLOYMENT_TYPES, listEmployees } from "@/server/employees";

export default async function EmployeesPage() {
  const employees = await listEmployees({ includeInactive: true });
  return (
    <>
      <PageHeader title="従業員" description="固定プロフィール（名前・雇用区分・時給・基本条件）。月ごとの条件はシフト画面で設定します。" actions={<LinkButton href="/admin/employees/new">＋ 従業員を追加</LinkButton>} />
      <Card>
        {employees.length === 0 ? (
          <Empty>従業員が登録されていません</Empty>
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>名前</th>
                  <th className={th}>区分</th>
                  <th className={th}>状態</th>
                  <th className={th}>PIN</th>
                  <th className={th}>LINE</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => (
                  <tr key={e.id} className={e.active ? "" : "text-slate-400"}>
                    <td className={td}>
                      <Link href={`/admin/employees/${e.id}`} className="font-medium text-teal-800 underline">{e.name}</Link>
                      {e.kana && <span className="ml-2 text-xs text-slate-500">{e.kana}</span>}
                    </td>
                    <td className={td}>{EMPLOYMENT_TYPES[e.employmentType as keyof typeof EMPLOYMENT_TYPES] ?? e.employmentType}</td>
                    <td className={td}>{e.active ? <Badge color="green">在籍</Badge> : <Badge>退職・休止</Badge>}</td>
                    <td className={td}>{e.pinHash ? "あり" : "—"}</td>
                    <td className={td}>{e.lineAccount ? <Badge color="teal">連携済</Badge> : <span className="text-slate-400">未連携</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </>
  );
}
