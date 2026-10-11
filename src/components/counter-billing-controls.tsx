"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  applyCounterDiscount,
  cancelCounterOrderItem,
  createSplitCounterBill,
  mergeCounterTable,
  moveCounterTable,
  receiveCounterPayment,
  requestCounterBill,
  voidCounterBill,
  type CounterActionResult,
} from "@/app/pos/actions";
import type { CounterPaymentOption, CounterTable } from "@/components/counter-pos-live-client";

type Feedback = { message: string; tone: "success" | "error" };

function money(satang: number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
  }).format(satang / 100);
}

function createIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function CounterBillingControls({
  branchId,
  table,
  tables,
  paymentMethods,
  hasOpenCashShift,
  canManagePayments,
}: {
  branchId: string;
  table: CounterTable;
  tables: CounterTable[];
  paymentMethods: CounterPaymentOption[];
  hasOpenCashShift: boolean;
  canManagePayments: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [splitQuantities, setSplitQuantities] = useState<Record<string, number>>({});
  const [moveTarget, setMoveTarget] = useState("");
  const [mergeTarget, setMergeTarget] = useState("");

  const availableLines = useMemo(
    () => table.orderLines
      .map((line) => ({ ...line, availableQuantity: Math.max(0, line.quantity - line.billedQuantity) }))
      .filter((line) => line.availableQuantity > 0),
    [table.orderLines],
  );
  const cancelableLines = table.orderLines.filter((line) => line.billedQuantity === 0);
  const vacantTargets = tables.filter((candidate) => candidate.id !== table.id && !candidate.hasOpenSession);
  const activeTargets = tables.filter((candidate) => candidate.id !== table.id && candidate.hasOpenSession);

  function run(action: () => Promise<CounterActionResult>, onSuccess?: () => void) {
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.error) {
          setFeedback({ message: result.error, tone: "error" });
          return;
        }
        setFeedback({ message: result.success ?? "บันทึกรายการแล้ว", tone: "success" });
        onSuccess?.();
        router.refresh();
      } catch {
        setFeedback({ message: "ทำรายการไม่สำเร็จ กรุณาลองอีกครั้ง", tone: "error" });
      }
    });
  }

  function submitSplitBill() {
    const selections = availableLines
      .map((line) => ({ orderItemId: line.id, quantity: splitQuantities[line.id] ?? 0 }))
      .filter((line) => line.quantity > 0);
    if (!selections.length) {
      setFeedback({ message: "เลือกอย่างน้อย 1 รายการสำหรับบิลแยก", tone: "error" });
      return;
    }
    run(
      () => createSplitCounterBill({ branchId, tableId: table.id, selections }),
      () => setSplitQuantities({}),
    );
  }

  return (
    <section className="billing-controls" aria-label="จัดการบิลและโต๊ะ">
      <div className="billing-section-heading">
        <div>
          <p className="eyebrow">Billing</p>
          <h3>บิลและการชำระเงิน</h3>
        </div>
        {availableLines.length ? (
          <button
            className="primary-button compact"
            disabled={isPending}
            onClick={() => run(() => requestCounterBill({ branchId, tableId: table.id }))}
            type="button"
          >
            ออกบิลทั้งหมด
          </button>
        ) : null}
      </div>

      {feedback ? <p className={`billing-feedback ${feedback.tone}`} role="status">{feedback.message}</p> : null}

      {canManagePayments && availableLines.length ? (
        <details className="billing-details">
          <summary>แยกบิลตามรายการ</summary>
          <div className="split-bill-form">
            {availableLines.map((line) => {
              const selected = splitQuantities[line.id] ?? 0;
              return (
                <div className="split-line" key={line.id}>
                  <div>
                    <strong>{line.name}</strong>
                    <small>เหลือ {line.availableQuantity} · {money(line.priceSatang)} / รายการ</small>
                  </div>
                  <div className="quantity-control">
                    <button
                      aria-label={`ลดจำนวน ${line.name}`}
                      disabled={isPending || selected === 0}
                      onClick={() => setSplitQuantities((current) => ({ ...current, [line.id]: Math.max(0, selected - 1) }))}
                      type="button"
                    >−</button>
                    <span>{selected}</span>
                    <button
                      aria-label={`เพิ่มจำนวน ${line.name}`}
                      disabled={isPending || selected >= line.availableQuantity}
                      onClick={() => setSplitQuantities((current) => ({ ...current, [line.id]: Math.min(line.availableQuantity, selected + 1) }))}
                      type="button"
                    >+</button>
                  </div>
                </div>
              );
            })}
            <button className="secondary-button" disabled={isPending} onClick={submitSplitBill} type="button">
              {isPending ? "กำลังสร้าง…" : "สร้างบิลจากรายการที่เลือก"}
            </button>
          </div>
        </details>
      ) : null}

      {table.bills.length ? (
        <div className="counter-bill-list">
          {table.bills.map((bill) => (
            <BillCard
              bill={bill}
              branchId={branchId}
              canManagePayments={canManagePayments}
              hasOpenCashShift={hasOpenCashShift}
              isPending={isPending}
              key={`${bill.id}:${bill.totalSatang}:${bill.paidSatang}`}
              paymentMethods={paymentMethods}
              run={run}
            />
          ))}
        </div>
      ) : <p className="billing-empty">ยังไม่มีบิล กดออกบิลทั้งหมดหรือเลือกแยกบิล</p>}

      {vacantTargets.length || (canManagePayments && (cancelableLines.length || activeTargets.length)) ? (
        <details className="billing-details table-operation-panel">
          <summary>{canManagePayments ? "ยกเลิกรายการ / ย้ายโต๊ะ / รวมโต๊ะ" : "ย้ายโต๊ะ"}</summary>
          {canManagePayments && cancelableLines.length ? (
            <div className="cancel-item-list">
              {cancelableLines.map((line) => (
                <CancelItemControl
                  branchId={branchId}
                  disabled={isPending}
                  itemId={line.id}
                  itemName={line.name}
                  key={line.id}
                  run={run}
                  tableId={table.id}
                />
              ))}
            </div>
          ) : null}
          {vacantTargets.length ? (
            <div className="table-operation-row">
              <label>
                <span>ย้ายทั้งโต๊ะไปโต๊ะว่าง</span>
                <select onChange={(event) => setMoveTarget(event.target.value)} value={moveTarget}>
                  <option value="">เลือกโต๊ะปลายทาง</option>
                  {vacantTargets.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}
                </select>
              </label>
              <button
                className="secondary-button"
                disabled={isPending || !moveTarget}
                onClick={() => run(() => moveCounterTable({ branchId, tableId: table.id, targetTableId: moveTarget }), () => setMoveTarget(""))}
                type="button"
              >ย้ายโต๊ะ</button>
            </div>
          ) : null}
          {canManagePayments && activeTargets.length ? (
            <div className="table-operation-row">
              <label>
                <span>รวมรายการเข้ากับโต๊ะที่เปิดอยู่</span>
                <select onChange={(event) => setMergeTarget(event.target.value)} value={mergeTarget}>
                  <option value="">เลือกโต๊ะหลัก</option>
                  {activeTargets.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}
                </select>
              </label>
              <button
                className="danger-button"
                disabled={isPending || !mergeTarget}
                onClick={() => run(() => mergeCounterTable({ branchId, tableId: table.id, targetTableId: mergeTarget }), () => setMergeTarget(""))}
                type="button"
              >รวมโต๊ะ</button>
            </div>
          ) : null}
        </details>
      ) : null}
    </section>
  );
}

