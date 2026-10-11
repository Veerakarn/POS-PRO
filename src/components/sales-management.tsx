"use client";

import { useActionState, useState } from "react";

import { refundSalePayment, type RefundState } from "@/app/sales/actions";

const initial: RefundState = {};
type Payment = { id: string; method: string; amountSatang: number; status: string; refundableSatang: number };
export type SaleBill = { id: string; billNumber: number; status: string; tableName: string; subtotalSatang: number; discountSatang: number; taxSatang: number; totalSatang: number; refundedSatang: number; createdAt: string; lines: Array<{ id: string; name: string; quantity: number; subtotalSatang: number }>; discounts: Array<{ id: string; amountSatang: number; reason: string }>; payments: Payment[] };
function money(value: number) { return new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" }).format(value / 100); }
function time(value: string) { return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(value)); }

function RefundForm({ branchId, payment }: { branchId: string; payment: Payment }) {
  const [state, action, pending] = useActionState(refundSalePayment, initial);
  const [key] = useState(() => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
  return <form action={action} className="refund-form"><input name="branchId" type="hidden" value={branchId} /><input name="paymentId" type="hidden" value={payment.id} /><input name="idempotencyKey" type="hidden" value={key} /><label><span>ยอดคืน (บาท)</span><input defaultValue={(payment.refundableSatang / 100).toFixed(2)} max={(payment.refundableSatang / 100).toFixed(2)} min="0.01" name="amount" required step="0.01" type="number" /></label><label><span>เหตุผล</span><input maxLength={200} minLength={3} name="reason" placeholder="เช่น ลูกค้าได้รับรายการไม่ครบ" required /></label>{state.error ? <p className="form-error">{state.error}</p> : null}{state.success ? <p className="form-success">{state.success}</p> : null}<button className="danger-button" disabled={pending} type="submit">{pending ? "กำลังคืน…" : "ยืนยันคืนเงิน"}</button></form>;
}

const statusText: Record<string,string> = { OPEN: "รอชำระ", PARTIALLY_PAID: "ชำระบางส่วน", PAID: "ชำระแล้ว", VOIDED: "ยกเลิก", REFUNDED: "คืนเงินครบ" };

export function SalesManagement({ bills, branchId }: { bills: SaleBill[]; branchId: string }) {
  return <div className="sales-list">{bills.length ? bills.map((bill) => <article className="sale-card" key={bill.id}><header><div><span className={`sale-status ${bill.status.toLowerCase()}`}>{statusText[bill.status] ?? bill.status}</span><h2>บิล #{bill.billNumber} · {bill.tableName}</h2><small>{time(bill.createdAt)}</small></div><strong>{money(bill.totalSatang)}</strong></header><details><summary>ดูรายละเอียด {bill.lines.length} รายการ</summary><div className="sale-lines">{bill.lines.map((line) => <div key={line.id}><span>{line.quantity}× {line.name}</span><strong>{money(line.subtotalSatang)}</strong></div>)}</div><div className="sale-totals"><span>ก่อนส่วนลด <b>{money(bill.subtotalSatang)}</b></span><span>ส่วนลด <b>−{money(bill.discountSatang)}</b></span><span>คืนแล้ว <b>−{money(bill.refundedSatang)}</b></span><span>ยอดสุทธิ <b>{money(bill.totalSatang)}</b></span></div>{bill.discounts.length ? <div className="discount-history">{bill.discounts.map((discount) => <p key={discount.id}>ส่วนลด {money(discount.amountSatang)} · {discount.reason}</p>)}</div> : null}</details><div className="sale-payments">{bill.payments.map((payment) => <article key={payment.id}><div><strong>{payment.method}</strong><span>{money(payment.amountSatang)} · {payment.status === "REFUNDED" ? "คืนครบแล้ว" : "รับชำระสำเร็จ"}</span></div>{payment.refundableSatang > 0 ? <details><summary>คืนเงิน</summary><RefundForm branchId={branchId} key={`${payment.id}:${payment.refundableSatang}`} payment={payment} /></details> : null}</article>)}</div></article>) : <p className="empty-state">ยังไม่มีบิลในสาขานี้</p>}</div>;
}
