/** Shared boundary checks for JSON objects and identifiers used by config and data files. */
export const TAG_ID = /^[a-z][a-z0-9_-]{0,31}$/;
export const LOCALE_NAME = /^[A-Za-z0-9_-]{1,32}$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
