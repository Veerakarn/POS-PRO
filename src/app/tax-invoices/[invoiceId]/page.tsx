import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PrintInvoiceButton } from "@/components/print-invoice-button";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";

type Seller = { legalName: string; taxpayerId: string; address: string; branchNumber: string; vatRateBps: number };
type Buyer = { name: string; address: string; taxpayerId: string | null };
type Item = { nameSnapshot: string; quantity: number; unitPriceSatang: number; subtotalSatang: number };
const money = (n: number) => new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n / 100);

export default async function TaxInvoicePage({ params }: { params: Promise<{ invoiceId: string }> }) {
  await connection();
  const { invoiceId } = await params;
  const invoice = await db.taxInvoice.findFirst({ where: { id: invoiceId }, select: { id: true, invoiceNumber: true, sellerSnapshot: true, buyerSnapshot: true, itemsSnapshot: true, subtotalSatang: true, discountSatang: true, taxableSatang: true, taxSatang: true, totalSatang: true, createdAt: true, bill: { select: { branchId: true, billNumber: true } } } });
  if (!invoice) notFound();
  await requirePermission("payment.manage", invoice.bill.branchId);
  const seller = invoice.sellerSnapshot as Seller;
  const buyer = invoice.buyerSnapshot as Buyer;
  const items = invoice.itemsSnapshot as Item[];
  return <main className="tax-invoice-paper">
    <div className="invoice-toolbar print-hide"><a href={`/pos/${invoice.bill.branchId}`}>กลับไป POS</a><PrintInvoiceButton /></div>
    <header className="tax-document-heading"><strong>ใบกำกับภาษี</strong><h1>{seller.legalName}</h1><p>{seller.address}</p><p>เลขประจำตัวผู้เสียภาษี {seller.taxpayerId} · สาขา {seller.branchNumber === "00000" ? "สำนักงานใหญ่" : seller.branchNumber}</p></header>
    <div className="tax-document-meta"><p><b>เลขที่</b> {invoice.invoiceNumber}</p><p><b>วันที่</b> {invoice.createdAt.toLocaleDateString("th-TH", { dateStyle: "long" })}</p><p><b>อ้างอิงบิล</b> #{invoice.bill.billNumber}</p></div>
    <section className="invoice-buyer"><h2>ผู้ซื้อ</h2><p><b>ชื่อ</b> {buyer.name}</p><p><b>ที่อยู่</b> {buyer.address}</p>{buyer.taxpayerId ? <p><b>เลขประจำตัวผู้เสียภาษี</b> {buyer.taxpayerId}</p> : null}</section>
    <table className="invoice-lines"><thead><tr><th>รายการ</th><th>จำนวน</th><th>ราคาต่อหน่วย</th><th>จำนวนเงิน</th></tr></thead><tbody>{items.map((item, index) => <tr key={`${item.nameSnapshot}-${index}`}><td>{item.nameSnapshot}</td><td>{item.quantity}</td><td>{money(item.unitPriceSatang)}</td><td>{money(item.subtotalSatang)}</td></tr>)}</tbody></table>
    <section className="invoice-totals"><p><span>มูลค่าก่อนส่วนลด</span><b>{money(invoice.subtotalSatang)}</b></p><p><span>ส่วนลด</span><b>−{money(invoice.discountSatang)}</b></p><p><span>มูลค่าฐานภาษี</span><b>{money(invoice.taxableSatang)}</b></p><p><span>ภาษีมูลค่าเพิ่ม ({seller.vatRateBps / 100}%)</span><b>{money(invoice.taxSatang)}</b></p><p className="invoice-grand-total"><span>ยอดรวมสุทธิ</span><b>{money(invoice.totalSatang)}</b></p></section>
    <footer className="invoice-footer">เอกสารเลขที่ {invoice.invoiceNumber}</footer>
  </main>;
}
