"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

import {
  getCounterTableQr,
  openCounterTable,
  reprintCounterTableQr,
} from "@/app/pos/actions";
import { CounterBillingControls } from "@/components/counter-billing-controls";
import { PosIcon } from "@/components/pos-icon";

export type CounterTableStatus = "ว่าง" | "กำลังสั่ง" | "รออาหาร" | "ขอเช็กบิล";

export type CounterTable = {
  id: string;
  code: string;
  name: string;
  capacity: number;
  status: CounterTableStatus;
  sessionId: string | null;
  totalSatang: number;
  updatedAtLabel: string | null;
  hasOpenSession: boolean;
  orderLines: Array<{
    id: string;
    name: string;
    quantity: number;
    priceSatang: number;
    status: string;
    billedQuantity: number;
  }>;
  bills: CounterBill[];
};

export type CounterBill = {
  id: string;
  billNumber: number;
  status: string;
  subtotalSatang: number;
  discountSatang: number;
  taxSatang: number;
  totalSatang: number;
  paidSatang: number;
  lines: Array<{ id: string; orderItemId: string; quantity: number; name: string; subtotalSatang: number }>;
  discounts: Array<{ id: string; billLineId: string | null; amountSatang: number; reason: string }>;
  member: { id: string; name: string; phone: string; points: number } | null;
  taxInvoices: Array<{ id: string; invoiceNumber: string }>;
};

export type CounterPaymentOption = { code: string; name: string; isCash: boolean };

type Feedback = { message: string; tone: "success" | "error" };
type CounterActionResult = { error?: string; success?: string; warning?: string; qrDataUrl?: string; printQueued?: number; sessionId?: string };

const statusClass: Record<CounterTableStatus, string> = {
  ว่าง: "available",
  กำลังสั่ง: "ordering",
  รออาหาร: "waiting",
  ขอเช็กบิล: "check-requested",
};

const orderItemStatus: Record<string, string> = {
  NEW: "เข้าคิวแล้ว",
  ACKNOWLEDGED: "ครัวรับแล้ว",
  PREPARING: "กำลังทำ",
  READY: "พร้อมเสิร์ฟ",
  SERVED: "เสิร์ฟแล้ว",
  CANCELLED: "ยกเลิก",
};

function formatBaht(satang: number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(satang / 100);
}

