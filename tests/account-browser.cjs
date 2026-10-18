require("@next/env").loadEnvConfig(process.cwd());
const { PrismaClient } = require("@prisma/client");
const { randomUUID, randomBytes, scryptSync } = require("node:crypto");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const db = new PrismaClient();
const output = path.resolve("docs/account-ui-test");
const results = [];
const errors = [];
let browser, org, page;
function passed(name) { results.push(name); console.log(`PASS ${name}`); }
const hash = (pin) => { const salt = randomBytes(16).toString("hex"); return `${salt}:${scryptSync(pin, salt, 64).toString("hex")}`; };
const visible = async (locator) => { await locator.waitFor({ state: "visible", timeout: 60_000 }); };
const settleDrawer = async () => { await page.locator("dialog[open]").evaluate(async (element) => { await Promise.all(element.getAnimations().map((animation) => animation.finished)); }); };

async function run() {
  await fs.mkdir(output, { recursive: true });
  const suffix = randomUUID();
  const email = `account-ui-${suffix}@example.test`;
  org = await db.organization.create({ data: {
    name: "ร้านทดสอบ UI", slug: `account-ui-${suffix}`,
    branches: { create: [{ name: "สาขาทดสอบ", code: "TEST" }, { name: "สาขาที่ไม่มีสิทธิ์", code: "OTHER" }] },
    users: { create: { email, displayName: "ผู้ทดสอบ UI", pinHash: hash("654321") } },
    roles: { create: { name: "UI tester", permissions: ["service.manage"] } },
  }, include: { branches: true, users: true, roles: true } });
  const user = org.users[0];
  const branch = org.branches.find((item) => item.code === "TEST");
  const otherBranch = org.branches.find((item) => item.code === "OTHER");
  await db.roleAssignment.create({ data: { userId: user.id, roleId: org.roles[0].id, branchId: branch.id } });
  for (let i = 1; i <= 12; i++) {
    const table = await db.restaurantTable.create({ data: { branchId: branch.id, name: `โต๊ะทดสอบ ${i}`, code: `T${i}`, qrSecret: randomUUID() } });
    await db.serviceRequest.create({ data: { branchId: branch.id, tableId: table.id, type: i % 2 ? "STAFF_CALL" : "CHECK_BILL" } });
  }
  const hidden = await db.restaurantTable.create({ data: { branchId: otherBranch.id, name: "โต๊ะห้ามเห็น", code: "HIDDEN", qrSecret: randomUUID() } });
  await db.serviceRequest.create({ data: { branchId: otherBranch.id, tableId: hidden.id, type: "STAFF_CALL" } });
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://localhost:3000/login", { timeout: 120_000 });
  async function login(pin) {
    await page.locator('[name="email"]').fill(email);
    await page.locator('[name="pin"]').fill(pin);
    await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  }
  await login("654321");
  await page.waitForURL("**/requests", { timeout: 120_000 });
  await visible(page.locator(".account-trigger"));
  passed("Login renders the new account control");
  await visible(page.locator(".account-badge"));
  assert.equal(await page.locator(".account-badge").innerText(), "9+");
  await page.locator(".account-bell").click();
  await visible(page.getByRole("heading", { name: "การแจ้งเตือน", exact: true }));
  await visible(page.locator(".account-notifications a").first());
  assert.equal(await page.locator(".account-notifications a").count(), 12);
  assert.equal(await page.getByText("โต๊ะห้ามเห็น").count(), 0);
  await settleDrawer();
  await page.screenshot({ path: path.join(output, "notifications-desktop.png") });
  passed("Notification badge shows 9+ and only the 12 permitted branch requests");
  await page.getByRole("button", { name: "ปิดแผง", exact: true }).click();
  await page.locator(".account-trigger").click();
  await visible(page.getByRole("heading", { name: "บัญชีของฉัน", exact: true }));
  await settleDrawer();
  await page.screenshot({ path: path.join(output, "account-desktop.png") });
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("dialog[open]").count(), 0);
  assert.equal(await page.locator(".account-trigger").evaluate((element) => element === document.activeElement), true);
  passed("Drawer opens, Escape closes it and restores focus to the name");
  await page.locator(".account-trigger").click();
  await page.getByRole("button", { name: "แก้ไขโปรไฟล์" }).click();
  const avatar = await sharp({ create: { width: 500, height: 300, channels: 3, background: "#2b855e" } }).png().toBuffer();
  await page.locator('[name="avatar"]').setInputFiles({ name: "test-avatar.png", mimeType: "image/png", buffer: avatar });
  await page.locator('[name="displayName"]').fill("โปรไฟล์ทดสอบใหม่");
  await page.getByRole("button", { name: "บันทึกโปรไฟล์", exact: true }).click();
  await visible(page.getByText("บันทึกโปรไฟล์เรียบร้อยแล้ว", { exact: true }));
  const saved = await db.user.findUnique({ where: { id: user.id } });
  assert.equal(saved.displayName, "โปรไฟล์ทดสอบใหม่");
  assert.ok(saved.avatarData.startsWith("data:image/webp;base64,"));
  await page.screenshot({ path: path.join(output, "profile-desktop.png") });
  await page.getByRole("button", { name: "ปิดแผง", exact: true }).click();
  await page.reload();
  await visible(page.locator(".account-trigger img"));
  assert.ok((await page.locator(".account-trigger").innerText()).includes("โปรไฟล์ทดสอบใหม่"));
  passed("Profile name and uploaded photo persist in the database and after reload");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".account-trigger").click();
  await visible(page.locator("dialog[open]"));
  await settleDrawer();
  const bounds = await page.locator("dialog").boundingBox();
  assert.ok(bounds.x >= 0 && bounds.width <= 390);
  await page.screenshot({ path: path.join(output, "account-mobile.png") });
  passed("Drawer fits a 390px mobile viewport");
  await page.getByRole("button", { name: "เปลี่ยน PIN" }).click();
  await page.locator('[name="currentPin"]').fill("000000");
  await page.locator('[name="newPin"]').fill("765432");
  await page.locator('[name="pinConfirmation"]').fill("765432");
  await page.getByRole("button", { name: "บันทึก PIN ใหม่", exact: true }).click();
  await visible(page.getByText("PIN ปัจจุบันไม่ถูกต้อง", { exact: true }));
  passed("Incorrect current PIN is rejected in the drawer");
  const secondSession = await db.session.create({ data: { userId: user.id, tokenHash: randomBytes(32).toString("hex"), expiresAt: new Date(Date.now() + 60_000) } });
  await page.locator('[name="currentPin"]').fill("654321");
  await page.locator('[name="newPin"]').fill("765432");
  await page.locator('[name="pinConfirmation"]').fill("765432");
  await page.getByRole("button", { name: "บันทึก PIN ใหม่", exact: true }).click();
  await visible(page.getByText("เปลี่ยน PIN เรียบร้อยแล้ว", { exact: true }));
  assert.equal(await db.session.count({ where: { id: secondSession.id } }), 0);
  passed("Changing PIN succeeds and invalidates other sessions");
  await page.getByRole("button", { name: "ออกจากระบบ", exact: true }).click();
  await page.waitForURL("**/login", { timeout: 60_000 });
  assert.equal((await context.cookies()).filter((cookie) => cookie.name === "pospro_session").length, 0);
  passed("Logout clears the session and returns to login");
  await login("654321");
  await visible(page.locator(".form-error"));
  await login("765432");
  await page.waitForURL("**/requests", { timeout: 60_000 });
  await visible(page.locator(".account-trigger img"));
  passed("Old PIN no longer signs in; new PIN signs in with the saved profile photo");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator(".account-trigger").click();
  await page.getByRole("button", { name: "แก้ไขโปรไฟล์" }).click();
  await page.getByRole("button", { name: "ลบรูปโปรไฟล์", exact: true }).click();
  await page.getByRole("button", { name: "บันทึกโปรไฟล์", exact: true }).click();
  await visible(page.getByText("บันทึกโปรไฟล์เรียบร้อยแล้ว", { exact: true }));
  assert.equal((await db.user.findUnique({ where: { id: user.id } })).avatarData, null);
  passed("Removing profile photo persists to the database");
  await page.getByRole("button", { name: "ปิดแผง", exact: true }).click();
  await db.serviceRequest.updateMany({ where: { branchId: branch.id }, data: { status: "RESOLVED" } });
  await page.locator(".account-bell").click();
  await visible(page.getByText("ยังไม่มีแจ้งเตือนใหม่", { exact: true }));
  assert.equal(await page.locator(".account-badge").count(), 0);
  passed("Notification refresh removes resolved requests and clears the badge");
  assert.deepEqual(errors, []);
  passed("No browser JavaScript errors");
}

run().catch(async (error) => {
  console.error(error);
  if (page) { await page.screenshot({ path: path.join(output, "failure.png") }).catch(() => {}); await fs.writeFile(path.join(output, "failure.txt"), await page.locator("body").innerText().catch(() => "")); }
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
  if (org) await db.organization.delete({ where: { id: org.id } });
  await db.$disconnect();
  await fs.writeFile(path.join(output, "results.json"), JSON.stringify({ results, errors, passed: process.exitCode !== 1, timestamp: new Date().toISOString() }, null, 2));
});
