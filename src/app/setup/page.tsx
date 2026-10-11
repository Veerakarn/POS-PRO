import { connection } from "next/server";
import { redirect } from "next/navigation";

import { InitialSetupForm } from "@/components/initial-setup-form";
import { db } from "@/lib/db";

export default async function SetupPage() {
  await connection();

  const organization = await db.organization.findFirst({ select: { id: true } });
  if (organization) redirect("/dashboard");

  return (
    <main className="setup-page">
      <section className="setup-intro">
        <p className="eyebrow">POS@PRO · First-time setup</p>
        <h1>เริ่มจากร้านและ<br />สาขาแรกของคุณ</h1>
        <p>ข้อมูลนี้เป็นรากของสิทธิ์พนักงาน โต๊ะ เมนู จุดผลิต สต็อก และรายงานทั้งระบบ</p>
        <div className="setup-steps" aria-label="ลำดับการเริ่มใช้งาน">
          <span className="current">1. สร้างร้าน</span>
          <span>2. เพิ่มเมนูและโต๊ะ</span>
          <span>3. เปิดรับออเดอร์</span>
        </div>
      </section>
      <section className="setup-card">
        <div className="setup-card-heading">
          <p className="eyebrow">ตั้งค่าเริ่มต้น</p>
          <h2>รายละเอียดร้าน</h2>
          <p>คุณแก้ไขและเพิ่มสาขาได้ภายหลังจากหน้า Back Office</p>
        </div>
        <InitialSetupForm requiresSetupToken={process.env.NODE_ENV === "production"} />
      </section>
    </main>
  );
}
