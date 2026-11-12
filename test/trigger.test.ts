import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import extension from "../src/extension.ts";
import { parseConfig } from "../src/config.ts";

const oldFetch = globalThis.fetch;
const oldDir = process.env.PI_CODING_AGENT_DIR;
const oldKey = process.env.TYPESAFE_API_KEY;
let dir = "";

afterEach(() => {
  globalThis.fetch = oldFetch;
  if (oldDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = oldDir;
  if (oldKey === undefined) delete process.env.TYPESAFE_API_KEY; else process.env.TYPESAFE_API_KEY = oldKey;
  if (dir) rmSync(dir, { recursive: true, force: true });
});

function harness(overrides: Record<string, unknown> = {}) {
  dir = mkdtempSync(join(tmpdir(), "jev-test-"));
  writeFileSync(join(dir, "jev-suggest.json"), JSON.stringify({ locale: "en", minIntervalMs: 1000, ...overrides }));
  process.env.PI_CODING_AGENT_DIR = dir;
  process.env.TYPESAFE_API_KEY = "test";
  let calls = 0;
  const notices: string[] = [];
  globalThis.fetch = (async () => {
    calls++;
    return new Response(JSON.stringify({ model: "jev-1.13.0", answers: { next_request: { type: "choice", choice: "verify" } } }));
  }) as typeof fetch;
  const handlers: Record<string, Function> = {};
  let command: Function = () => {};
  const pi = { on: (name: string, handler: Function) => { handlers[name] = handler; }, registerShortcut: () => {}, registerCommand: (_name: string, def: { handler: Function }) => { command = def.handler; } };
  let editor = "";
  const ctx = { mode: "tui", hasUI: true, ui: { setWidget: () => {}, setStatus: () => {}, notify: (text: string) => notices.push(text), getEditorText: () => editor, setEditorText: (text: string) => { editor = text; } } };
  extension(pi as never);
  const emit = async (name: string, event: object = {}) => { await handlers[name]?.(event, ctx); };
  const input = async (source = "interactive", text = "hello") => emit("input", { text, source });
  const reply = async (stopReason = "stop", text = "answer") => emit("message_end", { message: { role: "assistant", stopReason, content: [{ type: "text", text }] } });
  const settle = async (aborted = false) => emit("agent_settled", { aborted });
  return { emit, input, reply, settle, command: () => command("", ctx), calls: () => calls, notices, setEditor: (text: string) => { editor = text; }, ctx };
}

describe("request triggers", () => {
  test("validates auto, cooldown and duration configuration", () => {
    expect(parseConfig({}, "test", []).ok).toBe(true);
    for (const value of [0, 999, 86_400_001, 1.5, null, "1000"])
      expect(parseConfig({ minIntervalMs: value }, "test", []).ok).toBe(false);
    for (const value of [1_000, 3_600_000, 86_400_000]) expect(parseConfig({ minIntervalMs: value }, "test", []).ok).toBe(true);
    for (const [text, ms] of [["45s", 45_000], ["10m", 600_000], ["1h30m", 5_400_000], ["1d", 86_400_000]] as const) {
      const parsed = parseConfig({ minIntervalMs: text }, "test", []);
      expect(parsed.ok && parsed.config.minIntervalMs === ms).toBe(true);
    }
    for (const text of ["500ms", "2d", "30", "1x", "1m30s1m", "", "1sec"])
      expect(parseConfig({ minIntervalMs: text }, "test", []).ok).toBe(false);
    for (const value of ["yes", 1, null]) expect(parseConfig({ auto: value }, "test", []).ok).toBe(false);
    expect(parseConfig({ auto: false }, "test", []).ok).toBe(true);
  });

  test("only settled interactive turns with a successful nonempty final answer trigger", async () => {
    const h = harness();
    await h.emit("session_start");
    await h.input("extension"); await h.emit("agent_start"); await h.reply(); await h.settle();
    await h.input(); await h.emit("agent_start"); await h.reply("error"); await h.settle();
    await h.input(); await h.emit("agent_start"); await h.reply("toolUse"); await h.settle();
    await h.input(); await h.emit("agent_start"); await h.reply("stop", "  "); await h.settle();
    await h.input(); await h.emit("agent_start"); await h.reply(); await h.settle(true);
    await h.emit("agent_start"); await h.reply(); await h.settle();
    expect(h.calls()).toBe(0);
    await h.input(); await h.emit("agent_start"); await h.reply(); await h.settle();
    await h.settle();
    expect(h.calls()).toBe(1);
  });

  test("manual requests bypass the cooldown; automatic ones share it, and auto:false keeps manual", async () => {
    const h = harness();
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      throw new Error("offline");
    }) as typeof fetch;
    await h.command();
    await h.command();
    expect(calls).toBe(2);
    await h.input(); await h.emit("agent_start"); await h.reply(); await h.settle();
    await h.emit("session_start");
    await h.input(); await h.emit("agent_start"); await h.reply(); await h.settle();
    expect(calls).toBe(2);
    await Bun.sleep(1050);
    await h.input(); await h.emit("agent_start"); await h.reply(); await h.settle();
    expect(calls).toBe(3);

    const manual = harness({ auto: false });
    let manualCalls = 0;
    globalThis.fetch = (async () => {
      manualCalls++;
      return new Response(JSON.stringify({ model: "jev-1.13.0", answers: { next_request: { type: "choice", choice: "verify" } } }));
    }) as typeof fetch;
    await manual.emit("session_start");
    await manual.input(); await manual.emit("agent_start"); await manual.reply(); await manual.settle();
    expect(manualCalls).toBe(0);
    await manual.command();
    expect(manualCalls).toBe(1);
  });

  test("editor and non-TUI checks happen before requests; tree navigation drops stale context", async () => {
    const h = harness();
    h.setEditor("draft"); await h.command();
    await h.input(); await h.emit("agent_start"); await h.reply(); await h.settle();
    expect(h.calls()).toBe(0);
    h.setEditor("");
    await h.input(); await h.emit("agent_start"); await h.reply(); await h.emit("session_tree"); await h.settle();
    expect(h.calls()).toBe(0);
    h.ctx.mode = "rpc";
    await h.input(); await h.emit("agent_start"); await h.reply(); await h.settle();
    expect(h.calls()).toBe(0);
  });
});
