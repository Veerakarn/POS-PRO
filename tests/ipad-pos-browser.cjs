require("@next/env").loadEnvConfig(process.cwd());
const { PrismaClient } = require("@prisma/client");
const { createHash, randomBytes, randomUUID } = require("node:crypto");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const db = new PrismaClient();
const output = path.resolve("docs/ipad-pos-ui");
const results = [], errors = [];
let org, browser, page;
const visible = (locator) => locator.waitFor({ state: "visible", timeout: 90_000 });
const pass = (message) => { results.push(message); console.log(`PASS ${message}`); };
async function noOverflow(label) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${label}: horizontal overflow`);
}
async function shot(name) { await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }); await page.screenshot({ path: path.join(output, `${name}.png`) }); }

async function run() {
  await fs.mkdir(output, { recursive: true });
  const suffix = randomUUID();
  org = await db.organization.create({ data: {
    name: "บ้านอิ่มอร่อย", slug: `ipad-pos-${suffix}`,
    users: { create: { email: `ipad-${suffix}@example.test`, displayName: "พนักงานทดสอบ" } },
    roles: { create: { name: "พนักงานหน้าร้าน", permissions: ["pos.use", "service.manage", "payment.manage", "report.view", "inventory.manage", "table.manage", "menu.manage", "printer.manage", "branch.manage", "user.manage"] } },
    branches: { create: { name: "สาขาสุขุมวิท", code: "TEST", tables: { create: Array.from({ length: 12 }, (_, i) => ({ name: `A${String(i + 1).padStart(2, "0")}`, code: `T${String(i + 1).padStart(2, "0")}`, capacity: i % 3 === 0 ? 4 : 2, qrSecret: randomUUID() })) } } },
    categories: { create: [{ name: "อาหารจานเดียว", sortOrder: 1 }, { name: "ของทานเล่น", sortOrder: 2 }, { name: "เครื่องดื่ม", sortOrder: 3 }] },
  }, include: { users: true, roles: true, categories: { orderBy: { sortOrder: "asc" } }, branches: { include: { tables: { orderBy: { code: "asc" } } } } } });
  const branch = org.branches[0], tables = branch.tables;
  await db.roleAssignment.create({ data: { userId: org.users[0].id, roleId: org.roles[0].id, branchId: branch.id } });
  const dishes = [
    ["ข้าวกะเพราหมูสับ", 8500, "หอมใบกะเพรา ผัดร้อนจากกระทะ", 0],
    ["ข้าวผัดกุ้ง", 9500, "ข้าวหอมมะลิ กุ้งสดเนื้อแน่น", 0],
    ["ข้าวไก่ทอดซอสมะนาว", 8900, "ไก่ทอดกรอบ เสิร์ฟพร้อมซอสมะนาว", 0],
    ["สปาเกตตีพริกแห้ง", 12900, "ผัดกระเทียมและพริกแห้งหอม ๆ", 0],
    ["เฟรนช์ฟรายส์", 6500, "ทอดกรอบ โรยเกลือเล็กน้อย", 1],
    ["ปีกไก่ทอด", 8900, "หมักเครื่องเทศ ทอดจนเหลืองกรอบ", 1],
    ["ชาไทยเย็น", 5500, "ชาไทยหอมเข้มข้น หวานกำลังดี", 2],
    ["อเมริกาโน่เย็น", 6500, "กาแฟคั่วกลาง หอมสดชื่น", 2],
    ["น้ำมะนาวโซดา", 6000, "มะนาวสดกับโซดาซ่า ๆ", 2],
  ];
  const menus = await db.$transaction(dishes.map(([name, priceSatang, description, category]) => db.menuItem.create({ data: { organizationId: org.id, categoryId: org.categories[category].id, name, priceSatang, description } })));
  await db.$transaction(tables.slice(0, 3).map((table, i) => db.tableSession.create({ data: {
    branchId: branch.id, tableId: table.id, status: i === 2 ? "CHECK_REQUESTED" : "OPEN", accessNonce: randomUUID(),
    orders: { create: { branchId: branch.id, orderNumber: i + 1, idempotencyKey: randomUUID(), status: "SUBMITTED", source: "COUNTER", items: { create: [{ menuItemId: menus[0].id, nameSnapshot: menus[0].name, priceSatang: menus[0].priceSatang, quantity: 2, status: i === 1 ? "PREPARING" : "SERVED" }, { menuItemId: menus[6].id, nameSnapshot: menus[6].name, priceSatang: menus[6].priceSatang, quantity: 2, status: "SERVED" }] } } },
  } })));
  const token = randomBytes(32).toString("base64url");
  await db.session.create({ data: { userId: org.users[0].id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 30 * 60_000) } });
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({ viewport: { width: 1194, height: 834 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  await context.addCookies([{ name: "pospro_session", value: token, url: "http://localhost:3000", httpOnly: true, sameSite: "Lax" }]);
  page = await context.newPage();
  page.setDefaultTimeout(60_000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://localhost:3000/pos/${branch.id}`, { timeout: 120_000 });
  await visible(page.getByRole("heading", { name: "เคาน์เตอร์" }));
  assert.equal(await page.locator(".table-card").count(), 12);
  await visible(page.locator(".pos-order-panel"));
  await noOverflow("1194x834 table view");
  assert.ok((await page.locator(".pos-filter-toggle").boundingBox()).height >= 44);
  const searchBounds = await page.locator(".pos-board-tools .pos-search").boundingBox();
  const filterBounds = await page.locator(".pos-filter-toggle").boundingBox();
  assert.ok(Math.abs(searchBounds.y - filterBounds.y) < 2, "search and filter must share one row");
  await visible(page.locator(".counter-active-qr-image img"));
  await shot("tables-landscape");
  pass("iPad landscape: table grid and order detail appear together without overflow");
  assert.equal(await page.locator(".app-sidebar").isVisible(), false);
  const topbar = await page.locator(".topbar").boundingBox();
  assert.ok(topbar.y <= 12 && topbar.height <= 80);
  await page.getByRole("button", { name: "เปิดเมนูหลัก", exact: true }).click();
  await visible(page.getByRole("navigation", { name: "เมนูหลัก", exact: true }));
  const firstLink = await page.locator(".sidebar-link").nth(0).boundingBox();
  const secondLink = await page.locator(".sidebar-link").nth(1).boundingBox();
  assert.ok(firstLink.width >= 150 && secondLink.y >= firstLink.y + firstLink.height);
  await noOverflow("landscape with sidebar open");
  await shot("tables-sidebar-open");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".app-sidebar").isVisible(), false);
  pass("A single white header opens and closes the green left navigation");
  await page.getByRole("searchbox", { name: "ค้นหาโต๊ะ" }).fill("T05");
  assert.equal(await page.locator(".table-card").count(), 1);
  assert.ok((await page.locator(".table-card").innerText()).includes("A05"));
  await page.getByRole("searchbox", { name: "ค้นหาโต๊ะ" }).fill("ไม่พบโต๊ะ");
  await visible(page.getByText("ไม่พบโต๊ะที่ค้นหา", { exact: true }));
  await page.getByRole("button", { name: "แสดงโต๊ะทั้งหมด", exact: true }).click();
  await page.getByRole("button", { name: "กรองสถานะโต๊ะ", exact: true }).click();
  await page.locator(".filter-row").getByRole("button", { name: /^ว่าง/ }).click();
  assert.equal(await page.locator(".table-card").count(), 9);
  await page.locator(".filter-row").getByRole("button", { name: /^ทั้งหมด/ }).click();
  await page.getByRole("button", { name: "กรองสถานะโต๊ะ", exact: true }).click();
  pass("Table search, empty state, reset and status counts work");
  await page.setViewportSize({ width: 834, height: 1194 });
  assert.equal(await page.locator(".pos-view-switch").isVisible(), false);
  assert.equal(await page.locator(".pos-order-panel").isVisible(), true);
  await noOverflow("834x1194 table view");
  await shot("tables-portrait");
  await page.locator(".table-card").filter({ hasText: "A01" }).click();
  await visible(page.locator(".pos-order-panel"));
  assert.equal(await page.locator(".table-board").isVisible(), true);
  await visible(page.getByRole("link", { name: "เพิ่มอาหาร", exact: false }));
  await shot("table-detail-portrait");
  await visible(page.locator(".counter-active-qr"));
  await page.locator(".pos-qr-details > summary").click();
  await page.locator(".pos-qr-details > summary").click();
  await page.getByRole("button", { name: "เปิดเมนูหลัก", exact: true }).click();
  await visible(page.locator(".workspace-menu-backdrop"));
  assert.equal(await page.locator(".app-shell-content").evaluate((element) => element.inert), true);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".workspace-menu-backdrop").isVisible(), false);
  assert.equal(await page.locator(".app-shell-content").evaluate((element) => element.inert), false);
  pass("iPad portrait keeps table and QR details side by side; navigation closes with Escape");
  await page.locator(".table-card").filter({ hasText: "A05" }).click();
  await page.getByRole("button", { name: "เปิดโต๊ะนี้", exact: true }).click();
  await visible(page.getByRole("button", { name: "ปิด QR", exact: true }));
  await page.getByRole("button", { name: "ปิด QR", exact: true }).click();
  await visible(page.getByRole("link", { name: "เพิ่มอาหาร", exact: false }));
  assert.equal(await db.tableSession.count({ where: { tableId: tables[4].id, status: "OPEN" } }), 1);
  pass("Opening a table creates one real session and displays its QR");
  await page.getByRole("link", { name: "เพิ่มอาหาร", exact: false }).click();
  await visible(page.getByRole("heading", { name: "วันนี้รับอะไรดี?", exact: true }));
  await noOverflow("834x1194 menu view");
  assert.equal(await page.locator(".counter-add-menu-item").count(), 9);
  await page.getByRole("searchbox", { name: "ค้นหาเมนู" }).fill("ชาไทย");
  assert.equal(await page.locator(".counter-add-menu-item").count(), 1);
  await page.getByRole("button", { name: "เพิ่ม ชาไทยเย็น", exact: true }).click();
  await page.getByRole("searchbox", { name: "ค้นหาเมนู" }).fill("");
  await page.getByRole("button", { name: /^ของทานเล่น/ }).click();
  assert.equal(await page.locator(".counter-add-menu-item").count(), 2);
  await page.getByRole("button", { name: /^ทั้งหมด/ }).click();
  await page.getByRole("button", { name: "เพิ่ม ข้าวกะเพราหมูสับ", exact: true }).click();
  await page.getByRole("button", { name: "เพิ่มจำนวน ข้าวกะเพราหมูสับ", exact: true }).click();
  assert.ok((await page.locator(".counter-add-cart-total").innerText()).includes("225"));
  const quantity = await page.getByRole("button", { name: "ลดจำนวน ข้าวกะเพราหมูสับ", exact: true }).boundingBox();
  assert.ok(quantity.width >= 44 && quantity.height >= 44);
  await shot("ordering-portrait");
  pass("Menu search and categories preserve cart; 44px quantity buttons update the total");
  await page.setViewportSize({ width: 1194, height: 834 });
  await noOverflow("1194x834 menu view");
  await shot("ordering-landscape");
  assert.equal(await page.locator(".counter-cart-count").innerText(), "3 รายการ");
  const send = page.getByRole("button", { name: "ส่งออเดอร์เข้าครัว", exact: true });
  await send.scrollIntoViewIfNeeded();
  await send.click();
  await page.waitForURL(`**/pos/${branch.id}?table=${tables[4].id}`, { timeout: 120_000 });
  const order = await db.order.findFirst({ where: { branchId: branch.id, tableSession: { tableId: tables[4].id } }, include: { items: true } });
  assert.equal(order.items.length, 2);
  assert.equal(order.items.reduce((sum, item) => sum + item.quantity * item.priceSatang, 0), 22500);
  pass("Real order submission persists 2 dishes / 3 portions at the correct total");
  await page.setViewportSize({ width: 834, height: 1194 });
  await visible(page.locator(".pos-order-panel"));
  await visible(page.locator(".pos-order-line").filter({ hasText: "ข้าวกะเพราหมูสับ" }));
  pass("Returning to the table shows the submitted order in portrait detail view");
  for (const viewport of [{ width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 1366, height: 1024 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await noOverflow(`${viewport.width}x${viewport.height}`);
  }
  pass("No horizontal overflow at 768, 834, 1024, 1194, 1366 and 390px widths");
  assert.deepEqual(errors, []);
  pass("No browser JavaScript errors");
}

run().catch(async (error) => {
  console.error(error);
  if (page) { await shot("failure").catch(() => {}); await fs.writeFile(path.join(output, "failure.txt"), await page.locator("body").innerText().catch(() => "")); }
  process.exitCode = 1;
}).finally(async () => {
  if (page) await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  if (browser) await browser.close();
  if (org) {
    const branchIds = org.branches.map((branch) => branch.id);
    await db.orderItem.deleteMany({ where: { order: { branchId: { in: branchIds } } } });
    await db.order.deleteMany({ where: { branchId: { in: branchIds } } });
    await db.tableSession.deleteMany({ where: { branchId: { in: branchIds } } });
    await db.organization.delete({ where: { id: org.id } });
  }
  await db.$disconnect();
  await fs.writeFile(path.join(output, "results.json"), JSON.stringify({ results, errors, passed: process.exitCode !== 1, timestamp: new Date().toISOString() }, null, 2));
});
