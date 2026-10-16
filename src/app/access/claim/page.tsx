import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { redirectAuthenticatedUser } from "@/app/auth-actions";
import { AccessForm } from "@/components/access-form";
import { getAccessSetupStatus } from "@/lib/access-setup";

export default async function ClaimOwnerAccessPage() {
  await connection();
  await redirectAuthenticatedUser();

  const setupStatus = await getAccessSetupStatus();
  if (setupStatus === "setup") redirect("/register");

  return (
    <main className="access-page">
      <section className="access-card">
        <p className="eyebrow">POS@PRO · Owner access</p>
        {setupStatus === "claim" ? (
          <>
            <h1>เปิดใช้บัญชีเจ้าของ</h1>
            <p>กำหนด PIN สำหรับบัญชีที่สร้างไว้ตอนตั้งค่าร้าน เพื่อใช้เข้า Back Office และจัดการสาขา</p>
            <AccessForm mode="claim" requiresSetupToken={process.env.NODE_ENV === "production"} />
          </>
        ) : (
          <>
            <h1>ไม่มีบัญชีเจ้าของที่รอเปิดใช้</h1>
            <p>หากมีบัญชีแล้ว ให้เข้าสู่ระบบด้วยอีเมลและ PIN ที่ตั้งไว้ หากต้องการเปิดร้านใหม่ สามารถสร้างบัญชีและร้านของคุณได้เลย</p>
            <Link className="primary-button" href="/register">สร้างบัญชีและร้านใหม่</Link>
          </>
        )}
        <Link className="access-link" href="/login">กลับไปเข้าสู่ระบบ</Link>
      </section>
    </main>
  );
}
