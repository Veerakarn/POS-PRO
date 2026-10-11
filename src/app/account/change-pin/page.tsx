import Link from "next/link";
import { connection } from "next/server";

import { logout } from "@/app/auth-actions";
import { ChangePinForm } from "@/components/change-pin-form";
import { defaultLandingRoute, requireAuthenticatedUser } from "@/lib/auth";

export default async function ChangePinPage() {
  await connection();
  const user = await requireAuthenticatedUser({ allowMustChangePin: true });

  return (
    <main className="access-page">
      <section className="access-card">
        <p className="eyebrow">POS@PRO · ความปลอดภัย</p>
        <h1>{user.mustChangePin ? "ตั้ง PIN ส่วนตัว" : "เปลี่ยน PIN"}</h1>
        <p>
          {user.mustChangePin
            ? "นี่เป็นการเข้าใช้ครั้งแรก กรุณาเปลี่ยน PIN ชั่วคราวก่อนเริ่มงาน"
            : "ยืนยัน PIN ปัจจุบัน แล้วตั้ง PIN ใหม่เป็นตัวเลข 6 หลัก"}
        </p>
        <ChangePinForm />
        {!user.mustChangePin ? (
          <Link className="access-link" href={defaultLandingRoute(user)}>กลับหน้าทำงาน</Link>
        ) : null}
        <form action={logout}>
          <button className="access-link link-button" type="submit">ออกจากบัญชีนี้</button>
        </form>
      </section>
    </main>
  );
}
