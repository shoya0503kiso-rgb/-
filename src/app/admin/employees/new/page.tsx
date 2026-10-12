import { Card, PageHeader } from "@/components/ui";
import { EmployeeForm } from "../EmployeeForm";

export default function NewEmployeePage() {
  return (
    <>
      <PageHeader title="従業員を追加" />
      <Card>
        <EmployeeForm />
      </Card>
    </>
  );
}
