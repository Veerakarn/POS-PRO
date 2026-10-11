import { redirect } from "next/navigation";
import { connection } from "next/server";

import { redirectAuthenticatedUser } from "@/app/auth-actions";
import { AccessForm } from "@/components/access-form";
import { db } from "@/lib/db";

export default async function ClaimOwnerAccessPage() {
  await connection();
  await redirectAuthenticatedUser();

  const ownerWaitingForPin = await db.user.findFirst({
    where: {
      pinHash: null,
      isActive: true,
      roleAssignments: {
        some: {
          role: {
            name: "Owner",
          },
        },
      },
    },
    select: { id: true },
  });

  if (!ownerWaitingForPin) redirect("/login");

  return (
    <main className="access-page">
      <section className="access-card">
        <p className="eyebrow">POS@PRO · Owner access</p>
        <h1>เปิดใช้บัญชีเจ้าของ</h1>
        <p>กำหนด PIN สำหรับบัญชีที่สร้างไว้ตอนตั้งค่าร้าน เพื่อใช้เข้า Back Office และจัดการสาขา</p>
        <AccessForm mode="claim" requiresSetupToken={process.env.NODE_ENV === "production"} />
      </section>
    </main>
  );
}
