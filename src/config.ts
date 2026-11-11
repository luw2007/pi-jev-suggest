/**
 * Reads `<agent-dir>/jev-suggest.json`. Missing file means defaults; anything malformed is
 * rejected as a whole so a typo cannot silently fall back to behaviour the user did not choose.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { LOCALE_NAMES } from "./locales/index.ts";
import { BUILTIN_TAG_IDS, type CustomTag } from "./tags.ts";
import type { JevEndpoint, JevIdentity } from "./jev.ts";

export interface SuggestConfig {
  locale: string;
  shortcut: string;
  jev: JevEndpoint;
  tags: readonly CustomTag[];
  /** Reply pools that replace a tag's built-in pool, keyed by tag id. */
  options: Readonly<Record<string, readonly string[]>>;
}

export type ConfigResult = { ok: true; config: SuggestConfig } | { ok: false; error: string };

type Fail = (error: string) => { ok: false; error: string };
type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const IDENTITIES: readonly JevIdentity[] = ["exact", "prefix", "none"];
const TAG_ID = /^[a-z][a-z0-9_-]{0,31}$/;
const MODIFIERS = new Set(["ctrl", "shift", "alt", "super"]);
const NAMED_KEYS = new Set([
  "escape",
  "esc",
  "enter",
  "return",
  "tab",
  "space",
  "backspace",
  "delete",
  "insert",
  "clear",
  "home",
  "end",
  "pageup",
  "pagedown",
  "up",
  "down",
  "left",
  "right",
  ...Array.from({ length: 12 }, (_, index) => `f${index + 1}`),
]);
const SYMBOL_KEYS = new Set("`-=[];',./!@#$%^&*()_+|~{}:<>?".split(""));
const TOP_KEYS = ["locale", "shortcut", "jev", "tags", "options"];
const JEV_KEYS = ["url", "model", "keyEnv", "identity", "timeoutMs"];

export const DEFAULTS: Omit<SuggestConfig, "locale"> = {
  shortcut: "ctrl+space",
  jev: {
    url: "https://api.typesafe.ai/v1/systemone",
    model: "jev-1.13.0",
    keyEnv: "TYPESAFE_API_KEY",
    identity: "exact",
    timeoutMs: 8_000,
  },
  tags: [],
  options: {},
};

/** Pi key syntax: modifier+...+key (see Pi docs/keybindings.md). */
export function isValidShortcut(value: string): boolean {
  const parts = value.toLowerCase().split("+");
  const key = parts.pop();
  if (!key) return false;
  if (parts.some((part) => !MODIFIERS.has(part)) || new Set(parts).size !== parts.length) return false;
  return /^[a-z0-9]$/.test(key) || NAMED_KEYS.has(key) || SYMBOL_KEYS.has(key);
}

