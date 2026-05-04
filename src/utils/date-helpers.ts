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
