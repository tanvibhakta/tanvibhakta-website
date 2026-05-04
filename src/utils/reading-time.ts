import readingTime from "reading-time";

const MINIMUM_MINUTES = 5;

export function getReadingTimeMinutes(body: string | undefined): number | null {
  if (!body) return null;
  const minutes = Math.ceil(readingTime(body).minutes);
  return minutes > MINIMUM_MINUTES ? minutes : null;
}
