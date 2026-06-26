export function formatLongDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Timestamp shown on notes, e.g. "6:40pm · Fri, Jun 26 2026".
 *
 * Notes store a naive wall-clock timestamp (no offset), which is read back as
 * a fixed UTC instant. Formatting in UTC therefore renders exactly the time
 * that was authored, regardless of the build server's timezone.
 */
export function formatNoteTimestamp(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const time = `${get("hour")}:${get("minute")}${get("dayPeriod").toLowerCase()}`;
  return `${time} · ${get("weekday")}, ${get("month")} ${get("day")} ${get("year")}`;
}

export function getOrdinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

export function shortenWeeknoteTitles(title: string): string {
  const match = title.match(/Week of (\w+) (\d+)(?:st|nd|rd|th)?,? (\d+)/);
  if (!match) return title;

  const [, monthName, day, year] = match;
  const date = new Date(`${monthName} ${day}, ${year}`);
  if (isNaN(date.getTime())) return title;

  const shortMonth = date.toLocaleDateString("en-US", { month: "short" });
  const suffix = getOrdinalSuffix(parseInt(day));
  return `${shortMonth} ${day}${suffix}`;
}
