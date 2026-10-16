import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Prisma } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { RecipeForm } from "@/components/inventory-forms";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { inventoryScope } from "@/lib/inventory-access";
import { recipeCost } from "@/lib/inventory-math";
import { costBaht, stockNumber, unitLabels } from "@/lib/inventory-labels";

export default async function RecipesPage({ searchParams }: { searchParams: Promise<{ branch?: string; menu?: string }> }) {
  await connection();
  const [user, params] = await Promise.all([requirePermission("inventory.manage"), searchParams]);
  const scope = inventoryScope(user);
  const [organization, branches, menus] = await Promise.all([
    db.organization.findUnique({ where: { id: user.organizationId }, select: { name: true } }),
    db.branch.findMany({ where: { organizationId: user.organizationId, ...(!scope.canManageShared ? { id: { in: scope.branchIds } } : {}) }, orderBy: { createdAt: "asc" } }),
    db.menuItem.findMany({ where: { organizationId: user.organizationId, isActive: true, category: { isActive: true } }, orderBy: { name: "asc" }, select: { id: true, name: true, priceSatang: true, recipeVersion: true, recipeItems: true } }),
  ]);
  if (!organization) redirect("/setup");
  const branch = branches.find((item) => item.id === params.branch) ?? branches[0];
  if (!branch) redirect("/inventory");
  const menu = menus.find((item) => item.id === params.menu) ?? menus[0];
  const ingredients = await db.ingredient.findMany({ where: { organizationId: user.organizationId, isActive: true }, include: { balances: { where: { branchId: branch.id } } }, orderBy: { name: "asc" } });
  const costs = (menu?.recipeItems ?? []).map((line) => {
    const ingredient = ingredients.find((item) => item.id === line.ingredientId);
    return { ...line, ingredient, cost: ingredient?.balances[0]?.averageCostSatang ?? null };
  });
  const estimate = recipeCost(costs);
  const margin = menu ? new Prisma.Decimal(menu.priceSatang).minus(estimate.knownSatang) : new Prisma.Decimal(0);

  return <AppShell branchName={branch.name} organizationName={organization.name} userName={user.displayName}>
    <main className="branch-page inventory-page">
      <header className="dashboard-header"><div><p className="eyebrow">สูตรและราคาทุน</p><h1>ต้นทุนอาหารต่อ 1 ที่</h1><p className="page-description">สูตรใช้ร่วมกันทุกสาขา · คำนวณจากต้นทุนเฉลี่ยปัจจุบันของ {branch.name}</p></div><Link className="secondary-button" href={`/inventory?branch=${branch.id}`}>กลับหน้าสต็อก</Link></header>
      <form method="get" className="inventory-panel stock-form recipe-picker"><label>สาขาที่ใช้คำนวณต้นทุน<select name="branch" defaultValue={branch.id}>{branches.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>เมนู<select name="menu" defaultValue={menu?.id}>{menus.map((item) => <option key={item.id} value={item.id}>{item.name}{!item.recipeItems.length ? " · ยังไม่มีสูตร" : ""}</option>)}</select></label><button className="primary-button" type="submit">แสดงสูตร</button></form>
      {!menu ? <section className="inventory-panel"><p>ยังไม่มีเมนูอาหาร</p><Link href="/settings/menu">เพิ่มเมนูก่อนสร้างสูตร</Link></section> : <>
        <section className="inventory-metrics"><article><span>ราคาขาย · {menu.name}</span><strong>{costBaht(menu.priceSatang)}</strong></article><article><span>ต้นทุนวัตถุดิบต่อที่</span><strong>{estimate.complete ? costBaht(estimate.knownSatang.toString()) : "ข้อมูลยังไม่ครบ"}</strong>{!estimate.complete && <small>ส่วนที่มีต้นทุนแล้ว {costBaht(estimate.knownSatang.toString())}</small>}</article><article><span>ส่วนต่างราคาขาย − วัตถุดิบ</span><strong>{estimate.complete ? costBaht(margin.toString()) : "—"}</strong><small>ยังไม่หักค่าแรง ค่าเช่า ภาษี และค่าใช้จ่ายอื่น</small></article></section>
        <section className="inventory-panel"><h2>สูตร {menu.name}</h2><p>ระบุปริมาณที่ใช้จริงต่อ 1 จาน / แก้ว เช่น หมู 150 กรัม · สูตรที่แก้จะใช้กับออเดอร์ใหม่ ประวัติการตัดเดิมไม่เปลี่ยน</p>
          {scope.canManageShared ? <RecipeForm key={menu.id} menuItemId={menu.id} version={menu.recipeVersion} lines={menu.recipeItems.map((line) => ({ ingredientId: line.ingredientId, quantity: line.quantity.toString() }))} ingredients={ingredients.map(({ id, name, unit }) => ({ id, name, unit }))} /> : <p>สูตรกลางแก้ไขได้โดยผู้ที่มีสิทธิ์จัดการวัตถุดิบทุกสาขา</p>}
        </section>
        {!!costs.length && <section className="inventory-panel inventory-history"><h2>รายละเอียดต้นทุน</h2><div className="inventory-table-wrap"><table className="inventory-table"><thead><tr><th>วัตถุดิบ</th><th>ปริมาณต่อที่</th><th>ต้นทุนต่อที่</th></tr></thead><tbody>{costs.map((line) => <tr key={line.id}><td>{line.ingredient?.name ?? "วัตถุดิบไม่พร้อมใช้งาน"}</td><td>{stockNumber(line.quantity.toString())} {line.ingredient ? unitLabels[line.ingredient.unit] : ""}</td><td>{line.cost == null ? "ยังไม่มีต้นทุนรับเข้า" : costBaht(line.quantity.times(line.cost).toString())}</td></tr>)}</tbody></table></div></section>}
      </>}
    </main>
  </AppShell>;
}
