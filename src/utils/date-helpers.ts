/**
 * Shorten weeknote titles from "Week of [Month] [Day], [Year]" to "[Month] [Day][suffix]"
 * @param title - The weeknote title to shorten
 * @returns The shortened title
 */
export function shortenWeeknoteTitles(title: string): string {
  // Match "Week of [Month] [Day], [Year]" pattern
  const match = title.match(/Week of (\w+) (\d+)(?:st|nd|rd|th)?,? (\d+)/);
  if (!match) return title;

  const [, monthName, day, year] = match;

  // Parse the date string
  const date = new Date(`${monthName} ${day}, ${year}`);
  if (isNaN(date.getTime())) return title;

  // Get short month name
  const shortMonth = date.toLocaleDateString("en-US", { month: "short" });

  // Add proper suffix to day
  const dayNum = parseInt(day);
  const suffix = getOrdinalSuffix(dayNum);

  return `${shortMonth} ${day}${suffix}`;
}

/**
 * Get ordinal suffix for a number (st, nd, rd, th)
 * @param n - The number to get suffix for
 * @returns The ordinal suffix
 */
export function getOrdinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

/**
 * Convert date string from various formats to ISO format (YYYY-MM-DD)
 * @param dateString - The date string to convert
 * @returns The date in ISO format
 */
export function convertDateFormat(dateString: string): string {
  // Handle "Apr 18, 2025" format
  const monthDayYear = dateString.match(/^(\w{3})\s+(\d{1,2}),?\s+(\d{4})$/);
  if (monthDayYear) {
    const [, month, day, year] = monthDayYear;
    const date = new Date(`${month} ${day}, ${year}`);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split("T")[0];
    }
  }

  // Handle DD-MM-YYYY format (convert to ISO)
  const dashParts = dateString.split("-");
  if (dashParts.length === 3 && dashParts[0].length <= 2) {
    const day = dashParts[0].padStart(2, "0");
    const month = dashParts[1].padStart(2, "0");
    const year = dashParts[2];

    // Create date and validate it
    const date = new Date(`${year}-${month}-${day}`);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split("T")[0];
    }
  }

  // Check if it's already in ISO format (YYYY-MM-DD)
  const isoPattern = /^\d{4}-\d{2}-\d{2}$/;
  if (isoPattern.test(dateString)) {
    return dateString;
  }

  // If format doesn't match any expected pattern, log error and return original
  console.error(
    `Unrecognized date format: "${dateString}". Expected formats: "Apr 18, 2025", "DD-MM-YYYY", or "YYYY-MM-DD"`,
  );
  return dateString;
}
