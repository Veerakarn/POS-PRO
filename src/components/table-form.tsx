"use client";

import { useActionState } from "react";

import { createRestaurantTable, type TableState } from "@/app/settings/tables/actions";

const initialState: TableState = {};

type BranchOption = {
  id: string;
  name: string;
  code: string;
};

export function TableForm({ branches, selectedBranchId }: { branches: BranchOption[]; selectedBranchId: string }) {
  const [state, formAction, isPending] = useActionState(createRestaurantTable, initialState);

  return (
    <form action={formAction} className="branch-form">
      <label>
        <span>สาขา</span>
        <select defaultValue={selectedBranchId} name="branchId">
          {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name} · {branch.code}</option>)}
        </select>
      </label>
      <div className="form-grid">
        <label>
          <span>ชื่อโต๊ะ</span>
          <input name="name" placeholder="เช่น โต๊ะ A1" required />
        </label>
        <label>
          <span>รหัสโต๊ะ</span>
          <input autoCapitalize="characters" name="code" pattern="[A-Z0-9_-]{1,12}" placeholder="A01" required />
        </label>
      </div>
      <label>
        <span>จำนวนที่นั่ง</span>
        <input defaultValue={4} max={50} min={1} name="capacity" required type="number" />
      </label>
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      {state.success ? <p className="form-success" role="status">{state.success}</p> : null}
      <button className="primary-button" disabled={isPending} type="submit">
        {isPending ? "กำลังเพิ่มโต๊ะ…" : "เพิ่มโต๊ะและสร้าง QR"}
      </button>
    </form>
  );
}