function configPath(): string {
  const agentDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
  return join(agentDir, "jev-suggest.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringList(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  return value.every((item) => typeof item === "string" && item.trim() !== "") ? (value as string[]) : undefined;
}

function parseTags(value: unknown, fail: Fail): Parsed<readonly CustomTag[]> {
  if (value === undefined) return { ok: true, value: [] };
  if (!Array.isArray(value)) return fail("tags 必须是数组");

  const tags: CustomTag[] = [];
  for (const [index, entry] of value.entries()) {
    const at = `tags[${index}]`;
    if (!isRecord(entry)) return fail(`${at} 必须是对象`);
    const unknown = Object.keys(entry).filter((key) => !["id", "label", "criteria", "replies"].includes(key));
    if (unknown.length > 0) return fail(`${at} 存在未知字段：${unknown.join(", ")}`);

    const id = entry.id;
    if (typeof id !== "string" || !TAG_ID.test(id)) return fail(`${at}.id 必须是 ${TAG_ID.source} 形式的标识符`);
    if (BUILTIN_TAG_IDS.includes(id)) return fail(`${at}.id 与内置标签重名，改内置标签请用 options`);
    if (tags.some((tag) => tag.id === id)) return fail(`${at}.id 重复：${id}`);

    const label = entry.label;
    if (typeof label !== "string" || label.trim() === "") return fail(`${at}.label 必须是非空字符串`);
    const criteria = entry.criteria;
    if (typeof criteria !== "string" || criteria.trim() === "") return fail(`${at}.criteria 必须是非空字符串`);
    const replies = stringList(entry.replies);
    if (!replies) return fail(`${at}.replies 必须是非空的非空字符串数组`);

    tags.push({ id, label, criteria, replies });
  }
  return { ok: true, value: tags };
}

function parseOptions(value: unknown, tagIds: readonly string[], fail: Fail): Parsed<Readonly<Record<string, readonly string[]>>> {
  if (value === undefined) return { ok: true, value: {} };
  if (!isRecord(value)) return fail("options 必须是对象");

  const options: Record<string, readonly string[]> = {};
  for (const [id, replies] of Object.entries(value)) {
    if (!tagIds.includes(id)) {
      return fail(`options.${id} 不是已知标签（可用：${tagIds.join(", ")}；自定义标签请同时写进 tags）`);
    }
    const list = stringList(replies);
    if (!list) return fail(`options.${id} 必须是非空的非空字符串数组`);
    options[id] = list;
  }
  return { ok: true, value: options };
}

export function parseConfig(raw: unknown, path: string): ConfigResult {
  const fail: Fail = (error) => ({ ok: false, error: `${path} ${error}` });
  if (!isRecord(raw)) return fail("顶层必须是对象");

  const unknown = Object.keys(raw).filter((key) => !TOP_KEYS.includes(key));
  if (unknown.length > 0) return fail(`存在未知字段：${unknown.join(", ")}`);

  const locale = raw.locale ?? "en";
  if (typeof locale !== "string" || !LOCALE_NAMES.includes(locale)) {
    return fail(`locale 只能是 ${LOCALE_NAMES.join(" / ")}：${JSON.stringify(raw.locale)}`);
  }

  const shortcut = raw.shortcut === undefined ? DEFAULTS.shortcut : raw.shortcut;
  if (typeof shortcut !== "string" || !isValidShortcut(shortcut)) {
    return fail(`shortcut 不是合法按键：${JSON.stringify(raw.shortcut)}`);
  }

  const jev = raw.jev === undefined ? {} : raw.jev;
  if (!isRecord(jev)) return fail("jev 必须是对象");
  const unknownJev = Object.keys(jev).filter((key) => !JEV_KEYS.includes(key));
  if (unknownJev.length > 0) return fail(`jev 存在未知字段：${unknownJev.join(", ")}`);

  const url = jev.url ?? DEFAULTS.jev.url;
  if (typeof url !== "string" || !/^https?:\/\//.test(url)) return fail(`jev.url 必须是 http(s) 地址：${JSON.stringify(url)}`);

  const model = jev.model ?? DEFAULTS.jev.model;
  if (typeof model !== "string" || model.trim() === "") return fail("jev.model 必须是非空字符串");

  const keyEnv = jev.keyEnv ?? DEFAULTS.jev.keyEnv;
  if (typeof keyEnv !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(keyEnv)) {
    return fail(`jev.keyEnv 必须是环境变量名：${JSON.stringify(keyEnv)}`);
  }

  const identity = jev.identity ?? DEFAULTS.jev.identity;
  if (typeof identity !== "string" || !IDENTITIES.includes(identity as JevIdentity)) {
    return fail(`jev.identity 只能是 ${IDENTITIES.join(" / ")}`);
  }

  const timeoutMs = jev.timeoutMs ?? DEFAULTS.jev.timeoutMs;
  if (typeof timeoutMs !== "number" || !Number.isInteger(timeoutMs) || timeoutMs < 500 || timeoutMs > 60_000) {
    return fail(`jev.timeoutMs 必须是 500-60000 的整数：${JSON.stringify(timeoutMs)}`);
  }

  const tags = parseTags(raw.tags, fail);
  if (!tags.ok) return tags;
  const options = parseOptions(raw.options, [...BUILTIN_TAG_IDS, ...tags.value.map((tag) => tag.id)], fail);
  if (!options.ok) return options;

  return {
    ok: true,
    config: {
      locale,
      shortcut,
      jev: { url, model, keyEnv, identity: identity as JevIdentity, timeoutMs },
      tags: tags.value,
      options: options.value,
    },
  };
}

export function loadConfig(): ConfigResult {
  const path = configPath();
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ok: true, config: { locale: "en", ...DEFAULTS } };
    return { ok: false, error: `${path} 读取失败：${(error as Error).message}` };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: `${path} 不是合法 JSON：${(error as Error).message}` };
  }
  return parseConfig(raw, path);
}
