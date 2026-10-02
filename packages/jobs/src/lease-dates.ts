export function getCalendarDate(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year!.padStart(4, "0")}-${value.month}-${value.day}`;
}

export function getStartOfCalendarDate(date: string, timeZone: string) {
  const midnightUtc = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(midnightUtc) || new Date(midnightUtc).toISOString().slice(0, 10) !== date) {
    throw new Error("Invalid calendar date.");
  }

  let low = midnightUtc - 36 * 60 * 60 * 1000;
  let high = midnightUtc + 36 * 60 * 60 * 1000;
  while (low < high) {
    const midpoint = Math.floor((low + high) / 2);
    if (getCalendarDate(new Date(midpoint), timeZone) < date) low = midpoint + 1;
    else high = midpoint;
  }
  if (getCalendarDate(new Date(low), timeZone) !== date) {
    throw new Error(`Calendar date ${date} does not exist in ${timeZone}.`);
  }
  return new Date(low);
}
