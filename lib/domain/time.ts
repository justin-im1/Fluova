export type TimeBucket = "morning" | "afternoon" | "evening" | "night";

/**
 * Get time bucket from the browser's local clock.
 * Use this on the client side; use getTimeBucket() on the server (UTC).
 */
export function getLocalTimeBucket(): TimeBucket {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

/**
 * Get day of week (0=Sunday, 6=Saturday) from ISO date string.
 */
export function getDayOfWeek(isoDate: string): number {
  const date = new Date(isoDate);
  return date.getUTCDay();
}

/**
 * Get time bucket from hour (UTC).
 * morning 5–11, afternoon 12–16, evening 17–21, night 22–4
 */
export function getTimeBucket(isoDate: string): TimeBucket {
  const date = new Date(isoDate);
  const hour = date.getUTCHours();

  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}
