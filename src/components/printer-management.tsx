"use client";

import { useActionState, useState } from "react";

import {
  createPrintAgent,
  createPrintRoute,
  deletePrintRoute,
  queueTestPrint,
  reprintJob,
  retryPrintJob,
  rotatePrintAgentToken,
  savePrinter,
  togglePrintAgent,
  togglePrinter,
  type PrinterActionState,
} from "@/app/settings/printers/actions";

const initialState: PrinterActionState = {};

type Agent = { id: string; name: string; isActive: boolean; lastSeenAt: string | null; lastError: string | null; version: string | null };
type Printer = { id: string; name: string; connection: string; endpoint: string | null; paperWidth: number; codePage: string; isActive: boolean; printAgentId: string | null; printAgentName: string | null };
type Station = { id: string; name: string; kind: string };
type Route = { id: string; documentType: string; copies: number; printerName: string; stationName: string | null };
type Job = { id: string; documentType: string; status: string; attempts: number; error: string | null; createdAt: string; printedAt: string | null; printerName: string };

function Feedback({ state }: { state: PrinterActionState }) {
  return <div className="printer-feedback" aria-live="polite">{state.error ? <p className="form-error">{state.error}</p> : null}{state.success ? <p className="form-success">{state.success}</p> : null}{state.agentToken ? <div className="agent-token"><strong>Token แสดงครั้งเดียว</strong><textarea aria-label="Print Agent token" readOnly value={state.agentToken} /><small>คัดลอกไปใส่ในไฟล์ .env ของเครื่องที่รัน Print Agent หากหายให้ออก Token ใหม่</small></div> : null}</div>;
}

function CreateAgentForm({ branchId }: { branchId: string }) {
  const [state, action, pending] = useActionState(createPrintAgent, initialState);
  return <form action={action} className="printer-form"><input name="branchId" type="hidden" value={branchId} /><label><span>ชื่อ Agent</span><input maxLength={60} name="name" placeholder="เช่น เครื่องแคชเชียร์หลัก" required /></label><Feedback state={state} /><button className="primary-button" disabled={pending} type="submit">{pending ? "กำลังสร้าง…" : "สร้าง Print Agent"}</button></form>;
}

function AgentControls({ agent, branchId }: { agent: Agent; branchId: string }) {
  const [rotateState, rotateAction, rotating] = useActionState(rotatePrintAgentToken, initialState);
  const [toggleState, toggleAction, toggling] = useActionState(togglePrintAgent, initialState);
  return <div className="printer-card-controls">
    <form action={rotateAction} className="printer-inline-form"><input name="branchId" type="hidden" value={branchId} /><input name="agentId" type="hidden" value={agent.id} /><button className="secondary-button" disabled={rotating} type="submit">{rotating ? "กำลังออก…" : "ออก Token ใหม่"}</button><Feedback state={rotateState} /></form>
    <form action={toggleAction} className="printer-inline-form"><input name="branchId" type="hidden" value={branchId} /><input name="agentId" type="hidden" value={agent.id} /><input name="isActive" type="hidden" value={String(!agent.isActive)} /><button className={agent.isActive ? "danger-button" : "secondary-button"} disabled={toggling} type="submit">{toggling ? "กำลังบันทึก…" : agent.isActive ? "ปิด Agent" : "เปิด Agent"}</button><Feedback state={toggleState} /></form>
  </div>;
}

