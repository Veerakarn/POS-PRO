require("@next/env").loadEnvConfig(process.cwd());
const { PrismaClient } = require("@prisma/client");
const { randomUUID, randomBytes, createHash } = require("node:crypto");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
const db = new PrismaClient();
const desktopOnly = process.env.DESKTOP_NAVIGATION_ONLY === "1";
const output = path.resolve(desktopOnly ? "docs/desktop-navigation-test" : "docs/workspace-navigation-test");
const results = [], errors = [];
let org, browser, page;
const visible = (locator) => locator.waitFor({ state: "visible", timeout: 90_000 });
const pass = (name) => { results.push(name); console.log(`PASS ${name}`); };
async function shot(name) {
  await page.addStyleTag({ content: "nextjs-portal { display:none !important; }" });
  await page.screenshot({ path: path.join(output, `${name}.png`) });
}
async function run() {
  await fs.mkdir(output, { recursive: true });
  const source = await fs.readFile("src/components/app-shell.tsx", "utf8");
  const routes = [...source.matchAll(/href: "([^"]+)", label: "([^"]+)", permission: "([^"]+)"/g)].map((match) => ({ href: match[1], label: match[2], permission: match[3] }));
  assert.ok(routes.length >= 19);
  const suffix = randomUUID();
  org = await db.organization.create({ data: {
    name: "บ้านอิ่มอร่อย", slug: `navigation-${suffix}`,
    branches: { create: { name: "สาขาสุขุมวิท", code: "TEST" } },
    users: { create: { displayName: "ผู้ทดสอบเมนู", email: `nav-${suffix}@example.test` } },
    roles: { create: { name: "เจ้าของร้านทดสอบ", permissions: [...new Set(routes.map((item) => item.permission))], isSystem: true } },
  }, include: { users: true, roles: true } });
  await db.roleAssignment.create({ data: { userId: org.users[0].id, roleId: org.roles[0].id } });
  const token = randomBytes(32).toString("base64url");
  await db.session.create({ data: { userId: org.users[0].id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 60 * 60_000) } });
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({ viewport: { width: desktopOnly ? 1440 : 1194, height: desktopOnly ? 1000 : 834 }, hasTouch: !desktopOnly, isMobile: !desktopOnly, deviceScaleFactor: 1 });
  await context.addCookies([{ name: "pospro_session", value: token, url: "http://localhost:3000", httpOnly: true, sameSite: "Lax" }]);
  page = await context.newPage();
  page.setDefaultTimeout(60_000);
  page.on("pageerror", (error) => errors.push(error.message));
  if (desktopOnly) {
    await page.goto("http://localhost:3000/dashboard", { timeout: 120_000 });
    await visible(page.locator(".app-sidebar"));
    assert.equal(await page.locator(".workspace-menu-toggle").isVisible(), false);
    assert.equal(await page.locator(".workspace-menu-toggle, .sidebar-toggle").count(), 0);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator(".app-sidebar").isVisible(), true);
    await shot("desktop-pinned");
    pass("Wide desktop pins navigation and Escape cannot collapse it");
    await page.locator('.sidebar-link[href="/reports"]').click();
    await page.waitForURL("**/reports");
    await visible(page.locator(".app-sidebar"));
    pass("Navigation stays visible after changing pages on desktop");
    await page.setViewportSize({ width: 1194, height: 834 });
    await page.locator(".app-sidebar").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "เปิดเมนูหลัก", exact: true }).click();
    await visible(page.locator(".app-sidebar"));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await visible(page.locator(".app-sidebar"));
    await page.setViewportSize({ width: 1194, height: 834 });
    await page.locator(".app-sidebar").waitFor({ state: "hidden" });
    await visible(page.getByRole("button", { name: "เปิดเมนูหลัก", exact: true }));
    await shot("desktop-narrow");
    pass("Narrowing the window collapses navigation, including after manually opening it");
    const tablet = await browser.newContext({ viewport: { width: 1366, height: 1024 }, hasTouch: true, isMobile: true });
    await tablet.addCookies(await context.cookies());
    const tabletPage = await tablet.newPage();
    await tabletPage.goto("http://localhost:3000/dashboard", { timeout: 120_000 });
    await visible(tabletPage.getByRole("button", { name: "เปิดเมนูหลัก", exact: true }));
    assert.equal(await tabletPage.locator(".app-sidebar").isVisible(), false);
    await tabletPage.getByRole("button", { name: "เปิดเมนูหลัก", exact: true }).click();
    await visible(tabletPage.locator(".app-sidebar"));
    await tablet.close();
    pass("Large iPad touch screens retain the collapsible menu");
    assert.deepEqual(errors, []);
    pass("No browser JavaScript errors");
    return;
  }
  for (const route of routes) {
    const response = await page.goto(`http://localhost:3000${route.href}`, { timeout: 120_000 });
    assert.equal(response.status(), 200, route.href);
    await visible(page.getByRole("button", { name: "เปิดเมนูหลัก", exact: true }));
    assert.equal(await page.locator(".app-sidebar").isVisible(), false);
    const header = await page.locator(".topbar").boundingBox();
    assert.ok(header.y <= 12 && header.height <= 80, route.href);
    assert.equal(await page.locator(".workspace-header-brand strong").innerText(), org.name);
    await page.getByRole("button", { name: "เปิดเมนูหลัก", exact: true }).click();
    await visible(page.getByRole("navigation", { name: "เมนูหลัก", exact: true }));
    const active = page.locator('.sidebar-link[aria-current="page"]');
    assert.equal(await active.getAttribute("href"), route.href);
    const first = await page.locator(".sidebar-link").nth(0).boundingBox();
    const second = await page.locator(".sidebar-link").nth(1).boundingBox();
    assert.ok(first.width >= 150 && second.y >= first.y + first.height);
    if (route.href === "/dashboard") await shot("dashboard-menu");
    await page.keyboard.press("Escape");
    assert.equal(await page.locator(".app-sidebar").isVisible(), false);
    pass(`Shared header, navigation and active page: ${route.href}`);
  }
  await page.goto("http://localhost:3000/dashboard");
  await page.getByRole("button", { name: "เปิดเมนูหลัก", exact: true }).click();
  await page.locator('.sidebar-link[href="/requests"]').click();
  await page.waitForURL("**/requests");
  assert.equal(await page.locator(".app-sidebar").isVisible(), false);
  pass("Selecting a navigation link changes page and closes the menu");
  for (const viewport of [{ width: 834, height: 1194 }, { width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
    await page.setViewportSize(viewport);
    await page.goto("http://localhost:3000/inventory");
    await visible(page.getByRole("button", { name: "เปิดเมนูหลัก", exact: true }));
    const header = await page.locator(".topbar").boundingBox();
    assert.ok(header.x >= 0 && header.x + header.width <= viewport.width);
    await page.getByRole("button", { name: "เปิดเมนูหลัก", exact: true }).click();
    if (viewport.width <= 1000) {
      await visible(page.locator(".workspace-menu-backdrop"));
      assert.equal(await page.locator(".app-shell-content").evaluate((element) => element.inert), true);
      if (viewport.width === 834) await shot("inventory-portrait-menu");
      await page.getByRole("button", { name: "ปิดเมนู", exact: true }).click();
      assert.equal(await page.locator(".app-shell-content").evaluate((element) => element.inert), false);
    } else await page.getByRole("button", { name: "ปิดเมนูหลัก", exact: true }).click();
    assert.equal(await page.locator(".app-sidebar").isVisible(), false);
    if (viewport.width === 390) await shot("inventory-mobile");
    pass(`Navigation works and header fits at ${viewport.width}px`);
  }
  await page.locator(".account-trigger").click();
  await visible(page.getByRole("heading", { name: "บัญชีของฉัน", exact: true }));
  await page.getByRole("button", { name: "ปิดแผง", exact: true }).click();
  pass("Profile drawer still opens from the shared header");
  assert.deepEqual(errors, []);
  pass("No browser JavaScript errors");
}
run().catch(async (error) => {
  console.error(error);
  if (page) await shot("failure").catch(() => {});
  process.exitCode = 1;
}).finally(async () => {
  if (page) await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  if (browser) await browser.close();
  if (org) await db.organization.delete({ where: { id: org.id } });
  await db.$disconnect();
  await fs.writeFile(path.join(output, "results.json"), JSON.stringify({ passed: process.exitCode !== 1, results, errors, timestamp: new Date().toISOString() }, null, 2));
});
