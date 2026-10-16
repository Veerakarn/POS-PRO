import Link from "next/link";
import { connection } from "next/server";

import { redirectAuthenticatedUser } from "@/app/auth-actions";
import { InitialSetupForm } from "@/components/initial-setup-form";

export default async function RegisterPage() {
  await connection();
  await redirectAuthenticatedUser();

  return (
    <main className="setup-page">
      <section className="setup-intro">
        <p className="eyebrow">POS@PRO · เริ่มต้นร้านของคุณ</p>
        <h1>สร้างบัญชีเจ้าของ<br />พร้อมเปิดร้านใหม่</h1>
        <p>สมัครด้วยอีเมลและ PIN ของคุณ พร้อมสร้างร้านและสาขาแรก ข้อมูลและพนักงานของแต่ละร้านแยกจากกัน</p>
        <div className="setup-steps" aria-label="ลำดับการเริ่มใช้งาน">
          <span className="current">1. สร้างบัญชีและร้าน</span>
          <span>2. เพิ่มเมนูและโต๊ะ</span>
          <span>3. เปิดรับออเดอร์</span>
        </div>
      </section>
      <section className="setup-card">
        <div className="setup-card-heading">
          <p className="eyebrow">สำหรับเจ้าของร้านใหม่</p>
          <h2>บัญชีและรายละเอียดร้าน</h2>
          <p>เมื่อสมัครสำเร็จ คุณจะเข้าสู่ Back Office ของร้านใหม่ทันที และเพิ่มพนักงานได้ภายหลัง</p>
        </div>
        <InitialSetupForm mode="register" />
        <Link className="access-link" href="/login">มีบัญชีแล้ว? เข้าสู่ระบบ</Link>
      </section>
    </main>
  );
}
