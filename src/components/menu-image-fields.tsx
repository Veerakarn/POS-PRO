"use client";

import { useState } from "react";

export function MenuImageFields({ currentUrl, editing = false, disabled = false }: {
  currentUrl?: string | null;
  editing?: boolean;
  disabled?: boolean;
}) {
  const [mode, setMode] = useState(editing ? "keep" : "remove");
  return (
    <fieldset className="menu-image-fields" disabled={disabled}>
      <legend>รูปภาพเมนู</legend>
      <label>
        <span>วิธีใส่รูป</span>
        <select name="imageMode" value={mode} onChange={(event) => setMode(event.target.value)}>
          {editing ? <option value="keep">ใช้รูปเดิม</option> : null}
          <option value="upload">อัปโหลดจากเครื่อง</option>
          <option value="url">ใช้ลิงก์รูปภาพ</option>
          <option value="remove">{editing ? "ลบรูปภาพ" : "ยังไม่ใส่รูป"}</option>
        </select>
      </label>
      {mode === "upload" ? <label>
        <span>เลือกไฟล์ JPG, PNG หรือ WebP (ไม่เกิน 3 MB)</span>
        <input accept="image/jpeg,image/png,image/webp" name="imageFile" type="file" required />
        <small>ระบบย่อรูปและลบข้อมูลตำแหน่งจากไฟล์ให้อัตโนมัติ</small>
      </label> : null}
      {mode === "url" ? <label>
        <span>ลิงก์รูปภาพ</span>
        <input defaultValue={currentUrl?.startsWith("http") ? currentUrl : ""} name="imageUrl" placeholder="https://..." type="url" maxLength={2048} required />
      </label> : null}
      {mode === "keep" ? <small>{currentUrl ? "รูปเดิมจะยังคงอยู่หลังบันทึก" : "เมนูนี้ยังไม่มีรูปภาพ"}</small> : null}
    </fieldset>
  );
}
