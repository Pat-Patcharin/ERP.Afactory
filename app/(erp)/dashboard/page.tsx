import Link from "next/link";
import { Card, Empty } from "@/components/ui";

export default function DashboardPage() {
  return (
    <main className="px-6 py-12 max-md:px-4">
      <Card className="mx-auto max-w-2xl">
        <Empty
          icon="dashboard"
          heading="Dashboard — อยู่ระหว่างพัฒนา"
          message="ระหว่างนี้ใช้ Purchase Workspace เป็นหน้าเริ่มต้นของงานประจำวัน"
          action={
            <Link
              href="/purchase"
              className="inline-flex h-10 items-center rounded-btn bg-primary px-4 font-medium text-white transition-colors hover:bg-primary-hover"
            >
              ไปที่ Purchase Workspace
            </Link>
          }
        />
      </Card>
    </main>
  );
}