function PrinterEditor({ agents, branchId, printer }: { agents: Agent[]; branchId: string; printer?: Printer }) {
  const [state, action, pending] = useActionState(savePrinter, initialState);
  const [connection, setConnection] = useState(printer?.connection ?? "NETWORK");
  return <form action={action} className="printer-form">
    <input name="branchId" type="hidden" value={branchId} />{printer ? <input name="printerId" type="hidden" value={printer.id} /> : null}
    <label><span>ชื่อเครื่องพิมพ์</span><input defaultValue={printer?.name} maxLength={60} name="name" placeholder="เช่น ครัวร้อน 1" required /></label>
    <div className="printer-field-grid"><label><span>การเชื่อมต่อ</span><select name="connection" onChange={(event) => setConnection(event.target.value)} value={connection}><option value="NETWORK">LAN / Network</option><option value="WINDOWS">USB ผ่าน Windows</option></select></label><label><span>หน้ากระดาษ</span><select defaultValue={printer?.paperWidth ?? 80} name="paperWidth"><option value="80">80 มม.</option><option value="58">58 มม.</option></select></label></div>
    <label><span>{connection === "NETWORK" ? "IP หรือ host:port" : "ชื่อ Printer Queue ใน Windows"}</span><input defaultValue={printer?.endpoint ?? ""} maxLength={200} name="endpoint" placeholder={connection === "NETWORK" ? "192.168.1.50:9100" : "EPSON TM-T82"} required /></label>
    <div className="printer-field-grid"><label><span>Print Agent</span><select defaultValue={printer?.printAgentId ?? ""} name="printAgentId"><option value="">ยังไม่ผูก Agent</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}{agent.isActive ? "" : " (ปิดอยู่)"}</option>)}</select></label><label><span>Code page</span><select defaultValue={printer?.codePage ?? "UTF-8"} name="codePage"><option value="UTF-8">UTF-8</option><option value="TIS-620">TIS-620 / Thai</option><option value="CP874">CP874 / Thai</option></select></label></div>
    <Feedback state={state} /><button className={printer ? "secondary-button" : "primary-button"} disabled={pending} type="submit">{pending ? "กำลังบันทึก…" : printer ? "บันทึกเครื่องพิมพ์" : "เพิ่มเครื่องพิมพ์"}</button>
  </form>;
}

function PrinterControls({ branchId, printer }: { branchId: string; printer: Printer }) {
  const [toggleState, toggleAction, toggling] = useActionState(togglePrinter, initialState);
  const [testState, testAction, testing] = useActionState(queueTestPrint, initialState);
  return <div className="printer-card-controls"><form action={testAction} className="printer-inline-form"><input name="branchId" type="hidden" value={branchId} /><input name="printerId" type="hidden" value={printer.id} /><button className="secondary-button" disabled={testing || !printer.isActive} type="submit">{testing ? "กำลังเข้าคิว…" : "ทดสอบพิมพ์"}</button><Feedback state={testState} /></form><form action={toggleAction} className="printer-inline-form"><input name="branchId" type="hidden" value={branchId} /><input name="printerId" type="hidden" value={printer.id} /><input name="isActive" type="hidden" value={String(!printer.isActive)} /><button className={printer.isActive ? "danger-button" : "secondary-button"} disabled={toggling} type="submit">{toggling ? "กำลังบันทึก…" : printer.isActive ? "ปิดเครื่อง" : "เปิดเครื่อง"}</button><Feedback state={toggleState} /></form></div>;
}

function RouteCreator({ branchId, printers, stations }: { branchId: string; printers: Printer[]; stations: Station[] }) {
  const [state, action, pending] = useActionState(createPrintRoute, initialState);
  const [type, setType] = useState("ORDER_TICKET");
  if (!printers.length) return <p className="empty-state">เพิ่มเครื่องพิมพ์ก่อนกำหนดเส้นทาง</p>;
  return <form action={action} className="printer-form route-form"><input name="branchId" type="hidden" value={branchId} /><label><span>เอกสาร</span><select name="documentType" onChange={(event) => setType(event.target.value)} value={type}><option value="ORDER_TICKET">ใบสั่งอาหารไปครัว/บาร์</option><option value="RECEIPT">ใบเสร็จหลังรับชำระ</option></select></label>{type === "ORDER_TICKET" ? <label><span>จุดผลิต</span><select name="stationId" required><option value="">เลือกครัวหรือบาร์</option>{stations.map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}</select></label> : <input name="stationId" type="hidden" value="" />}<label><span>เครื่องพิมพ์</span><select name="printerId" required>{printers.map((printer) => <option key={printer.id} value={printer.id}>{printer.name}</option>)}</select></label><label><span>จำนวนชุด</span><select defaultValue="1" name="copies">{[1,2,3,4,5].map((copies) => <option key={copies} value={copies}>{copies} ชุด</option>)}</select></label><Feedback state={state} /><button className="primary-button" disabled={pending || (type === "ORDER_TICKET" && !stations.length)} type="submit">{pending ? "กำลังเพิ่ม…" : "เพิ่มเส้นทางพิมพ์"}</button></form>;
}

