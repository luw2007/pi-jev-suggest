/**
 * Data files, not code: `data/tags.json` defines the classification set, `data/locales/<name>.json`
 * carries UI text and reply pools. Loaders validate what the code needs, ignore unknown keys so a
 * newer data file still works with an older extension, and report the file plus the reason.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const DATA_SCHEMA = 1;

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
const LOCALE_DIR = join(DATA_DIR, "locales");
const TAG_ID = /^[a-z][a-z0-9_-]{0,31}$/;
const LOCALE_NAME = /^[A-Za-z0-9_-]{1,32}$/;

export const UI_KEYS = [
  "widget",
  "hint",
  "editorNotEmpty",
  "missingKey",
  "configInvalid",
  "requestFailed",
  "commandDescription",
  "shortcutDescription",
] as const;
export type UIKey = (typeof UI_KEYS)[number];

export interface TagSpec {
  id: string;
  criteria: string;
}

export interface LocaleTag {
  label: string;
  replies: readonly string[];
}

export interface LocaleData {
  name: string;
  ui: Record<UIKey, string>;
  tags: Record<string, LocaleTag>;
}

export type Loaded<T> = { ok: true; value: T } | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function readJson(path: string): Loaded<unknown> {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return { ok: false, error: code === "ENOENT" ? `${path} 不存在` : `${path} 读取失败：${(error as Error).message}` };
  }
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (error) {
    return { ok: false, error: `${path} 不是合法 JSON：${(error as Error).message}` };
  }
}

function checkSchema(value: unknown, path: string): string | undefined {
  if (!isRecord(value)) return `${path} 顶层必须是对象`;
  if (value.schema !== DATA_SCHEMA) {
    return `${path} 的 schema 是 ${JSON.stringify(value.schema)}，本扩展只支持 ${DATA_SCHEMA}`;
  }
  return undefined;
}

/** The classification set: ids plus the model-facing criteria. */
export function loadTagSpecs(path = join(DATA_DIR, "tags.json")): Loaded<readonly TagSpec[]> {
  const json = readJson(path);
  if (!json.ok) return json;
  const schemaError = checkSchema(json.value, path);
  if (schemaError) return { ok: false, error: schemaError };

  const tags = (json.value as Record<string, unknown>).tags;
  if (!Array.isArray(tags) || tags.length === 0) return { ok: false, error: `${path} 的 tags 必须是非空数组` };

  const specs: TagSpec[] = [];
  for (const [index, entry] of tags.entries()) {
    if (!isRecord(entry)) return { ok: false, error: `${path} tags[${index}] 必须是对象` };
    const id = entry.id;
    if (typeof id !== "string" || !TAG_ID.test(id)) return { ok: false, error: `${path} tags[${index}].id 不合法` };
    if (specs.some((spec) => spec.id === id)) return { ok: false, error: `${path} tags[${index}].id 重复：${id}` };
    const criteria = text(entry.criteria);
    if (!criteria) return { ok: false, error: `${path} tags[${index}].criteria 必须是非空字符串` };
    specs.push({ id, criteria });
  }
  return { ok: true, value: specs };
}

export function availableLocales(): string[] {
  return readdirSync(LOCALE_DIR)
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.slice(0, -".json".length))
    .filter((name) => LOCALE_NAME.test(name))
    .sort();
}

/** A locale file must cover every UI key and every built-in tag. */
function parseLocale(value: unknown, path: string, fallbackName: string, specs: readonly TagSpec[]): Loaded<LocaleData> {
  const schemaError = checkSchema(value, path);
  if (schemaError) return { ok: false, error: schemaError };
  const root = value as Record<string, unknown>;

  const name = text(root.locale) ?? fallbackName;
  const ui = root.ui;
  if (!isRecord(ui)) return { ok: false, error: `${path} 的 ui 必须是对象` };
  const strings = {} as Record<UIKey, string>;
  for (const key of UI_KEYS) {
    const entry = text(ui[key]);
    if (!entry) return { ok: false, error: `${path} 缺少 ui.${key}` };
    strings[key] = entry;
  }

  const tags = root.tags;
  if (!isRecord(tags)) return { ok: false, error: `${path} 的 tags 必须是对象` };
  const localized: Record<string, LocaleTag> = {};
  for (const spec of specs) {
    const entry = tags[spec.id];
    if (!isRecord(entry)) return { ok: false, error: `${path} 缺少 tags.${spec.id}` };
    const label = text(entry.label);
    if (!label) return { ok: false, error: `${path} 的 tags.${spec.id}.label 必须是非空字符串` };
    const replies = entry.replies;
    if (!Array.isArray(replies) || replies.length === 0 || !replies.every((reply) => text(reply) !== undefined)) {
      return { ok: false, error: `${path} 的 tags.${spec.id}.replies 必须是非空的非空字符串数组` };
    }
    localized[spec.id] = { label, replies: replies as string[] };
  }
  return { ok: true, value: { name, ui: strings, tags: localized } };
}

export function loadLocale(name: string, specs: readonly TagSpec[]): Loaded<LocaleData> {
  if (!LOCALE_NAME.test(name)) return { ok: false, error: `语言名不合法：${JSON.stringify(name)}` };
  const path = join(LOCALE_DIR, `${name}.json`);
  const json = readJson(path);
  if (!json.ok) return json;
  return parseLocale(json.value, path, name, specs);
}

/** A user-supplied locale file replaces the built-in lookup entirely. */
export function loadLocaleFile(path: string, specs: readonly TagSpec[]): Loaded<LocaleData> {
  const json = readJson(path);
  if (!json.ok) return json;
  return parseLocale(json.value, path, path, specs);
}

export function detectLocale(): string | undefined {
  const raw = process.env.LC_ALL ?? process.env.LC_MESSAGES ?? process.env.LANG ?? "";
  const normalized = raw.split(".")[0]?.replace("_", "-") ?? "";
  return normalized === "" ? undefined : normalized;
}

/** A requested locale must exist; the detected one may fall through to its language, then `en`. */
export function pickLocale(requested: string | undefined): Loaded<string> {
  const available = availableLocales();
  if (requested !== undefined) {
    return available.includes(requested)
      ? { ok: true, value: requested }
      : { ok: false, error: `没有语言文件 ${requested}（可用：${available.join(", ") || "无"}）` };
  }
  const detected = detectLocale();
  for (const candidate of [detected, detected?.split("-")[0], "en"]) {
    if (candidate !== undefined && available.includes(candidate)) return { ok: true, value: candidate };
  }
  return { ok: false, error: `没有可用的语言文件（可用：${available.join(", ") || "无"}）` };
}

/** `{name}` placeholders; unknown placeholders stay visible instead of disappearing. */
export function format(template: string, vars: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match);
}
