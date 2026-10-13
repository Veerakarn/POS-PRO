require("@next/env").loadEnvConfig(process.cwd());
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { PrismaClient } = require("@prisma/client");
const sharp = require("sharp");
const db = new PrismaClient();
after(() => db.$disconnect());

test("guest image endpoint serves stored WebP, hides archived items and removes replaced image IDs", async () => {
  const origin = process.env.TEST_APP_URL || "http://localhost:3000";
  const org = await db.organization.create({ data: { name: "Image route test", slug: `image-test-${randomUUID()}`, categories: { create: { name: "Test" } } }, include: { categories: true } });
  try {
    const content = await sharp({ create: { width: 20, height: 20, channels: 3, background: "green" } }).webp().toBuffer();
    const imageId = randomUUID();
    const item = await db.menuItem.create({ data: { organizationId: org.id, categoryId: org.categories[0].id, name: "Image fixture", priceSatang: 100, imageUrl: `/api/menu-images/${imageId}`, uploadedImage: { create: { id: imageId, content } } } });
    const read = () => fetch(`${origin}/api/menu-images/${imageId}`, { cache: "no-store" });
    const response = await read();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/webp");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), content);
    await db.menuItem.update({ where: { id: item.id }, data: { isActive: false } });
    assert.equal((await read()).status, 404);
    await db.menuItem.update({ where: { id: item.id }, data: { isActive: true } });
    await db.menuCategory.update({ where: { id: org.categories[0].id }, data: { isActive: false } });
    assert.equal((await read()).status, 404);
    await db.menuImage.delete({ where: { id: imageId } });
    assert.equal((await read()).status, 404);
    assert.equal((await fetch(`${origin}/api/menu-images/invalid`)).status, 404);
  } finally {
    await db.organization.delete({ where: { id: org.id } });
  }
});
