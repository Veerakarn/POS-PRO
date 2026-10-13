-- AlterTable
ALTER TABLE "Bill" ADD COLUMN     "memberId" TEXT,
ADD COLUMN     "taxIncluded" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "taxRateBps" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "BillDiscount" ADD COLUMN     "promoCodeId" TEXT;

-- CreateTable
CREATE TABLE "PromoCode" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "DiscountKind" NOT NULL,
    "value" INTEGER NOT NULL,
    "minimumSatang" INTEGER NOT NULL DEFAULT 0,
    "maximumDiscountSatang" INTEGER,
    "usageLimit" INTEGER,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionRedemption" (
    "id" TEXT NOT NULL,
    "promoCodeId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "codeSnapshot" TEXT NOT NULL,
    "amountSatang" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromotionRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerMember" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "pointsPerHundredBaht" INTEGER NOT NULL DEFAULT 1,
    "pointsPerHundredSatang" INTEGER NOT NULL DEFAULT 10000,
    "redemptionCapPercent" INTEGER NOT NULL DEFAULT 50,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyEntry" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "billId" TEXT,
    "entryKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "taxpayerId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "branchNumber" TEXT NOT NULL DEFAULT '00000',
    "isVatRegistered" BOOLEAN NOT NULL DEFAULT false,
    "vatRateBps" INTEGER NOT NULL DEFAULT 700,
    "taxIncluded" BOOLEAN NOT NULL DEFAULT true,
    "documentPrefix" TEXT NOT NULL DEFAULT 'TAX',
    "nextDocumentNumber" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxInvoice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "taxProfileId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "sellerSnapshot" JSONB NOT NULL,
    "buyerSnapshot" JSONB NOT NULL,
    "itemsSnapshot" JSONB NOT NULL,
    "subtotalSatang" INTEGER NOT NULL,
    "discountSatang" INTEGER NOT NULL,
    "taxableSatang" INTEGER NOT NULL,
    "taxSatang" INTEGER NOT NULL,
    "totalSatang" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PromoCode_organizationId_isActive_startsAt_endsAt_idx" ON "PromoCode"("organizationId", "isActive", "startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_organizationId_code_key" ON "PromoCode"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionRedemption_billId_key" ON "PromotionRedemption"("billId");

-- CreateIndex
CREATE INDEX "PromotionRedemption_promoCodeId_createdAt_idx" ON "PromotionRedemption"("promoCodeId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerMember_organizationId_name_idx" ON "CustomerMember"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerMember_organizationId_phone_key" ON "CustomerMember"("organizationId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipSettings_organizationId_key" ON "MembershipSettings"("organizationId");

-- CreateIndex
CREATE INDEX "LoyaltyEntry_memberId_createdAt_idx" ON "LoyaltyEntry"("memberId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyEntry_memberId_entryKey_key" ON "LoyaltyEntry"("memberId", "entryKey");

-- CreateIndex
CREATE UNIQUE INDEX "TaxProfile_branchId_key" ON "TaxProfile"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "TaxInvoice_billId_key" ON "TaxInvoice"("billId");

-- CreateIndex
CREATE INDEX "TaxInvoice_organizationId_createdAt_idx" ON "TaxInvoice"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaxInvoice_organizationId_invoiceNumber_key" ON "TaxInvoice"("organizationId", "invoiceNumber");

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "CustomerMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillDiscount" ADD CONSTRAINT "BillDiscount_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRedemption" ADD CONSTRAINT "PromotionRedemption_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRedemption" ADD CONSTRAINT "PromotionRedemption_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerMember" ADD CONSTRAINT "CustomerMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipSettings" ADD CONSTRAINT "MembershipSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyEntry" ADD CONSTRAINT "LoyaltyEntry_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "CustomerMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyEntry" ADD CONSTRAINT "LoyaltyEntry_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxProfile" ADD CONSTRAINT "TaxProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxProfile" ADD CONSTRAINT "TaxProfile_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxInvoice" ADD CONSTRAINT "TaxInvoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxInvoice" ADD CONSTRAINT "TaxInvoice_taxProfileId_fkey" FOREIGN KEY ("taxProfileId") REFERENCES "TaxProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxInvoice" ADD CONSTRAINT "TaxInvoice_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
