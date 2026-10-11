"use client";

import { useActionState } from "react";

import {
  createProductionStation,
  routeMenuItemToStation,
  type StationState,
} from "@/app/settings/stations/actions";

const initialState: StationState = {};

type BranchOption = { id: string; name: string; code: string };
type StationOption = { id: string; name: string; kind: string };
type MenuOption = { id: string; name: string; category: string };

export function StationForm({ branches, selectedBranchId }: { branches: BranchOption[]; selectedBranchId: string }) {
  const [state, formAction, isPending] = useActionState(createProductionStation, initialState);

  return (
    <form action={formAction} className="branch-form">
      <label><span>สาขา</span><select defaultValue={selectedBranchId} name="branchId">{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name} · {branch.code}</option>)}</select></label>
      <label><span>ชื่อจุดผลิต</span><input name="name" placeholder="เช่น ครัวร้อน, บาร์น้ำ" required /></label>
      <label><span>ประเภท</span><select defaultValue="KITCHEN" name="kind"><option value="KITCHEN">ครัว</option><option value="BAR">บาร์เครื่องดื่ม</option><option value="SERVICE">จุดบริการ</option><option value="OTHER">อื่น ๆ</option></select></label>
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      {state.success ? <p className="form-success" role="status">{state.success}</p> : null}
      <button className="primary-button" disabled={isPending} type="submit">{isPending ? "กำลังเพิ่ม…" : "เพิ่มจุดผลิต"}</button>
    </form>
  );
}

export function MenuStationRouteForm({ stations, menuItems }: { stations: StationOption[]; menuItems: MenuOption[] }) {
  const [state, formAction, isPending] = useActionState(routeMenuItemToStation, initialState);
  if (!stations.length || !menuItems.length) return <p className="empty-state">เพิ่มจุดผลิตและเมนูก่อนกำหนดเส้นทางการผลิต</p>;

  return (
    <form action={formAction} className="branch-form station-route-form">
      <label><span>เมนู</span><select name="menuItemId" required>{menuItems.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.category}</option>)}</select></label>
      <label><span>ส่งไปที่</span><select name="stationId" required>{stations.map((station) => <option key={station.id} value={station.id}>{station.name} · {station.kind}</option>)}</select></label>
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      {state.success ? <p className="form-success" role="status">{state.success}</p> : null}
      <button className="secondary-button" disabled={isPending} type="submit">{isPending ? "กำลังบันทึก…" : "กำหนดเส้นทางเมนู"}</button>
    </form>
  );
}
