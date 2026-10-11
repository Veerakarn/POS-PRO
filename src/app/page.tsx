import Link from "next/link";

import { AppShell } from "@/components/app-shell";

const modules = [
  {
    href: "/pos",
    eyebrow: "Front of house",
    title: "Counter POS",
    description: "เปิดโต๊ะ รับออเดอร์ เช็กบิล และรับชำระเงินจากจุดเดียว",
    icon: "▦",
  },
  {
    href: "/q/demo/a01",
    eyebrow: "Customer experience",
    title: "QR Ordering",
    description: "ประสบการณ์สั่งอาหารที่ตอบสนองทั้งโทรศัพท์และแท็บเล็ต",
    icon: "⌁",
  },
  {
    href: "/dashboard",
    eyebrow: "Owner & manager",
    title: "Back office",
    description: "ภาพรวมสาขา เมนู จุดผลิต และความพร้อมของระบบ",
    icon: "◒",
  },
];

export default function HomePage() {
  return (
    <AppShell>
      <main className="home-page">
        <section className="hero">
          <div>
            <p className="eyebrow">Restaurant operations, built to scale</p>
            <h1>ทุกจังหวะของร้าน<br />อยู่ในระบบเดียว</h1>
            <p className="hero-copy">
              POS@PRO เชื่อมการสั่งอาหารจาก QR หน้าร้าน ครัว บาร์ งานพิมพ์ และข้อมูลของทุกสาขาเข้าด้วยกัน
            </p>
            <div className="hero-actions">
              <Link className="primary-button" href="/pos">เปิด Counter POS</Link>
              <Link className="secondary-button" href="/q/demo/a01">ดู QR Ordering</Link>
            </div>
          </div>
          <div className="hero-stat-card">
            <div className="stat-label"><span className="live-dot" /> ระบบออนไลน์</div>
            <div className="hero-stat"><strong>3</strong><span>ช่องทางการทำงาน</span></div>
            <div className="hero-stat"><strong>∞</strong><span>สาขาและจุดผลิต</span></div>
            <p>ออกแบบสำหรับ Neon, realtime events และเครื่องพิมพ์ภายในร้าน</p>
          </div>
        </section>

        <section className="module-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Milestone 1</p>
              <h2>จุดเริ่มต้นของการทำงานจริง</h2>
            </div>
            <p>โครงหน้าจอและ schema พร้อมขยายสู่ข้อมูลจริงจาก Neon</p>
          </div>
          <div className="module-grid">
            {modules.map((module) => (
              <Link className="module-card" href={module.href} key={module.title}>
                <span className="module-icon">{module.icon}</span>
                <p className="eyebrow">{module.eyebrow}</p>
                <h3>{module.title}</h3>
                <p>{module.description}</p>
                <span className="card-arrow">เปิดหน้าจอ →</span>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </AppShell>
  );
}
