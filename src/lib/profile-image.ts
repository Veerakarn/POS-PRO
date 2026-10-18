import sharp from "sharp";

export const MAX_PROFILE_IMAGE_BYTES = 750 * 1024;

export async function encodeProfileImage(file: File): Promise<string> {
  if (!file.size || file.size > MAX_PROFILE_IMAGE_BYTES) throw new Error("รูปภาพต้องมีขนาดไม่เกิน 750 KB");
  try {
    const image = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 25_000_000, failOn: "warning" });
    const metadata = await image.metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) > 1) throw new Error("format");
    const content = await image.rotate().resize(256, 256, { fit: "cover" }).webp({ quality: 80 }).toBuffer();
    return `data:image/webp;base64,${content.toString("base64")}`;
  } catch { throw new Error("อ่านรูปไม่ได้ กรุณาใช้ JPG, PNG หรือ WebP แบบภาพนิ่ง"); }
}
