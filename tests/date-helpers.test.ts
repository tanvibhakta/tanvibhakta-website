import { describe, test, expect } from "vitest";
import {
  noteWallClockToInstant,
  shortenWeeknoteTitles,
} from "../src/utils/date-helpers";

describe("noteWallClockToInstant", () => {
  test("converts a naive IST wall clock (parsed as UTC) to the true instant", () => {
    // Authored at 6:40pm IST; stored naive, so it parses as 18:40 UTC.
    const wallClock = new Date("2026-06-26T18:40:00Z");
    expect(noteWallClockToInstant(wallClock).toISOString()).toBe(
      "2026-06-26T13:10:00.000Z",
    );
  });

  test("crosses a date boundary when the wall clock is before 5:30am", () => {
    const wallClock = new Date("2026-01-01T00:15:00Z");
    expect(noteWallClockToInstant(wallClock).toISOString()).toBe(
      "2025-12-31T18:45:00.000Z",
    );
  });
});

describe("shortenWeeknoteTitles", () => {
  test("shortens full month name with ordinal suffix", () => {
    expect(shortenWeeknoteTitles("Week of September 7th, 2025")).toBe(
      "Sep 7th",
    );
    expect(shortenWeeknoteTitles("Week of December 25th, 2024")).toBe(
      "Dec 25th",
    );
    expect(shortenWeeknoteTitles("Week of April 30th, 2025")).toBe("Apr 30th");
  });

  test("shortens abbreviated month with ordinal suffix", () => {
    expect(shortenWeeknoteTitles("Week of Apr 11th, 2026")).toBe("Apr 11th");
    expect(shortenWeeknoteTitles("Week of Aug 23rd, 2025")).toBe("Aug 23rd");
    expect(shortenWeeknoteTitles("Week of Jan 1st, 2025")).toBe("Jan 1st");
  });

  test("adds ordinal suffix when missing from title", () => {
    expect(shortenWeeknoteTitles("Week of Apr 2, 2025")).toBe("Apr 2nd");
    expect(shortenWeeknoteTitles("Week of Mar 26, 2025")).toBe("Mar 26th");
  });

  test("returns original title for unrecognized formats", () => {
    expect(shortenWeeknoteTitles("Month of November, 2025")).toBe(
      "Month of November, 2025",
    );
    expect(shortenWeeknoteTitles("Week of 16 Apr, 2025")).toBe(
      "Week of 16 Apr, 2025",
    );
    expect(shortenWeeknoteTitles("Week of 5th April, 2026")).toBe(
      "Week of 5th April, 2026",
    );
  });
});