function BillCard({
  bill,
  branchId,
  canManagePayments,
  paymentMethods,
  hasOpenCashShift,
  isPending,
  run,
}: {
  bill: CounterTable["bills"][number];
  branchId: string;
  canManagePayments: boolean;
  paymentMethods: CounterPaymentOption[];
  hasOpenCashShift: boolean;
  isPending: boolean;
  run: (action: () => Promise<CounterActionResult>, onSuccess?: () => void) => void;
}) {
  const [discountKind, setDiscountKind] = useState<"FIXED" | "PERCENT">("FIXED");
  const [discountValue, setDiscountValue] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [paymentMethod, setPaymentMethod] = useState(() => paymentMethods.find((method) => hasOpenCashShift || !method.isCash)?.code ?? paymentMethods[0]?.code ?? "");
  const [paymentAmount, setPaymentAmount] = useState(() => (Math.max(0, bill.totalSatang - bill.paidSatang) / 100).toFixed(2));
  const [paymentKey, setPaymentKey] = useState(createIdempotencyKey);
  const [voidReason, setVoidReason] = useState("");
  const remaining = Math.max(0, bill.totalSatang - bill.paidSatang);
  const selectedPaymentMethod = paymentMethods.find((method) => method.code === paymentMethod);
  const statusText: Record<string, string> = { OPEN: "รอชำระ", PARTIALLY_PAID: "ชำระบางส่วน", PAID: "ชำระแล้ว", REFUNDED: "คืนเงินแล้ว" };

  function submitDiscount() {
    const numericValue = Number(discountValue);
    if (!Number.isFinite(numericValue) || numericValue <= 0) return;
    const value = Math.round(numericValue * 100);
    run(
      () => applyCounterDiscount({ branchId, billId: bill.id, kind: discountKind, value, reason: discountReason }),
      () => {
        setDiscountValue("");
        setDiscountReason("");
      },
    );
  }

  function submitPayment() {
    const amountSatang = Math.round(Number(paymentAmount) * 100);
    if (!Number.isInteger(amountSatang) || amountSatang < 1 || !paymentMethod) return;
    run(
      () => receiveCounterPayment({ branchId, billId: bill.id, method: paymentMethod, amountSatang, idempotencyKey: paymentKey }),
      () => {
        setPaymentKey(createIdempotencyKey());
        setPaymentAmount((Math.max(0, remaining - amountSatang) / 100).toFixed(2));
      },
    );
  }

  return (
    <article className="counter-bill-card">
      <header className="counter-bill-header">
        <div>
          <span className={`sale-status ${bill.status.toLowerCase()}`}>{statusText[bill.status] ?? bill.status}</span>
          <h4>บิล #{bill.billNumber}</h4>
        </div>
        <strong>{money(bill.totalSatang)}</strong>
      </header>
      <div className="counter-bill-lines">
        {bill.lines.map((line) => <p key={line.id}><span>{line.quantity}× {line.name}</span><b>{money(line.subtotalSatang)}</b></p>)}
      </div>
      <div className="counter-bill-summary">
        <span>ก่อนส่วนลด <b>{money(bill.subtotalSatang)}</b></span>
        <span>ส่วนลด <b>−{money(bill.discountSatang)}</b></span>
        <span>รับแล้ว <b>{money(bill.paidSatang)}</b></span>
        <span className="remaining">คงเหลือ <b>{money(remaining)}</b></span>
      </div>
      {bill.discounts.length ? <div className="bill-discount-history">{bill.discounts.map((discount) => <small key={discount.id}>ส่วนลด {money(discount.amountSatang)} · {discount.reason}</small>)}</div> : null}

      {canManagePayments && remaining > 0 ? (
        <div className="bill-control-grid">
          <details className="bill-action-form">
            <summary>เพิ่มส่วนลด</summary>
            <label><span>ประเภท</span><select onChange={(event) => setDiscountKind(event.target.value as "FIXED" | "PERCENT")} value={discountKind}><option value="FIXED">จำนวนเงิน (บาท)</option><option value="PERCENT">เปอร์เซ็นต์ (%)</option></select></label>
            <label><span>{discountKind === "FIXED" ? "จำนวนเงิน" : "เปอร์เซ็นต์"}</span><input max={discountKind === "PERCENT" ? 100 : undefined} min="0.01" onChange={(event) => setDiscountValue(event.target.value)} step="0.01" type="number" value={discountValue} /></label>
            <label><span>เหตุผล</span><input maxLength={200} minLength={3} onChange={(event) => setDiscountReason(event.target.value)} placeholder="เช่น โปรโมชั่นสมาชิก" value={discountReason} /></label>
            <button className="secondary-button" disabled={isPending || !discountValue || discountReason.trim().length < 3} onClick={submitDiscount} type="button">ใช้ส่วนลด</button>
          </details>
          <div className="bill-action-form payment-form">
            <label><span>ช่องทาง</span><select onChange={(event) => setPaymentMethod(event.target.value)} value={paymentMethod}>{paymentMethods.map((method) => <option key={method.code} value={method.code}>{method.name}</option>)}</select></label>
            <label><span>รับชำระ (บาท)</span><input max={(remaining / 100).toFixed(2)} min="0.01" onChange={(event) => setPaymentAmount(event.target.value)} step="0.01" type="number" value={paymentAmount} /></label>
            {selectedPaymentMethod?.isCash && !hasOpenCashShift ? <small className="cash-shift-warning">ต้องเปิดกะเงินสดก่อนรับช่องทางนี้</small> : null}
            <button className="primary-button" disabled={isPending || remaining < 1 || !paymentMethod || (Boolean(selectedPaymentMethod?.isCash) && !hasOpenCashShift)} onClick={submitPayment} type="button">รับชำระ</button>
          </div>
        </div>
      ) : null}

      {canManagePayments && bill.paidSatang === 0 ? (
        <details className="void-bill-control">
          <summary>ยกเลิกบิลนี้</summary>
          <input maxLength={200} minLength={3} onChange={(event) => setVoidReason(event.target.value)} placeholder="ระบุเหตุผล" value={voidReason} />
          <button className="danger-button" disabled={isPending || voidReason.trim().length < 3} onClick={() => run(() => voidCounterBill({ branchId, billId: bill.id, reason: voidReason }))} type="button">ยืนยันยกเลิกบิล</button>
        </details>
      ) : null}
    </article>
  );
}

function CancelItemControl({ branchId, tableId, itemId, itemName, disabled, run }: { branchId: string; tableId: string; itemId: string; itemName: string; disabled: boolean; run: (action: () => Promise<CounterActionResult>, onSuccess?: () => void) => void }) {
  const [reason, setReason] = useState("");
  return <div className="cancel-item-row"><label><span>ยกเลิก {itemName}</span><input maxLength={200} minLength={3} onChange={(event) => setReason(event.target.value)} placeholder="เหตุผล" value={reason} /></label><button className="danger-button" disabled={disabled || reason.trim().length < 3} onClick={() => run(() => cancelCounterOrderItem({ branchId, tableId, orderItemId: itemId, reason }), () => setReason(""))} type="button">ยกเลิกรายการ</button></div>;
}
