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
  organizationName,
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
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [sessionQr, setSessionQr] = useState<{ sessionId: string; tableId: string; tableName: string; image: string; printQueued?: number; warning?: string } | null>(null);
  const [qrBySession, setQrBySession] = useState<Record<string, { image?: string; error?: string }>>({});
  const [qrPrintFeedback, setQrPrintFeedback] = useState<{ sessionId: string; message: string; tone: "success" | "error" } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isQrPending, startQrTransition] = useTransition();
  const [isQrPrinting, startQrPrintTransition] = useTransition();

  const selectedTable = tables.find((table) => table.id === selectedTableId) ?? tables[0];
  const visibleTables = useMemo(
    () => tables.filter((table) => filter === "ทั้งหมด" || table.status === filter),
    [filter, tables],
  );
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
      if (document.visibilityState === "visible") router.refresh();
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

  function printQrFromBrowser(tableName: string, image: string, sessionId: string) {
    const printWindow = window.open("", "_blank", "width=420,height=650");
    if (!printWindow) {
      setQrPrintFeedback({ sessionId, message: "เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาตป๊อปอัปแล้วลองอีกครั้ง", tone: "error" });
      return;
    }
    printWindow.opener = null;
    const document = printWindow.document;
    document.title = `${organizationName} · ${branchName} · QR ${tableName}`;
    const charset = document.createElement("meta");
    charset.setAttribute("charset", "utf-8");
    document.head.append(charset);
    const style = document.createElement("style");
    style.textContent = "@page{size:80mm 110mm;margin:4mm}body{margin:0;color:#17251c;font-family:Arial,Tahoma,sans-serif;text-align:center}main{width:72mm;max-width:100%;margin:0 auto}h1{margin:0 0 1mm;font-size:17px;font-weight:700}h2{margin:0 0 3mm;font-size:20px}.branch{margin:0 0 4mm;font-size:12px;font-weight:600}p{margin:2mm 0;font-size:11px;line-height:1.5}img{display:block;width:58mm;height:58mm;max-width:100%;margin:0 auto;image-rendering:pixelated}button{margin-top:8mm;padding:10px 16px;border:1px solid #777;border-radius:6px;background:white;font:inherit}@media print{button{display:none}}";
    document.head.append(style);
    const main = document.createElement("main");
    const title = document.createElement("h1");
    title.textContent = organizationName;
    const table = document.createElement("h2");
    table.textContent = tableName;
    const branch = document.createElement("p");
    branch.className = "branch";
    branch.textContent = `สาขา ${branchName}`;
    const description = document.createElement("p");
    description.textContent = "สแกน QR เพื่อสั่งอาหาร · ใช้ได้เฉพาะรอบโต๊ะนี้";
    const qr = document.createElement("img");
    qr.alt = `QR สั่งอาหารของ ${tableName}`;
    qr.onload = () => { printWindow.focus(); printWindow.print(); };
    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = "พิมพ์อีกครั้ง";
    retry.onclick = () => printWindow.print();
    main.append(title, branch, table, qr, description, retry);
    document.body.replaceChildren(main);
    qr.src = image;
  }

  return (
    <main className="pos-page">
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
              <button className="primary-button" onClick={() => printQrFromBrowser(sessionQr.tableName, sessionQr.image, sessionQr.sessionId)} type="button">
                พิมพ์จากเครื่องนี้
              </button>
              <button className="secondary-button" disabled={isQrPrinting} onClick={() => printQr(sessionQr.tableId, sessionQr.sessionId)} type="button">
                {isQrPrinting ? "กำลังส่งพิมพ์…" : "ส่งพิมพ์เครื่องร้าน"}
              </button>
              <button className="secondary-button" onClick={() => setSessionQr(null)} type="button">ปิด</button>
            </div>
          </section>
        </div>
      ) : null}
      <header className="pos-header">
        <div>
          <p className="eyebrow">หน้าร้าน · {branchName}</p>
          <h1>Counter POS</h1>
          <span className="tablet-staff-label">โหมดพนักงาน · แท็บเล็ต</span>
        </div>
        <div className="pos-actions">
          {canManageServiceRequests ? <a className="secondary-button" href="/requests">▣ คำขอจากโต๊ะ <span>{pendingServiceRequests}</span></a> : null}
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

      <div className="pos-layout">
        <section className="table-board">
          <div className="filter-row" aria-label="กรองสถานะโต๊ะ">
            {(["ทั้งหมด", "ว่าง", "กำลังสั่ง", "รออาหาร", "ขอเช็กบิล"] as const).map((status) => (
              <button
                className={filter === status ? "filter-button active" : "filter-button"}
                key={status}
                onClick={() => setFilter(status)}
                type="button"
              >
                {status}
              </button>
            ))}
          </div>
          <div className="table-grid">
            {visibleTables.map((table) => (
              <button
                className={`table-card ${statusClass[table.status]} ${selectedTable.id === table.id ? "selected" : ""}`}
                key={table.id}
                onClick={() => selectTable(table.id)}
                type="button"
              >
                <span className="table-status">{table.status}</span>
                <strong>{table.name}</strong>
                <small>{table.code} · {table.capacity} ที่นั่ง</small>
                <span>{table.totalSatang ? formatBaht(table.totalSatang) : "พร้อมรับลูกค้า"}</span>
                {table.updatedAtLabel ? <em>{table.updatedAtLabel}</em> : null}
              </button>
            ))}
          </div>
        </section>

        <aside className="pos-order-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">รายการโต๊ะ</p>
              <h2>{selectedTable.name}</h2>
            </div>
            <span className={`status-pill ${statusClass[selectedTable.status]}`}>{selectedTable.status}</span>
          </div>

          {feedback ? <p className={`pos-feedback ${feedback.tone}`} role="status">{feedback.message}</p> : null}

          {!selectedTable.hasOpenSession ? (
            <div className="empty-order">
              <p>โต๊ะนี้พร้อมรับลูกค้า</p>
              <button className="primary-button" disabled={isPending} onClick={() => openTable(selectedTable)} type="button">
                {isPending ? "กำลังเปิดโต๊ะ…" : "เปิดโต๊ะนี้"}
              </button>
            </div>
          ) : (
            <>
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
                      <button className="primary-button" disabled={!selectedSessionId} onClick={() => { if (selectedSessionId) printQrFromBrowser(selectedTable.name, selectedQrImage, selectedSessionId); }} type="button">
                        พิมพ์ QR
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
                      {isQrPrinting ? "กำลังส่งพิมพ์…" : "ส่งพิมพ์เครื่องร้าน"}
                    </button>
                  </div>
                )}
                {qrPrintFeedback?.sessionId === selectedSessionId ? <p className={`pos-feedback ${qrPrintFeedback.tone}`} role="status">{qrPrintFeedback.message}</p> : null}
              </section>
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
              ) : <div className="empty-order"><p>ยังไม่มีรายการอาหารสำหรับโต๊ะนี้</p></div>}

              {selectedTable.status !== "ขอเช็กบิล" ? (
                <Link className="add-menu-button" href={`/pos/${branchId}/add-items/${selectedTable.id}`}>
                  + เพิ่มรายการอาหาร
                </Link>
              ) : null}

              {selectedTable.totalSatang ? <CounterBillingControls branchId={branchId} canManagePayments={canManagePayments} hasOpenCashShift={hasOpenCashShift} paymentMethods={paymentMethods} table={selectedTable} tables={tables} /> : null}
            </>
          )}
          <p className="panel-note">ข้อมูลทุกการทำงานบันทึกลง Neon</p>
        </aside>
      </div>
    </main>
  );
}
