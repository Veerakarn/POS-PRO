import { redirect } from "next/navigation";
import { connection } from "next/server";

import { CategoryForm, MenuItemForm } from "@/components/menu-forms";
import { MenuItemEditor } from "@/components/menu-item-editor";
import { AppShell } from "@/components/app-shell";
import { requireOrganizationPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatBaht } from "@/lib/demo-data";

export default async function MenuPage() {
  await connection();
  const user = await requireOrganizationPermission("menu.manage");
  const organization = await db.organization.findUnique({
    where: { id: user.organizationId },
    select: {
      name: true,
      branches: {
        take: 1,
        orderBy: { createdAt: "asc" },
        select: { name: true },
      },
      categories: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          _count: { select: { menuItems: { where: { isActive: true } } } },
        },
      },
      menuItems: {
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          categoryId: true,
          name: true,
          description: true,
          priceSatang: true,
          sku: true,
          imageUrl: true,
          category: { select: { name: true } },
        },
      },
    },
  });
  if (!organization) redirect("/setup");

  return (
    <AppShell branchName={organization.branches[0]?.name} organizationName={organization.name} userName={user.displayName}>
      <main className="branch-page menu-page">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">Back Office · เมนูกลาง</p>
            <h1>หมวดหมู่และเมนู</h1>
            <p className="page-description">เมนูชุดเดียวใช้ได้ทุกสาขา แล้วกำหนดจุดครัวหรือบาร์รายสาขาในขั้นตอนถัดไป</p>
          </div>
        </header>
        <section className="menu-admin-grid">
          <article className="branch-panel">
            <div className="panel-heading"><div><p className="eyebrow">หมวดหมู่</p><h2>{organization.categories.length} หมวด</h2></div></div>
            <div className="category-summary-list">
              {organization.categories.length ? organization.categories.map((category) => (
                <div className="category-summary" key={category.id}><strong>{category.name}</strong><span>{category._count.menuItems} เมนู</span></div>
              )) : <p className="empty-state">ยังไม่มีหมวดหมู่ เริ่มเพิ่มหมวดแรกได้ด้านล่าง</p>}
            </div>
            <CategoryForm />
          </article>
          <aside className="branch-create-card">
            <p className="eyebrow">เพิ่มเมนู</p>
            <h2>รายการอาหารใหม่</h2>
            <p>ราคาเก็บเป็นสตางค์เพื่อคำนวณบิลได้แม่นยำ และจะแสดงใน QR Ordering เมื่อเปิดใช้งาน</p>
            <MenuItemForm categories={organization.categories.map(({ id, name }) => ({ id, name }))} />
          </aside>
        </section>
        <section className="menu-admin-list">
          <div className="panel-heading"><div><p className="eyebrow">เมนูในระบบ</p><h2>{organization.menuItems.length} รายการ</h2></div></div>
          {organization.menuItems.length ? <div className="admin-menu-grid">
            {organization.menuItems.map((item) => (
              <article className="admin-menu-card" key={item.id}>
                <div className="admin-menu-art">{item.imageUrl ? (
                  // External image URLs are supplied by the restaurant as well as local uploads.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt={item.name} src={item.imageUrl} loading="lazy" width={360} height={180} />
                ) : "🍽️"}</div>
                <div><span>{item.category.name}</span><h3>{item.name}</h3><p>{item.description || "ไม่มีคำอธิบาย"}</p></div>
                <footer><small>{item.sku || "ไม่มี SKU"}</small><strong>{formatBaht(item.priceSatang)}</strong></footer>
                <MenuItemEditor
                  categories={organization.categories.map(({ id, name }) => ({ id, name }))}
                  item={item}
                />
              </article>
            ))}
          </div> : <p className="empty-state">เมื่อเพิ่มเมนู รายการจะแสดงที่นี่และพร้อมส่งไปยังหน้าสั่งอาหารผ่าน QR</p>}
        </section>
      </main>
    </AppShell>
  );
}
