/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const ESC = Buffer.from([0x1b]);
const GS = Buffer.from([0x1d]);

function encode(text, codePage) {
  const value = String(text ?? "").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
  if (!codePage || codePage.toUpperCase() === "UTF-8") return Buffer.from(value, "utf8");
  let iconv;
  try {
    iconv = require("iconv-lite");
  } catch {
    throw new Error(`ต้องรัน npm install ในโฟลเดอร์ print-agent ก่อนใช้ code page ${codePage}`);
  }
  const aliases = { "TIS-620": "tis620", CP874: "win874" };
  const encoding = aliases[codePage.toUpperCase()] ?? codePage;
  if (!iconv.encodingExists(encoding)) throw new Error(`ไม่รองรับ code page ${codePage}`);
  return iconv.encode(value, encoding);
}

function textLine(value, codePage) {
  return Buffer.concat([encode(value, codePage), Buffer.from("\n")]);
}

function rule(width) {
  return "-".repeat(width === 58 ? 32 : 48);
}

function money(satang) {
  return `${(Number(satang ?? 0) / 100).toFixed(2)} บาท`;
}

function qrCode(url) {
  const value = Buffer.from(String(url ?? ""), "utf8");
  if (!value.length || value.length > 2000) throw new Error("ลิงก์ QR ไม่ถูกต้องหรือยาวเกินไป");
  const length = value.length + 3;
  const size = Buffer.from([length & 0xff, (length >> 8) & 0xff]);
  const command = (data) => Buffer.concat([GS, Buffer.from([0x28, 0x6b]), data]);
  return Buffer.concat([
    command(Buffer.from([4, 0, 49, 65, 50, 0])),
    command(Buffer.from([3, 0, 49, 67, 6])),
    command(Buffer.from([3, 0, 49, 69, 49])),
    command(Buffer.concat([size, Buffer.from([49, 80, 48]), value])),
    command(Buffer.from([3, 0, 49, 81, 48])),
  ]);
}

function documentBuffers(document, printer) {
  if (!document || document.version !== 1 || typeof document.type !== "string") throw new Error("รูปแบบเอกสารไม่ถูกต้อง");
  const codePage = printer.codePage || "UTF-8";
  const width = printer.paperWidth === 58 ? 58 : 80;
  const chunks = [Buffer.concat([ESC, Buffer.from("@")])];
  chunks.push(Buffer.concat([ESC, Buffer.from("a"), Buffer.from([1])]));
  chunks.push(Buffer.concat([ESC, Buffer.from("E"), Buffer.from([1])]));
  chunks.push(textLine(document.type === "TABLE_QR" ? document.organizationName || document.title || "POS@PRO" : document.title || "POS@PRO", codePage));
  chunks.push(Buffer.concat([ESC, Buffer.from("E"), Buffer.from([0])]));
  chunks.push(textLine(document.type === "TABLE_QR" && document.branchName ? `สาขา ${document.branchName}` : document.branchName || "", codePage));
  chunks.push(Buffer.concat([ESC, Buffer.from("a"), Buffer.from([0])]));
  chunks.push(textLine(rule(width), codePage));

  if (document.type === "ORDER_TICKET") {
    chunks.push(textLine(`จุดผลิต: ${document.stationName}`, codePage));
    chunks.push(textLine(`ออเดอร์ #${document.orderNumber}  โต๊ะ: ${document.tableName}`, codePage));
    chunks.push(textLine(`ช่องทาง: ${document.source}`, codePage));
    chunks.push(textLine(rule(width), codePage));
    for (const line of document.lines || []) {
      chunks.push(Buffer.concat([ESC, Buffer.from("E"), Buffer.from([1])]));
      chunks.push(textLine(`${line.quantity} x ${line.name}`, codePage));
      chunks.push(Buffer.concat([ESC, Buffer.from("E"), Buffer.from([0])]));
      if (line.note) chunks.push(textLine(`  หมายเหตุ: ${line.note}`, codePage));
    }
  } else if (document.type === "RECEIPT") {
    chunks.push(textLine(`ใบเสร็จ #${document.billNumber}  โต๊ะ: ${document.tableName}`, codePage));
    chunks.push(textLine(rule(width), codePage));
    for (const line of document.lines || []) {
      chunks.push(textLine(`${line.quantity} x ${line.name}`, codePage));
      chunks.push(textLine(`  ${money(line.unitPriceSatang)}  =  ${money(line.totalSatang)}`, codePage));
    }
    chunks.push(textLine(rule(width), codePage));
    chunks.push(textLine(`รวมก่อนส่วนลด  ${money(document.subtotalSatang)}`, codePage));
    if (document.discountSatang) chunks.push(textLine(`ส่วนลด  ${money(document.discountSatang)}`, codePage));
    if (document.taxSatang) chunks.push(textLine(`ภาษี  ${money(document.taxSatang)}`, codePage));
    chunks.push(Buffer.concat([ESC, Buffer.from("E"), Buffer.from([1])]));
    chunks.push(textLine(`ยอดสุทธิ  ${money(document.totalSatang)}`, codePage));
    chunks.push(Buffer.concat([ESC, Buffer.from("E"), Buffer.from([0])]));
    chunks.push(textLine(`ชำระ: ${(document.paymentMethods || []).join(", ")}`, codePage));
    for (const footer of document.footer || []) chunks.push(textLine(footer, codePage));
  } else if (document.type === "TABLE_QR") {
    chunks.push(textLine(`โต๊ะ ${document.tableName}`, codePage));
    chunks.push(textLine("สแกนเพื่อสั่งอาหาร", codePage));
    chunks.push(Buffer.concat([ESC, Buffer.from("a"), Buffer.from([1])]));
    chunks.push(qrCode(document.url));
    chunks.push(Buffer.concat([ESC, Buffer.from("a"), Buffer.from([0])]));
    chunks.push(textLine("QR นี้ใช้ได้เฉพาะรอบโต๊ะนี้", codePage));
    chunks.push(textLine("ขอบคุณค่ะ / ครับ", codePage));
  } else if (document.type === "TEST") {
    for (const line of document.lines || []) chunks.push(textLine(line.text || "", codePage));
  } else {
    throw new Error(`ไม่รองรับเอกสาร ${document.type}`);
  }

  chunks.push(textLine(rule(width), codePage));
  chunks.push(textLine(new Date(document.createdAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }), codePage));
  chunks.push(Buffer.from("\n\n\n"));
  chunks.push(Buffer.concat([GS, Buffer.from("V"), Buffer.from([0])]));
  return Buffer.concat(chunks);
}

function renderEscPos(document, printer) {
  const copies = Number.isInteger(document.copies) ? Math.min(Math.max(document.copies, 1), 5) : 1;
  const buffers = [];
  for (let index = 0; index < copies; index += 1) buffers.push(documentBuffers(document, printer));
  return Buffer.concat(buffers);
}

module.exports = { renderEscPos };
