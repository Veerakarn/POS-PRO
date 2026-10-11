import { AppShell } from "@/components/app-shell";
import { requireAuthenticatedUser } from "@/lib/auth";

export default async function NoAccessPage() {
  const user = await requireAuthenticatedUser();

  return (
    <AppShell userName={user.displayName}>
      <main className="branch-page">
        <section className="empty-request-state">
          <span>!</span>
          <h1>บัญชีนี้ยังไม่มีสิทธิ์สำหรับหน้านี้</h1>
          <p>ติดต่อเจ้าของร้านหรือผู้ดูแล เพื่อกำหนดบทบาทและสาขาที่คุณรับผิดชอบ</p>
        </section>
      </main>
    </AppShell>
  );
}