export function CounterPosLiveClient({
  branchId,
  branchName,
  tables,
  initialTableId,
  pendingServiceRequests,
  paymentMethods,
  hasOpenCashShift,
  canManagePayments,
  canManageServiceRequests,
}: {
  branchId: string;
  branchName: string;
  organizationName: string;
  tables: CounterTable[];
  initialTableId?: string;
  pendingServiceRequests: number;
  paymentMethods: CounterPaymentOption[];
  hasOpenCashShift: boolean;
  canManagePayments: boolean;
  canManageServiceRequests: boolean;
}) {
  const router = useRouter();
  const [selectedTableId, setSelectedTableId] = useState(() => tables.find((table) => table.id === initialTableId)?.id ?? tables.find((table) => table.hasOpenSession)?.id ?? tables[0]?.id ?? "");
  const [filter, setFilter] = useState<CounterTableStatus | "ทั้งหมด">("ทั้งหมด");
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [tableView, setTableView] = useState<"tables" | "detail">(initialTableId ? "detail" : "tables");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [sessionQr, setSessionQr] = useState<{ sessionId: string; tableId: string; tableName: string; image: string; printQueued?: number; warning?: string } | null>(null);
  const [qrBySession, setQrBySession] = useState<Record<string, { image?: string; error?: string }>>({});
  const [qrPrintFeedback, setQrPrintFeedback] = useState<{ sessionId: string; message: string; tone: "success" | "error" } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isQrPending, startQrTransition] = useTransition();
  const [isQrPrinting, startQrPrintTransition] = useTransition();

  const selectedTable = tables.find((table) => table.id === selectedTableId) ?? tables[0];
  const visibleTables = useMemo(
    () => tables.filter((table) => (filter === "ทั้งหมด" || table.status === filter) && `${table.name} ${table.code}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())),
    [filter, tables, search],
  );
  const availableCount = tables.filter((table) => table.status === "ว่าง").length;
  const checkCount = tables.filter((table) => table.status === "ขอเช็กบิล").length;
  const selectedSessionId = selectedTable?.sessionId ?? null;
  const selectedTableForQr = selectedTable?.id ?? null;
  const selectedQr = selectedSessionId ? qrBySession[selectedSessionId] : null;
  const selectedQrImage = selectedQr?.image;

  const loadQr = useCallback((tableId: string, sessionId: string) => {
    startQrTransition(async () => {
      try {
        const result = await getCounterTableQr({ branchId, tableId, sessionId });
        setQrBySession((current) => ({
          ...current,
          [sessionId]: result.qrDataUrl ? { image: result.qrDataUrl } : { error: result.error ?? "แสดง QR ไม่สำเร็จ" },
        }));
      } catch {
        setQrBySession((current) => ({ ...current, [sessionId]: { error: "โหลด QR ไม่สำเร็จ กรุณาลองอีกครั้ง" } }));
      }
    });
  }, [branchId]);

  useEffect(() => {
    if (selectedTableForQr && selectedSessionId) loadQr(selectedTableForQr, selectedSessionId);
  }, [loadQr, selectedTableForQr, selectedSessionId]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible" && !document.querySelector('[role="dialog"], dialog[open]')) router.refresh();
    };
    const refreshTimer = window.setInterval(refreshWhenVisible, 5_000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(refreshTimer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [router]);

  if (!selectedTable) {
    return (
      <main className="pos-page">
        <section className="empty-request-state">
          <span>+</span>
          <h2>ยังไม่มีโต๊ะในสาขานี้</h2>
          <p>เพิ่มโต๊ะจากเมนู “โต๊ะและ QR” ก่อนเปิด Counter POS</p>
        </section>
      </main>
    );
  }

  function selectTable(tableId: string) {
    setSelectedTableId(tableId);
    setTableView("detail");
    setFeedback(null);
    setQrPrintFeedback(null);
  }

  function run(action: () => Promise<CounterActionResult>, onSuccess?: (result: CounterActionResult) => void) {
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.error) {
          setFeedback({ message: result.error, tone: "error" });
          return;
        }
        setFeedback({ message: result.warning ?? result.success ?? "บันทึกรายการแล้ว", tone: result.warning ? "error" : "success" });
        onSuccess?.(result);
        router.refresh();
      } catch {
        setFeedback({ message: "บันทึกรายการไม่สำเร็จ กรุณาลองอีกครั้ง", tone: "error" });
      }
    });
  }

  function openTable(table: CounterTable) {
    run(() => openCounterTable({ branchId, tableId: table.id }), (result) => {
      if (result.qrDataUrl && result.sessionId) showQr(result.sessionId, table.id, table.name, result.qrDataUrl, result.printQueued ?? 0, result.warning);
    });
  }

  function showQr(sessionId: string, tableId: string, tableName: string, image: string, printQueued?: number, warning?: string) {
    setQrPrintFeedback(null);
    setSessionQr({ sessionId, tableId, tableName, image, printQueued, warning });
  }

  function printQr(tableId: string, sessionId: string) {
    setQrPrintFeedback(null);
    startQrPrintTransition(async () => {
      try {
        const result = await reprintCounterTableQr({ branchId, tableId, sessionId });
        setQrPrintFeedback({ sessionId, message: result.error ?? result.success ?? "ส่งงานพิมพ์แล้ว", tone: result.error ? "error" : "success" });
      } catch {
        setQrPrintFeedback({ sessionId, message: "ส่งพิมพ์ QR ไม่สำเร็จ กรุณาลองอีกครั้ง", tone: "error" });
      }
    });
  }

  return (
    <main className="pos-page pos-workspace">
      {sessionQr ? (
        <div className="session-qr-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSessionQr(null);
        }}>
          <section aria-labelledby="session-qr-title" aria-modal="true" className="session-qr-dialog" role="dialog">
            <button aria-label="ปิด QR" autoFocus className="session-qr-close" onClick={() => setSessionQr(null)} type="button">×</button>
            <p className="eyebrow">QR ประจำรอบโต๊ะ</p>
            <h2 id="session-qr-title">{sessionQr.tableName}</h2>
            <Image alt={`QR รอบปัจจุบันของ ${sessionQr.tableName}`} height={260} src={sessionQr.image} unoptimized width={260} />
            <p>QR นี้ใช้ได้เฉพาะรอบที่เปิดอยู่ เมื่อปิดโต๊ะแล้ว QR นี้จะใช้ไม่ได้</p>
            {sessionQr.warning ? <p className="form-error">{sessionQr.warning}</p> : null}
            {sessionQr.printQueued === undefined ? null : sessionQr.printQueued ? (
              <p className="form-success">ส่งงานพิมพ์แล้ว {sessionQr.printQueued} เครื่อง · กรุณารับ QR จากเครื่องพิมพ์</p>
            ) : !sessionQr.warning ? (
              <p className="configuration-notice">ยังไม่ได้ตั้งเส้นทางพิมพ์ QR · <a href="/settings/printers">ตั้งค่าเครื่องพิมพ์</a></p>
            ) : null}
            {qrPrintFeedback?.sessionId === sessionQr.sessionId ? (
              <p className={qrPrintFeedback.tone === "error" ? "form-error" : "form-success"} role="status">{qrPrintFeedback.message}</p>
            ) : null}
            <div className="session-qr-dialog-actions">
              <button className="primary-button" disabled={isQrPrinting} onClick={() => printQr(sessionQr.tableId, sessionQr.sessionId)} type="button">
                {isQrPrinting ? "กำลังส่งพิมพ์…" : "พิมพ์ QR"}
              </button>
              <button className="secondary-button" onClick={() => setSessionQr(null)} type="button">ปิด</button>
            </div>
          </section>
        </div>
      ) : null}
      <header className="pos-header">
        <div>
          <p className="eyebrow">COUNTER POS <span> / {branchName}</span></p>
          <h1>เคาน์เตอร์<span className="pos-live-indicator"><i /> อัปเดตสด</span></h1>
          <p className="pos-header-description">จัดการโต๊ะ รับออเดอร์ และชำระเงิน</p>
        </div>
        <div className="pos-actions">
          {canManageServiceRequests ? <Link className="secondary-button pos-service-link" href="/requests"><PosIcon name="receipt" />คำขอจากโต๊ะ <span>{pendingServiceRequests}</span></Link> : null}
          <button
            className="primary-button compact"
            disabled={isPending || !tables.some((table) => table.status === "ว่าง")}
            onClick={() => {
              const nextTable = tables.find((table) => table.status === "ว่าง");
              if (nextTable) {
                selectTable(nextTable.id);
                openTable(nextTable);
              }
            }}
            type="button"
          >
            + เปิดโต๊ะ
          </button>
        </div>
      </header>

      <div className="pos-overview" aria-label="ภาพรวมโต๊ะ">
        <div><span className="pos-overview-icon"><PosIcon name="tables" /></span><span>โต๊ะทั้งหมด<strong>{tables.length}<small> โต๊ะ</small></strong></span></div>
        <div><span className="pos-overview-dot available" /><span>โต๊ะว่าง<strong>{availableCount}<small> โต๊ะ</small></strong></span></div>
        <div><span className="pos-overview-dot occupied" /><span>กำลังใช้งาน<strong>{tables.length - availableCount}<small> โต๊ะ</small></strong></span></div>
        <div><span className="pos-overview-dot check" /><span>รอเช็กบิล<strong>{checkCount}<small> โต๊ะ</small></strong></span></div>
      </div>

      <div className="pos-view-switch" aria-label="มุมมอง Counter POS">
        <button aria-pressed={tableView === "tables"} className={tableView === "tables" ? "active" : ""} onClick={() => setTableView("tables")} type="button"><PosIcon name="tables" />โต๊ะทั้งหมด</button>
        <button aria-pressed={tableView === "detail"} className={tableView === "detail" ? "active" : ""} onClick={() => setTableView("detail")} type="button"><PosIcon name="receipt" />{selectedTable.name}</button>
      </div>

      <div className={`pos-layout pos-view-${tableView}`}>
        <section className="table-board" aria-label="ผังโต๊ะ">
          <div className="pos-board-heading"><div><h2>เลือกโต๊ะ</h2><span>{visibleTables.length} จาก {tables.length} โต๊ะ</span></div><div className="pos-board-tools"><label className="pos-search"><PosIcon name="search" /><input aria-label="ค้นหาโต๊ะ" placeholder="ค้นหาชื่อ / เลขโต๊ะ" type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label><button className={`pos-filter-toggle${filtersOpen ? " active" : ""}`} aria-label="กรองสถานะโต๊ะ" aria-expanded={filtersOpen} aria-controls="pos-status-filters" type="button" onClick={() => setFiltersOpen(!filtersOpen)}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M4 6h16M7 12h13m-10 6h10" /></svg></button></div></div>
          <div className={`filter-row${filtersOpen ? " is-filter-open" : ""}`} id="pos-status-filters" aria-label="กรองสถานะโต๊ะ">
            {(["ทั้งหมด", "ว่าง", "กำลังสั่ง", "รออาหาร", "ขอเช็กบิล"] as const).map((status) => (
              <button
                className={filter === status ? "filter-button active" : "filter-button"}
                aria-pressed={filter === status}
                key={status}
                onClick={() => setFilter(status)}
                type="button"
              >
                {status}<span>{status === "ทั้งหมด" ? tables.length : tables.filter((table) => table.status === status).length}</span>
              </button>
            ))}
          </div>
          <div className="table-grid">
            {visibleTables.map((table) => (
              <button
                className={`table-card ${statusClass[table.status]} ${selectedTable.id === table.id ? "selected" : ""}`}
                aria-pressed={selectedTable.id === table.id}
                key={table.id}
                onClick={() => selectTable(table.id)}
                type="button"
              >
                <div className="pos-table-card-top"><span className="table-status">{table.status}</span><span className="pos-table-selected" aria-hidden="true">{selectedTable.id === table.id ? "✓" : <PosIcon name="tables" />}</span></div>
                <strong>{table.name}</strong>
                <small><PosIcon name="guests" />{table.capacity} ที่นั่ง <span>· {table.code}</span></small>
                <span className="pos-table-amount">{table.totalSatang ? formatBaht(table.totalSatang) : table.hasOpenSession ? "ยังไม่มีรายการ" : "พร้อมรับลูกค้า"}</span>
                {table.updatedAtLabel ? <em>{table.updatedAtLabel}</em> : null}
              </button>
            ))}
          </div>
          {!visibleTables.length ? <div className="pos-table-empty"><PosIcon name="search" /><h3>ไม่พบโต๊ะที่ค้นหา</h3><p>ลองเปลี่ยนคำค้นหรือเลือกสถานะอื่น</p><button type="button" className="secondary-button" onClick={() => { setSearch(""); setFilter("ทั้งหมด"); }}>แสดงโต๊ะทั้งหมด</button></div> : null}
        </section>

        <aside className="pos-order-panel" aria-label={`รายละเอียด ${selectedTable.name}`}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">รายละเอียดโต๊ะ</p>
              <h2>{selectedTable.name}</h2>
            </div>
            <span className={`status-pill ${statusClass[selectedTable.status]}`}>{selectedTable.status}</span>
          </div>

          {feedback ? <p className={`pos-feedback ${feedback.tone}`} role="status">{feedback.message}</p> : null}

          {!selectedTable.hasOpenSession ? (
            <div className="empty-order">
              <span className="pos-empty-icon"><PosIcon name="tables" /></span><h3>พร้อมต้อนรับลูกค้า</h3><p>{selectedTable.capacity} ที่นั่ง · เปิดโต๊ะเพื่อเริ่มรับออเดอร์</p>
              <button className="primary-button" disabled={isPending} onClick={() => openTable(selectedTable)} type="button">
                {isPending ? "กำลังเปิดโต๊ะ…" : "เปิดโต๊ะนี้"}
              </button>
            </div>
          ) : (
            <>
              <details className="pos-qr-details" open key={selectedTable.id}><summary><PosIcon name="qr" /><span>QR ประจำโต๊ะ</span><span className="pos-qr-chevron" aria-hidden="true">⌄</span></summary>
              <section aria-label={`QR ของ ${selectedTable.name}`} className="counter-active-qr">
                <div className="counter-active-qr-heading">
                  <div><p className="eyebrow">QR ประจำรอบโต๊ะ</p><h3>{selectedTable.name}</h3></div>
                  <span>ใช้ได้จนกว่าจะปิดโต๊ะ</span>
                </div>
                {selectedQrImage ? (
                  <div className="counter-active-qr-content">
                    <button aria-label={`ขยาย QR ของ ${selectedTable.name}`} className="counter-active-qr-image" onClick={() => { if (selectedSessionId) showQr(selectedSessionId, selectedTable.id, selectedTable.name, selectedQrImage); }} type="button">
                      <Image alt={`QR รอบปัจจุบันของ ${selectedTable.name}`} height={148} src={selectedQrImage} unoptimized width={148} />
                    </button>
                    <div className="counter-active-qr-details">
                      <p>ให้ลูกค้าสแกน QR นี้เพื่อสั่งอาหาร เป็นรหัสของรอบโต๊ะปัจจุบัน</p>
                      <button className="secondary-button" onClick={() => { if (selectedSessionId) showQr(selectedSessionId, selectedTable.id, selectedTable.name, selectedQrImage); }} type="button">ขยาย QR</button>
                      <button className="primary-button" disabled={!selectedSessionId || isQrPrinting} onClick={() => { if (selectedSessionId) printQr(selectedTable.id, selectedSessionId); }} type="button">
                        {isQrPrinting ? "กำลังส่งพิมพ์…" : "พิมพ์ QR"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="counter-active-qr-empty">
                    <p>{selectedQr?.error ?? (isQrPending ? "กำลังโหลด QR ของรอบโต๊ะ…" : "กำลังเตรียม QR ของรอบโต๊ะ…")}</p>
                    {selectedQr?.error && selectedSessionId ? (
                      <button className="secondary-button" disabled={isQrPending} onClick={() => loadQr(selectedTable.id, selectedSessionId)} type="button">ลองโหลด QR อีกครั้ง</button>
                    ) : null}
                    <button className="primary-button" disabled={!selectedSessionId || isQrPrinting} onClick={() => { if (selectedSessionId) printQr(selectedTable.id, selectedSessionId); }} type="button">
                      {isQrPrinting ? "กำลังส่งพิมพ์…" : "พิมพ์ QR"}
                    </button>
                  </div>
                )}
                {qrPrintFeedback?.sessionId === selectedSessionId ? <p className={`pos-feedback ${qrPrintFeedback.tone}`} role="status">{qrPrintFeedback.message}</p> : null}
              </section>
              </details>
              <div className="pos-order-list-heading"><h3>รายการอาหาร</h3><span>{selectedTable.orderLines.reduce((sum, item) => sum + item.quantity, 0)} รายการ</span></div>
              {selectedTable.orderLines.length ? (
                <div className="order-lines">
                  {selectedTable.orderLines.map((item) => (
                    <div className="pos-order-line" key={item.id}>
                      <span>{item.quantity}×</span>
                      <div>
                        <strong>{item.name}</strong>
                        <small>{orderItemStatus[item.status] ?? item.status}</small>
                        {item.billedQuantity ? <small>ออกบิลแล้ว {item.billedQuantity}/{item.quantity}</small> : null}
                      </div>
                      <span>{formatBaht(item.priceSatang * item.quantity)}</span>
                    </div>
                  ))}
                </div>
              ) : <div className="empty-order pos-empty-items"><PosIcon name="food" /><p>ยังไม่มีรายการอาหาร</p><small>แตะ “เพิ่มอาหาร” เพื่อเริ่มรับออเดอร์</small></div>}

              <div className="pos-order-quick-action"><div><span>ยอดรายการอาหาร</span><strong>{formatBaht(selectedTable.totalSatang)}</strong></div>{selectedTable.status !== "ขอเช็กบิล" ? <Link className="primary-button" href={`/pos/${branchId}/add-items/${selectedTable.id}`}><span aria-hidden="true">+</span> เพิ่มอาหาร</Link> : <span className="pos-check-note">รอชำระเงิน</span>}</div>

              {selectedTable.totalSatang ? <CounterBillingControls branchId={branchId} canManagePayments={canManagePayments} hasOpenCashShift={hasOpenCashShift} paymentMethods={paymentMethods} table={selectedTable} tables={tables} /> : null}
            </>
          )}
          <p className="panel-note">เลือกโต๊ะเพื่อดูออเดอร์และจัดการรายการได้ที่นี่</p>
        </aside>
      </div>
    </main>
  );
}
