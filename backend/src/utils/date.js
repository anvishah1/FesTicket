/**
 * Safely parse an optional date string coming from the frontend.
 * Treats empty strings or invalid dates as null so Prisma never receives
 * `new Date("Invalid Date")`.
 *
 * @param {string|Date|null|undefined} value
 * @returns {Date|null}
 */
export function safeDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
