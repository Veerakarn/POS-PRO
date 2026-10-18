export function normalizeThaiPhone(value: string) {
  const compact = value.replace(/[^\d+]/g, "");
  const digits = compact.replace(/^\+/, "");
  const national = digits.startsWith("66") && digits.length === 11 ? `0${digits.slice(2)}` : digits;
  return /^0[6-9]\d{8}$/.test(national) ? national : null;
}

export function isTaxProfileTestModeEnabled() {
  const explicitlyEnabled = process.env.TAX_PROFILE_TEST_MODE === "true";
  const isProduction = process.env.VERCEL_ENV === "production"
    || (process.env.NODE_ENV === "production" && process.env.VERCEL_ENV !== "preview");
  return explicitlyEnabled && !isProduction;
}

export function calculateVat(baseSatang: number, rateBps: number, included: boolean) {
  if (!Number.isSafeInteger(baseSatang) || baseSatang < 0 || !Number.isInteger(rateBps) || rateBps < 0 || rateBps > 20_000) {
    throw new Error("Invalid VAT input");
  }
  const vatSatang = included
    ? Math.round(baseSatang * rateBps / (10_000 + rateBps))
    : Math.round(baseSatang * rateBps / 10_000);
  return { vatSatang, totalSatang: included ? baseSatang : baseSatang + vatSatang };
}

export function earnedPoints(taxableSatang: number, intervalSatang: number, pointsPerInterval: number) {
  if (!Number.isSafeInteger(taxableSatang) || taxableSatang < 0 || !Number.isInteger(intervalSatang) || intervalSatang < 100 || !Number.isInteger(pointsPerInterval) || pointsPerInterval < 1) {
    throw new Error("Invalid membership input");
  }
  return Math.floor(taxableSatang / intervalSatang) * pointsPerInterval;
}

export function redemptionSatang(balancePoints: number, pointsPerBaht: number, billTotalSatang: number, capPercent: number) {
  if (![balancePoints, pointsPerBaht, billTotalSatang, capPercent].every(Number.isSafeInteger) || balancePoints < 0 || pointsPerBaht < 1 || billTotalSatang < 0 || capPercent < 1 || capPercent > 100) {
    throw new Error("Invalid reward redemption input");
  }
  const value = Math.floor(balancePoints / pointsPerBaht) * 100;
  return Math.min(value, Math.floor(billTotalSatang * capPercent / 100));
}

export function isThaiTaxId(value: string) {
  if (!/^\d{13}$/.test(value)) return false;
  let total = 0;
  for (let i = 0; i < 12; i += 1) total += Number(value[i]) * (13 - i);
  return (11 - (total % 11)) % 10 === Number(value[12]);
}
