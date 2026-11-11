/** Registered locales. Adding a language means adding a file here and listing it. */
import type { Locale } from "../tags.ts";
import { en } from "./en.ts";
import { zhCN } from "./zh-CN.ts";

export const LOCALES: Record<string, Locale> = {
  en,
  "zh-CN": zhCN,
};

export const LOCALE_NAMES = Object.keys(LOCALES);
export const DEFAULT_LOCALE = "en";

/** Picks the locale named in config, then the system locale, else the default. */
export function resolveLocale(requested: string | undefined): Locale {
  if (requested !== undefined) return LOCALES[requested]!;
  const fromEnv = process.env.LC_ALL ?? process.env.LC_MESSAGES ?? process.env.LANG ?? "";
  const normalized = fromEnv.split(".")[0]!.replace("_", "-");
  return LOCALES[normalized] ?? LOCALES[normalized.split("-")[0]!] ?? LOCALES[DEFAULT_LOCALE]!;
}
