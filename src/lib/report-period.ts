const DAY_MS = 24 * 60 * 60 * 1000;

function bangkokDay(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function validDay(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00+07:00`);
  return Number.isNaN(date.getTime()) ? null : value;
}

export function reportPeriod(fromValue?: string, toValue?: string) {
  const today = bangkokDay(new Date());
  const fallbackFrom = bangkokDay(new Date(Date.now() - 6 * DAY_MS));
  const from = validDay(fromValue) ?? fallbackFrom;
  const to = validDay(toValue) ?? today;
  let start = new Date(`${from}T00:00:00+07:00`);
  let endInclusive = new Date(`${to}T00:00:00+07:00`);
  if (endInclusive < start) [start, endInclusive] = [endInclusive, start];
  if (endInclusive.getTime() - start.getTime() > 92 * DAY_MS) start = new Date(endInclusive.getTime() - 92 * DAY_MS);
  const endExclusive = new Date(endInclusive.getTime() + DAY_MS);
  return {
    from: bangkokDay(start),
    to: bangkokDay(endInclusive),
    start,
    endExclusive,
  };
}

export function bangkokDateKey(date: Date) {
  return bangkokDay(date);
}