function DeleteRouteForm({ branchId, routeId }: { branchId: string; routeId: string }) {
  const [state, action, pending] = useActionState(deletePrintRoute, initialState);
  return <form action={action} className="printer-inline-form"><input name="branchId" type="hidden" value={branchId} /><input name="routeId" type="hidden" value={routeId} /><button className="danger-button" disabled={pending} type="submit">{pending ? "กำลังลบ…" : "ลบ"}</button><Feedback state={state} /></form>;
}

function JobControls({ branchId, job }: { branchId: string; job: Job }) {
  const [retryState, retryAction, retrying] = useActionState(retryPrintJob, initialState);
  const [reprintState, reprintAction, reprinting] = useActionState(reprintJob, initialState);
  if (job.status === "FAILED") return <form action={retryAction} className="printer-job-action"><input name="branchId" type="hidden" value={branchId} /><input name="jobId" type="hidden" value={job.id} /><button className="secondary-button" disabled={retrying} type="submit">{retrying ? "กำลังเข้าคิว…" : "ลองใหม่"}</button><Feedback state={retryState} /></form>;
  if (job.status === "PRINTED") return <form action={reprintAction} className="printer-job-action"><input name="branchId" type="hidden" value={branchId} /><input name="jobId" type="hidden" value={job.id} /><input aria-label="เหตุผลพิมพ์ซ้ำ" maxLength={200} minLength={3} name="reason" placeholder="เหตุผลพิมพ์ซ้ำ" required /><button className="secondary-button" disabled={reprinting} type="submit">{reprinting ? "กำลังสร้าง…" : "พิมพ์ซ้ำ"}</button><Feedback state={reprintState} /></form>;
  return null;
}

function formatTime(value: string | null) {
  if (!value) return "ยังไม่เคยเชื่อมต่อ";
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(value));
}

const statusLabels: Record<string, string> = { QUEUED: "รอพิมพ์", CLAIMED: "Agent รับแล้ว", PRINTED: "พิมพ์แล้ว", FAILED: "ผิดพลาด" };

