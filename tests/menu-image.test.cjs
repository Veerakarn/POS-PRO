const { test } = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const { readMenuImage, MAX_MENU_IMAGE_BYTES } = require("../src/lib/menu-image.ts");

function form(mode, content) {
  const data = new FormData();
  data.set("imageMode", mode);
  if (content) data.set("imageFile", new File([content], "menu.jpg", { type: "image/jpeg" }));
  return data;
}

test("uploaded pictures are decoded, resized, converted to WebP and stripped of metadata", async () => {
  const input = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: "red" } })
    .jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const result = await readMenuImage(form("upload", input));
  assert.equal(result.kind, "upload");
  assert.equal(result.url, `/api/menu-images/${result.id}`);
  const meta = await sharp(result.content).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.width, 600);
  assert.equal(meta.height, 1200);
  assert.equal(meta.exif, undefined);
  assert.equal(meta.orientation, undefined);
  assert.ok(result.content.length <= 512 * 1024);
});

test("rejects spoofed images, SVG, oversized files and missing uploads", async () => {
  for (const content of [Buffer.from("not a picture"), Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'), Buffer.alloc(MAX_MENU_IMAGE_BYTES + 1)]) {
    await assert.rejects(readMenuImage(form("upload", content)));
  }
  await assert.rejects(readMenuImage(form("upload")));
  await assert.rejects(readMenuImage(form("unknown")));
});

test("only explicit image changes are accepted and unsafe URL schemes are blocked", async () => {
  assert.deepEqual(await readMenuImage(form("keep")), { kind: "keep" });
  assert.deepEqual(await readMenuImage(form("remove")), { kind: "remove", url: null });
  for (const url of ["javascript:alert(1)", "data:image/svg+xml,test", "/api/menu-images/another", "https://user:secret@example.com/image.png"]) {
    const data = form("url"); data.set("imageUrl", url);
    await assert.rejects(readMenuImage(data));
  }
  const data = form("url"); data.set("imageUrl", "https://example.com/image.png");
  assert.equal((await readMenuImage(data)).url, "https://example.com/image.png");
});
