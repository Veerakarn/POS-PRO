const { test } = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const { encodeProfileImage, MAX_PROFILE_IMAGE_BYTES } = require("../src/lib/profile-image.ts");

test("profile photos become square WebP avatars with metadata removed", async () => {
  const bytes = await sharp({ create: { width: 800, height: 400, channels: 3, background: "green" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const data = await encodeProfileImage(new File([bytes], "avatar.jpg"));
  assert.ok(data.startsWith("data:image/webp;base64,"));
  const metadata = await sharp(Buffer.from(data.split(",")[1], "base64")).metadata();
  assert.equal(metadata.width, 256);
  assert.equal(metadata.height, 256);
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.orientation, undefined);
});

test("profile photo uploads reject spoofed files, SVG, empty and oversized input", async () => {
  for (const bytes of [Buffer.from("not an image"), Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'), Buffer.alloc(0), Buffer.alloc(MAX_PROFILE_IMAGE_BYTES + 1)]) {
    await assert.rejects(encodeProfileImage(new File([bytes], "avatar.jpg", { type: "image/jpeg" })));
  }
});
