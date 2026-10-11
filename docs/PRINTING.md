# ระบบเครื่องพิมพ์ POS@PRO

ระบบแยกเป็นสองส่วน: Next.js เก็บการตั้งค่าและคิวงานบน Neon ส่วน `print-agent` รันบน Windows ในแต่ละสาขาเพื่อเข้าถึง USB และ LAN ภายในร้าน ตัว Agent เป็นฝ่ายเรียก API ออกไปหาเซิร์ฟเวอร์ จึงไม่ต้องเปิด port จากอินเทอร์เน็ตเข้าร้าน

## ลำดับงาน

- เมื่อส่งออเดอร์ ระบบอ่านเส้นทางเมนูไปยัง Production Station แล้วสร้าง `ORDER_TICKET` แยกต่อเครื่อง/จุดผลิตภายใน transaction เดียวกับออเดอร์
- เมื่อรับชำระ ระบบสร้าง `RECEIPT` ภายใน transaction เดียวกับการปิดบิล
- `idempotencyKey` ของงานกันการ retry แล้วสร้างงานซ้ำ
- Agent รับงานเก่าสุดที่อยู่ในสาขาและผูกกับ Agent นั้น งานที่รับแล้วมี lease 60 วินาที หาก Agent หยุดก่อนรายงานผล ระบบนำงานเดิมกลับมาให้รับใหม่ได้
- งานล้มเหลวต้องกด **ลองใหม่** จากหน้าจัดการ งานที่พิมพ์แล้วจะพิมพ์ซ้ำได้เมื่อระบุเหตุผลเพื่อบันทึก Audit Log

## API ของ Agent

- `POST /api/print-agent/pull`
- `POST /api/print-agent/jobs/:jobId/complete`

ทั้งสอง endpoint ใช้ `Authorization: Bearer <agent-token>` Token ถูกเก็บในฐานข้อมูลเป็น SHA-256 hash และ plaintext แสดงครั้งเดียวตอนสร้างหรือ rotate

## ติดตั้งในสาขา

ดูขั้นตอนที่ [`print-agent/README.md`](../print-agent/README.md) เครื่อง LAN ใช้ ESC/POS ผ่าน TCP port 9100 ส่วน USB ใช้ Windows RAW spooler ชื่อ queue ต้องตรงกับ Windows Settings

การรองรับอักษรไทยขึ้นกับ firmware และ code page ของเครื่องแต่ละรุ่น ระบบมีตัวเลือก UTF-8, TIS-620 และ CP874 ก่อนใช้งานจริงต้องพิมพ์ใบทดสอบกับรุ่นที่ร้านเลือก
