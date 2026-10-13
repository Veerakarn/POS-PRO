import { randomUUID } from "node:crypto";
import sharp from "sharp";

export const MAX_MENU_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_STORED_BYTES = 512 * 1024;

type ImageChange =
  | { kind: "keep" }
  | { kind: "remove"; url: null }
  | { kind: "url"; url: string }
  | { kind: "upload"; url: string; id: string; content: Uint8Array<ArrayBuffer> };

// Decode and re-encode the actual bytes; neither filename nor browser MIME is trusted.
export async function readMenuImage(formData: FormData): Promise<ImageChange> {
  const mode = formData.get("imageMode");
  if (mode === "keep") return { kind: "keep" };
  if (mode === "remove") return { kind: "remove", url: null };
  if (mode === "url") {
    const value = String(formData.get("imageUrl") ?? "").trim();
    let url: URL;
    try { url = new URL(value); } catch { throw new Error("กรอกลิงก์รูปภาพให้ถูกต้อง"); }
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || value.length > 2048) {
      throw new Error("ลิงก์รูปภาพต้องเป็น http:// หรือ https:// และไม่มีรหัสผ่านในลิงก์");
    }
    return { kind: "url", url: url.href };
  }
  if (mode !== "upload") throw new Error("เลือกวิธีใส่รูปภาพให้ถูกต้อง");
  const file = formData.get("imageFile");
  if (!(file instanceof File) || !file.size) throw new Error("เลือกรูปภาพที่ต้องการอัปโหลด");
  if (file.size > MAX_MENU_IMAGE_BYTES) throw new Error("รูปภาพต้องมีขนาดไม่เกิน 3 MB");
  try {
    const decoder = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 25_000_000, failOn: "warning" });
    const metadata = await decoder.metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) > 1) {
      throw new Error("unsupported");
    }
    const content = await decoder.rotate().resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 78, effort: 4 }).toBuffer();
    if (content.length > MAX_STORED_BYTES) throw new Error("oversized");
    const id = randomUUID();
    return { kind: "upload", id, url: `/api/menu-images/${id}`, content: new Uint8Array(content) };
  } catch {
    throw new Error("อ่านรูปไม่ได้ กรุณาใช้ JPG, PNG หรือ WebP แบบภาพนิ่ง ขนาดไม่เกิน 25 ล้านพิกเซล หรือลดขนาดรูปแล้วลองใหม่");
  }
}
