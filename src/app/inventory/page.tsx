import { randomUUID } from "node:crypto";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { IngredientForm, IngredientToggle, StockMovementForm, StockThresholdForm, InventoryRefreshButton } from "@/components/inventory-forms";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { inventoryScope } from "@/lib/inventory-access";
import { costBaht, stockNumber, unitLabels, movementLabels } from "@/lib/inventory-labels";

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ branch?: string; q?: string; page?: string; archived?: string }> }) {
  await connection();
  const [user, params] = await Promise.all([requirePermission("inventory.manage"), searchParams]);
  const scope = inventoryScope(user);
  const [organization, branches] = await Promise.all([
    db.organization.findUnique({ where: { id: user.organizationId }, select: { name: true } }),
    db.branch.findMany({ where: { organizationId: user.organizationId, ...(!scope.canManageShared ? { id: { in: scope.branchIds } } : {}) }, orderBy: { createdAt: "asc" } }),
  ]);
  if (!organization) redirect("/setup");
  const branch = branches.find((item) => item.id === params.branch) ?? branches[0];
  if (!branch) return <AppShell userName={user.displayName}><main className="branch-page"><h1>ยังไม่มีสาขาที่จัดการสต็อกได้</h1><Link href="/settings/branches">ไปหน้าจัดการสาขา</Link></main></AppShell>;
  const page = Math.min(10000, Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1));
  const [ingredients, movements, movementCount, missingRecipes] = await Promise.all([
    db.ingredient.findMany({ where: { organizationId: user.organizationId }, include: { balances: { where: { branchId: branch.id } } }, orderBy: { name: "asc" } }),
    db.stockMovement.findMany({ where: { branchId: branch.id }, include: { ingredient: { select: { name: true, unit: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 30, skip: (page - 1) * 30 }),
    db.stockMovement.count({ where: { branchId: branch.id } }),
    db.menuItem.count({ where: { organizationId: user.organizationId, isActive: true, category: { isActive: true }, recipeItems: { none: {} } } }),
  ]);
  const active = ingredients.filter((item) => item.isActive);
  const visible = ingredients.filter((item) => (params.archived === "1" ? !item.isActive : item.isActive) && item.name.toLowerCase().includes((params.q ?? "").toLowerCase()));
  const lowStock = active.filter((item) => (item.balances[0]?.quantity ?? new Prisma.Decimal(0)).lte(item.balances[0]?.lowStockThreshold ?? 0));
  const unknown = active.filter((item) => item.balances[0]?.averageCostSatang == null);
  const stockValue = active.reduce((sum, item) => {
    const balance = item.balances[0];
    return balance?.averageCostSatang == null ? sum : sum.plus(Prisma.Decimal.max(balance.quantity, 0).times(balance.averageCostSatang));
  }, new Prisma.Decimal(0));
  const branchUrl = `/inventory?branch=${encodeURIComponent(branch.id)}`;
  const options = active.map(({ id, name, unit }) => ({ id, name, unit }));

  return <AppShell branchName={branch.name} organizationName={organization.name} userName={user.displayName}>
    <main className="branch-page inventory-page">
      <header className="dashboard-header"><div><p className="eyebrow">วัตถุดิบและสต็อก</p><h1>คลังของ {branch.name}</h1><p className="page-description">รับสินค้า ตรวจนับ และติดตามวัตถุดิบที่ใช้ไป</p></div><div className="inventory-actions"><InventoryRefreshButton /><Link className="primary-button compact" href={`/inventory/recipes?branch=${branch.id}`}>สูตรอาหารและต้นทุน</Link></div></header>
      <nav className="branch-switcher" aria-label="เลือกสาขาสต็อก">{branches.map((item) => <Link key={item.id} href={`/inventory?branch=${item.id}`} className={`filter-button ${item.id === branch.id ? "active" : ""}`}>{item.name}</Link>)}</nav>
      <section className="inventory-metrics" aria-label="ภาพรวมสต็อก">
        <article><span>วัตถุดิบที่ใช้งาน</span><strong>{active.length}</strong></article>
        <article><span>ถึงจุดเตือน / ติดลบ</span><strong>{lowStock.length}</strong></article>
        <article><span>มูลค่าคงเหลือที่มีต้นทุน</span><strong>{costBaht(stockValue.toString())}</strong><small>ยังไม่มีต้นทุน {unknown.length} รายการ · ไม่รวมยอดติดลบ</small></article>
      </section>
      <p className="configuration-notice">เมนูที่ผูกสูตรจะตัดสต็อกทันทีเมื่อส่งออเดอร์ใหม่จาก QR หรือเคาน์เตอร์ แม้ยอดไม่พอก็ยังขายได้และจะแสดงสต็อกติดลบให้ตรวจสอบ · ยังมีเมนูไม่มีสูตร {missingRecipes} รายการ</p>
      <div className="inventory-layout">
        <div className="inventory-main-column">
        <section className="inventory-panel">
          <header className="inventory-section-heading"><h2>วัตถุดิบคงเหลือ</h2><Link href={`${branchUrl}${params.archived === "1" ? "" : "&archived=1"}`}>{params.archived === "1" ? "ดูที่ใช้งาน" : "ดูที่ปิดใช้งาน"}</Link></header>
          <form className="inventory-search" method="get"><input type="hidden" name="branch" value={branch.id} /><input type="hidden" name="archived" value={params.archived ?? ""} /><label className="sr-only" htmlFor="ingredient-search">ค้นหาวัตถุดิบ</label><input id="ingredient-search" name="q" defaultValue={params.q} placeholder="ค้นหาชื่อวัตถุดิบ" maxLength={100} /><button className="secondary-button" type="submit">ค้นหา</button></form>
          {visible.length === 0 && <div className="inventory-empty-state">
            <span aria-hidden="true">+</span>
            <strong>{params.q ? "ไม่พบวัตถุดิบที่ตรงกับคำค้น" : params.archived === "1" ? "ยังไม่มีวัตถุดิบที่ปิดใช้งาน" : "ยังไม่มีวัตถุดิบในคลัง"}</strong>
            <p>{params.q ? "ลองค้นหาด้วยคำอื่น หรือล้างคำค้นเพื่อดูรายการทั้งหมด" : params.archived === "1" ? "วัตถุดิบที่ปิดใช้งานจะแสดงในรายการนี้" : "เพิ่มวัตถุดิบก่อน แล้วจึงบันทึกรับสินค้าเข้าคลัง"}</p>
            {params.q ? <Link className="secondary-button compact" href={branchUrl}>ล้างคำค้น</Link> : scope.canManageShared && params.archived !== "1" ? <Link className="secondary-button compact" href="#add-ingredient">เริ่มเพิ่มวัตถุดิบ</Link> : null}
          </div>}
          <div className="ingredient-list">{visible.map((item) => {
            const balance = item.balances[0];
            const quantity = balance?.quantity ?? new Prisma.Decimal(0);
            const low = quantity.lte(balance?.lowStockThreshold ?? 0);
            const priceUnit = item.unit === "PIECE" ? 1 : 1000;
            return <article className="ingredient-card" key={item.id}>
              <div className="ingredient-heading"><div><h3>{item.name}</h3><small>{balance?.averageCostSatang != null ? `ทุนเฉลี่ย ${costBaht(balance.averageCostSatang.times(priceUnit).toString())} / ${priceUnit === 1000 ? "1,000 " : "1 "}${unitLabels[item.unit]}` : "ยังไม่มีราคาทุน · รับเข้าพร้อมต้นทุนเพื่อเริ่มคำนวณ"}</small></div>
                <div className={low ? "stock-quantity low" : "stock-quantity"}><strong>{stockNumber(quantity.toString())}</strong><span>{unitLabels[item.unit]}</span>{low && <small>{quantity.lt(0) ? "ยอดติดลบ" : "ถึงจุดเตือน"}</small>}</div>
              </div>
              <details><summary>แก้ไข / จุดเตือน / สถานะ</summary><div className="ingredient-settings">
                {item.isActive && <StockThresholdForm key={balance?.lowStockThreshold.toString() ?? "0"} branchId={branch.id} ingredientId={item.id} threshold={balance?.lowStockThreshold.toString() ?? "0"} unit={unitLabels[item.unit]} />}
                {scope.canManageShared ? <><IngredientForm key={item.name} ingredient={{ id: item.id, name: item.name, unit: item.unit }} /><IngredientToggle id={item.id} active={item.isActive} /></> : <small>ชื่อและสถานะวัตถุดิบเป็นข้อมูลกลาง ให้ผู้ดูแลทุกสาขาแก้ไข</small>}
              </div></details>
            </article>;
          })}</div>
        </section>
        {scope.canManageShared && <section className="inventory-panel" id="add-ingredient"><p className="eyebrow">เริ่มต้นคลัง</p><h2>เพิ่มวัตถุดิบ</h2><p>ชื่อและหน่วยใช้ร่วมกันทุกสาขา ส่วนยอดและราคาทุนแยกตามสาขา</p><IngredientForm /></section>}
        </div>
          <aside className="inventory-sidebar"><section className="inventory-panel"><h2>บันทึกสต็อก</h2><p>สาขา {branch.name} · ใช้หน่วยหลักเดียวกับสูตรอาหาร</p><StockMovementForm key={branch.id} branchId={branch.id} ingredients={options} requestId={randomUUID()} /></section>
        </aside>
      </div>
      <section className="inventory-panel inventory-history"><h2>ประวัติการเคลื่อนไหว</h2><p>เรียงจากล่าสุด · แก้ยอดผ่านรายการตรวจนับพร้อมเหตุผล ประวัติเดิมจะยังอยู่</p>
        {movements.length ? <div className="inventory-table-wrap"><table className="inventory-table"><thead><tr><th>เวลา / ผู้บันทึก</th><th>วัตถุดิบ</th><th>ประเภท / อ้างอิง</th><th>เปลี่ยนแปลง</th><th>คงเหลือหลังรายการ</th><th>ต้นทุนรายการ</th></tr></thead><tbody>
          {movements.map((movement) => <tr key={movement.id}>
            <td>{movement.createdAt.toLocaleString("th-TH", { timeZone: branch.timezone, dateStyle: "short", timeStyle: "short" })}<small>{movement.actorName ?? "ระบบออเดอร์"}</small></td>
            <td>{movement.ingredient.name}<small>{unitLabels[movement.ingredient.unit]}</small></td>
            <td>{movementLabels[movement.type]}<small>{movement.reason}</small></td>
            <td>{movement.quantity.gt(0) ? "+" : ""}{stockNumber(movement.quantity.toString())}</td>
            <td>{stockNumber(movement.balanceAfter.toString())}</td>
            <td>{movement.receiptCostSatang != null ? costBaht(movement.receiptCostSatang) : movement.unitCostSatang != null ? costBaht(movement.quantity.abs().times(movement.unitCostSatang).toString()) : "ยังไม่ทราบ"}</td>
          </tr>)}
        </tbody></table></div> : <p className="empty-state">ยังไม่มีรายการเคลื่อนไหว</p>}
        <nav className="inventory-actions" aria-label="หน้าประวัติ">{page > 1 && <Link className="secondary-button" href={`${branchUrl}&page=${page - 1}`}>ก่อนหน้า</Link>}<span>หน้า {page} · ทั้งหมด {movementCount} รายการ</span>{page * 30 < movementCount && <Link className="secondary-button" href={`${branchUrl}&page=${page + 1}`}>ถัดไป</Link>}</nav>
      </section>
    </main>
  </AppShell>;
}
