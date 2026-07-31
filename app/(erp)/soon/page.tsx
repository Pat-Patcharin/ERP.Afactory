"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Card, Empty } from "@/components/ui";

function SoonBody() {
  const module = useSearchParams().get("m") ?? "โมดูลนี้";
  return (
    <Card className="mx-auto max-w-2xl">
      <Empty
        icon="clock"
        heading={`${module} — อยู่ระหว่างพัฒนา`}
        message="โมดูลนี้ยังไม่ถูกสร้างในเฟสนี้ ระบบจะเปิดใช้งานใน Phase ถัดไป"
      />
    </Card>
  );
}

/** Named placeholder — better than a 404 for a module the roadmap covers. */
export default function SoonPage() {
  return (
    <main className="px-6 py-12 max-md:px-4">
      <Suspense fallback={null}>
        <SoonBody />
      </Suspense>
    </main>
  );
}