export function PrinterManagement({ agents, branchId, jobs, printers, routes, stations }: { agents: Agent[]; branchId: string; jobs: Job[]; printers: Printer[]; routes: Route[]; stations: Station[] }) {
  return <div className="printer-management">
    <section className="printer-section"><div className="printer-section-heading"><div><p className="eyebrow">1 · Local connector</p><h2>Print Agent</h2></div><p>โปรแกรมบน Windows เป็นสะพานระหว่างระบบออนไลน์กับ USB และวง LAN ของร้าน</p></div><div className="printer-two-column"><div className="printer-card-list">{agents.length ? agents.map((agent) => <article className={`printer-card ${agent.isActive ? "" : "is-inactive"}`} key={agent.id}><header><div><span className={`printer-status ${agent.isActive ? "active" : "inactive"}`}>{agent.isActive ? "เปิดใช้งาน" : "ปิดอยู่"}</span><h3>{agent.name}</h3></div><small>{agent.lastSeenAt ? `เชื่อมต่อล่าสุด ${formatTime(agent.lastSeenAt)}` : "รอติดตั้ง Agent"}{agent.version ? ` · v${agent.version}` : ""}</small></header>{agent.lastError ? <p className="printer-error">{agent.lastError}</p> : null}<AgentControls agent={agent} branchId={branchId} /></article>) : <p className="empty-state">ยังไม่มี Print Agent ในสาขานี้</p>}</div><aside className="printer-create-card"><p className="eyebrow">เพิ่ม Agent</p><h3>เครื่อง Windows ใหม่</h3><CreateAgentForm branchId={branchId} /></aside></div></section>

    <section className="printer-section"><div className="printer-section-heading"><div><p className="eyebrow">2 · Devices</p><h2>เครื่องพิมพ์</h2></div><p>รองรับ LAN ผ่าน port 9100 และ USB ผ่านชื่อ Printer Queue ของ Windows</p></div><div className="printer-two-column"><div className="printer-card-list">{printers.length ? printers.map((printer) => <article className={`printer-card ${printer.isActive ? "" : "is-inactive"}`} key={printer.id}><header><div><span className={`printer-status ${printer.isActive ? "active" : "inactive"}`}>{printer.isActive ? "พร้อมรับงาน" : "ปิดอยู่"}</span><h3>{printer.name}</h3></div><small>{printer.connection === "NETWORK" ? "LAN" : "Windows USB"} · {printer.paperWidth} มม. · {printer.codePage}</small></header><p className="printer-endpoint">{printer.endpoint}</p><p className="printer-agent-name">Agent: {printer.printAgentName ?? "ยังไม่ผูก"}</p><details><summary>แก้ไขเครื่องพิมพ์</summary><PrinterEditor agents={agents} branchId={branchId} printer={printer} /></details><PrinterControls branchId={branchId} printer={printer} /></article>) : <p className="empty-state">ยังไม่มีเครื่องพิมพ์ในสาขานี้</p>}</div><aside className="printer-create-card"><p className="eyebrow">เพิ่มอุปกรณ์</p><h3>เครื่องพิมพ์ใหม่</h3><PrinterEditor agents={agents} branchId={branchId} /></aside></div></section>

    <section className="printer-section"><div className="printer-section-heading"><div><p className="eyebrow">3 · Routing</p><h2>เส้นทางงานพิมพ์</h2></div><p>กำหนดใบสั่งอาหารแยกตามจุดผลิต และเลือกเครื่องสำหรับใบเสร็จได้อิสระ</p></div><div className="printer-two-column"><div className="printer-card-list">{routes.length ? routes.map((route) => <article className="printer-route-card" key={route.id}><div><strong>{route.documentType === "ORDER_TICKET" ? route.stationName : "ใบเสร็จรับเงิน"}</strong><span>→ {route.printerName} · {route.copies} ชุด</span></div><DeleteRouteForm branchId={branchId} routeId={route.id} /></article>) : <p className="empty-state">ยังไม่ได้กำหนดเส้นทาง งานจะไม่ถูกสร้างจนกว่าจะตั้งค่าส่วนนี้</p>}</div><aside className="printer-create-card"><p className="eyebrow">เพิ่ม Routing</p><h3>ส่งเอกสารไปเครื่อง</h3><RouteCreator branchId={branchId} printers={printers.filter((printer) => printer.isActive)} stations={stations} /></aside></div></section>

    <section className="printer-section"><div className="printer-section-heading"><div><p className="eyebrow">Queue monitor</p><h2>งานพิมพ์ล่าสุด</h2></div><p>งานล้มเหลวลองใหม่ได้ ส่วนงานที่สำเร็จต้องใส่เหตุผลก่อนพิมพ์ซ้ำ</p></div><div className="printer-job-table-wrap"><table className="printer-job-table"><thead><tr><th>งาน</th><th>เอกสาร</th><th>เครื่อง</th><th>สถานะ</th><th>เวลา</th><th>จัดการ</th></tr></thead><tbody>{jobs.length ? jobs.map((job) => <tr key={job.id}><td><code>{job.id.slice(-8)}</code><small>ลอง {job.attempts} ครั้ง</small></td><td>{job.documentType === "ORDER_TICKET" ? "ใบสั่งอาหาร" : job.documentType === "RECEIPT" ? "ใบเสร็จ" : "ทดสอบ"}</td><td>{job.printerName}</td><td><span className={`job-status ${job.status.toLowerCase()}`}>{statusLabels[job.status] ?? job.status}</span>{job.error ? <small className="job-error">{job.error}</small> : null}</td><td>{formatTime(job.printedAt ?? job.createdAt)}</td><td><JobControls branchId={branchId} job={job} /></td></tr>) : <tr><td className="empty-state" colSpan={6}>ยังไม่มีงานพิมพ์</td></tr>}</tbody></table></div></section>
  </div>;
}
