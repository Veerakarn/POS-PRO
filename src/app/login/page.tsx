import Link from "next/link";
import { connection } from "next/server";

import { redirectAuthenticatedUser } from "@/app/auth-actions";
import { AccessForm } from "@/components/access-form";

export default async function LoginPage() {
  await connection();
  await redirectAuthenticatedUser();

  return (
    <main className="access-page login-page">
      <div className="login-layout">
        <section aria-label="เกี่ยวกับ POS@PRO" className="login-story">
          <Link className="login-brand" href="/"><span className="brand-mark">P</span><strong>POS@PRO</strong></Link>
          <div className="login-story-content">
            <p className="eyebrow">RESTAURANT WORKSPACE</p>
            <h2>ทุกจังหวะของร้าน<br />อยู่ในหน้าจอเดียว</h2>
            <p>ตั้งแต่เปิดโต๊ะ รับออเดอร์ ไปจนถึงดูรายงาน จัดการงานหน้าร้านได้อย่างต่อเนื่อง</p>
            <div className="login-story-points">
              <span>โต๊ะและออเดอร์</span><span>ครัวและบาร์</span><span>ยอดขายและสต็อก</span>
            </div>
          </div>
          <small>POS@PRO · ระบบจัดการร้านอาหาร</small>
        </section>
        <section className="access-card login-card">
          <p className="eyebrow">ยินดีต้อนรับกลับ</p>
          <h1>เข้าสู่ระบบร้าน</h1>
          <p>ใช้อีเมลและ PIN ของคุณเพื่อเข้าถึงหน้าจอตามสิทธิ์ที่ได้รับ</p>
          <AccessForm mode="login" />
          <Link className="access-link" href="/access/claim">เพิ่งตั้งค่าร้านครั้งแรก? เปิดใช้บัญชีเจ้าของ</Link>
        </section>
      </div>
    </main>
  );
}
