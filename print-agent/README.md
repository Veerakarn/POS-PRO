# POS@PRO Print Agent

Print Agent ต้องรันบนเครื่อง Windows ภายในสาขา เพื่อรับคิวจาก POS@PRO บนอินเทอร์เน็ตแล้วส่ง ESC/POS ไปยังเครื่องพิมพ์ USB หรือ LAN

## ติดตั้ง

1. ติดตั้ง Node.js 20 ขึ้นไปบนเครื่อง Windows ที่เปิดระหว่างใช้งานร้าน
2. เปิด PowerShell ในโฟลเดอร์ `print-agent` แล้วรัน `npm install`
3. คัดลอก `.env.example` เป็น `.env`
4. ในหน้า **เครื่องพิมพ์** ของ POS@PRO สร้าง Print Agent แล้วคัดลอก Token มาใส่ `POSPRO_AGENT_TOKEN`
5. ตั้ง `POSPRO_SERVER_URL` เป็น URL ของระบบ เช่น `https://ชื่อโปรเจกต์.vercel.app`
6. รัน `npm start`

เครื่อง LAN ใช้ endpoint รูปแบบ `192.168.1.50:9100` ส่วนเครื่อง USB ต้องติดตั้งไดรเวอร์ Windows ก่อน แล้วใช้ชื่อ Printer Queue ที่เห็นใน Settings ของ Windows

ทดสอบโดยตั้ง `POSPRO_DRY_RUN_DIR` ให้เป็นโฟลเดอร์ชั่วคราว งานจะถูกเขียนเป็นไฟล์ `.bin` โดยไม่ส่งเข้าเครื่องจริง จากนั้นกด **ทดสอบพิมพ์** ในหน้า POS@PRO และรัน `npm run once`

ภาษาไทยของเครื่อง ESC/POS แต่ละรุ่นอาจใช้ code page ต่างกัน ให้ลอง `UTF-8`, `TIS-620` หรือ `CP874` จากหน้าเครื่องพิมพ์ ถ้าเป็น USB ผ่านไดรเวอร์ที่ไม่รองรับ RAW ESC/POS ต้องเลือกไดรเวอร์ Generic / Text Only หรือไดรเวอร์ ESC/POS ของผู้ผลิต
