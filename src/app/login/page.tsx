import Link from "next/link";
import { connection } from "next/server";

import { redirectAuthenticatedUser } from "@/app/auth-actions";
import { AccessForm } from "@/components/access-form";

export default async function LoginPage() {
  await connection();
  await redirectAuthenticatedUser();

  return (
    <main className="access-page">
      <section className="access-card">
        <p className="eyebrow">POS@PRO · Staff access</p>
        <h1>เข้าสู่ระบบร้าน</h1>
        <p>ใช้บัญชีและ PIN ของคุณเพื่อเข้าถึงหน้าจอตามสิทธิ์ที่ได้รับ</p>
        <AccessForm mode="login" />
        <Link className="access-link" href="/access/claim">เพิ่งตั้งค่าร้านครั้งแรก? เปิดใช้บัญชีเจ้าของ</Link>
      </section>
    </main>
  );
}
