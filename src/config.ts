/**
 * Reads `<agent-dir>/jev-suggest.json`. Missing file means defaults; anything malformed is
 * rejected as a whole so a typo cannot silently fall back to behaviour the user did not choose.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { JevEndpoint, JevIdentity } from "./jev.ts";

export interface SuggestConfig {
  shortcut: string;
  jev: JevEndpoint;
}

export type ConfigResult = { ok: true; config: SuggestConfig } | { ok: false; error: string };

const IDENTITIES: readonly JevIdentity[] = ["exact", "prefix", "none"];
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

export const DEFAULTS: SuggestConfig = {
  shortcut: "ctrl+space",
  jev: {
    url: "https://api.typesafe.ai/v1/systemone",
    model: "jev-1.13.0",
    keyEnv: "TYPESAFE_API_KEY",
    identity: "exact",
    timeoutMs: 8_000,
  },
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

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T | undefined {
  if (value === undefined) return fallback;
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

export function parseConfig(raw: unknown, path: string): ConfigResult {
  const fail = (error: string): ConfigResult => ({ ok: false, error: `${path} ${error}` });
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return fail("顶层必须是对象");

  const root = raw as Record<string, unknown>;
  const unknown = Object.keys(root).filter((key) => key !== "shortcut" && key !== "jev");
  if (unknown.length > 0) return fail(`存在未知字段：${unknown.join(", ")}`);

  const shortcut = root.shortcut === undefined ? DEFAULTS.shortcut : root.shortcut;
  if (typeof shortcut !== "string" || !isValidShortcut(shortcut)) {
    return fail(`shortcut 不是合法按键：${JSON.stringify(root.shortcut)}`);
  }

  const jev = root.jev === undefined ? {} : root.jev;
  if (jev === null || typeof jev !== "object" || Array.isArray(jev)) return fail("jev 必须是对象");
  const jevEntries = jev as Record<string, unknown>;
  const unknownJev = Object.keys(jevEntries).filter(
    (key) => !["url", "model", "keyEnv", "identity", "timeoutMs"].includes(key),
  );
  if (unknownJev.length > 0) return fail(`jev 存在未知字段：${unknownJev.join(", ")}`);

  const url = jevEntries.url ?? DEFAULTS.jev.url;
  if (typeof url !== "string" || !/^https?:\/\//.test(url)) return fail(`jev.url 必须是 http(s) 地址：${JSON.stringify(url)}`);

  const model = jevEntries.model ?? DEFAULTS.jev.model;
  if (typeof model !== "string" || model.trim() === "") return fail("jev.model 必须是非空字符串");

  const keyEnv = jevEntries.keyEnv ?? DEFAULTS.jev.keyEnv;
  if (typeof keyEnv !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(keyEnv)) {
    return fail(`jev.keyEnv 必须是环境变量名：${JSON.stringify(keyEnv)}`);
  }

  const identity = pick(jevEntries.identity, IDENTITIES, DEFAULTS.jev.identity);
  if (identity === undefined) return fail(`jev.identity 只能是 ${IDENTITIES.join(" / ")}`);

  const timeoutMs = jevEntries.timeoutMs ?? DEFAULTS.jev.timeoutMs;
  if (typeof timeoutMs !== "number" || !Number.isInteger(timeoutMs) || timeoutMs < 500 || timeoutMs > 60_000) {
    return fail(`jev.timeoutMs 必须是 500-60000 的整数：${JSON.stringify(timeoutMs)}`);
  }

  return { ok: true, config: { shortcut, jev: { url, model, keyEnv, identity, timeoutMs } } };
}

export function loadConfig(): ConfigResult {
  const path = configPath();
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ok: true, config: DEFAULTS };
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
