/**
 * Pi extension: after a run settles, ask JEV which of eight intents the user is about to type,
 * then show one randomly chosen fixed reply from that intent's pool as a suggestion.
 * The suggestion only fills the editor; it is never sent automatically.
 */
import { randomInt } from "node:crypto";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadConfig, type SuggestConfig } from "./config.ts";
import { choose, describeFailure } from "./jev.ts";
import { MODES, QUESTION, type Mode } from "./modes.ts";

const WIDGET_KEY = "jev-suggest";
const COMMAND = "jev-suggest";
/** Trailing characters of each side of the exchange sent to JEV. */
const STATE_CHARS = 1_200;

interface Suggestion {
  mode: Mode;
  text: string;
}

let config: SuggestConfig | undefined;
let lastUser = "";
let lastAssistant = "";
let runReplied = false;
let suggestion: Suggestion | undefined;
let generation = 0;
let inFlight: AbortController | undefined;

function textOf(message: unknown): string {
  if (message === null || typeof message !== "object") return "";
  const { content } = message as { content?: unknown };
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) =>
      part !== null && typeof part === "object" && (part as { type?: unknown }).type === "text"
        ? String((part as { text?: unknown }).text ?? "")
        : "",
    )
    .join("\n");
}

function clear(ctx: ExtensionContext): void {
  suggestion = undefined;
  if (ctx.hasUI) ctx.ui.setWidget(WIDGET_KEY, undefined);
}

async function request(ctx: ExtensionContext, verbose: boolean): Promise<void> {
  const active = config;
  if (!active || ctx.mode !== "tui" || !ctx.hasUI) return;
  // A suggestion must never overwrite what the user is already typing.
  if (ctx.ui.getEditorText().trim() !== "") return;

  const key = process.env[active.jev.keyEnv];
  if (key === undefined) {
    if (verbose) ctx.ui.notify(`${COMMAND}: 环境变量 ${active.jev.keyEnv} 未设置`, "warning");
    return;
  }

  generation += 1;
  const current = generation;
  inFlight?.abort();
  const controller = new AbortController();
  inFlight = controller;
  clear(ctx);

  const result = await choose(
    active.jev,
    key,
    { lastUserMessage: lastUser.slice(-STATE_CHARS), lastAssistantReply: lastAssistant.slice(-STATE_CHARS) },
    QUESTION,
    controller.signal,
  );
  if (current !== generation || controller.signal.aborted) return;
  if (!result.ok) {
    if (verbose) ctx.ui.notify(`${COMMAND}: JEV 请求失败（${describeFailure(result.failure)}）`, "error");
    return;
  }

  const mode = MODES.find((candidate) => candidate.id === result.choice);
  if (!mode) return;
  const text = mode.replies[randomInt(mode.replies.length)]!;
  suggestion = { mode, text };
  ctx.ui.setWidget(WIDGET_KEY, [`[jev] 建议（${mode.label}）：${text}    ${active.shortcut} 插入`], {
    placement: "belowEditor",
  });
}

export default function jevSuggest(pi: ExtensionAPI): void {
  const loaded = loadConfig();
  config = loaded.ok ? loaded.config : undefined;

  pi.on("session_start", (_event, ctx) => {
    lastUser = "";
    lastAssistant = "";
    runReplied = false;
    clear(ctx);
    if (!loaded.ok) {
      ctx.ui.notify(`${COMMAND} 配置错误，功能停用：${loaded.error}`, "error");
      return;
    }
    if (process.env[loaded.config.jev.keyEnv] === undefined) {
      ctx.ui.setStatus(WIDGET_KEY, `JEV 建议不可用：缺少 ${loaded.config.jev.keyEnv}`);
    }
  });

  pi.on("input", (event, ctx) => {
    lastUser = event.text;
    clear(ctx);
  });

  pi.on("agent_start", () => {
    runReplied = false;
  });

  pi.on("message_end", (event) => {
    if (event.message.role !== "assistant") return;
    lastAssistant = textOf(event.message);
    runReplied = true;
  });

  pi.on("agent_settled", async (event, ctx) => {
    if (event.aborted || !runReplied) return;
    runReplied = false;
    await request(ctx, false);
  });

  pi.on("session_shutdown", () => {
    generation += 1;
    inFlight?.abort();
    suggestion = undefined;
  });

  if (config) {
    pi.registerShortcut(config.shortcut as Parameters<ExtensionAPI["registerShortcut"]>[0], {
      description: "插入 JEV 建议",
      handler: (ctx: ExtensionContext) => {
        if (!suggestion) return;
        if (ctx.ui.getEditorText().trim() !== "") {
          ctx.ui.notify("输入框已有内容，未插入建议", "warning");
          return;
        }
        ctx.ui.setEditorText(suggestion.text);
        clear(ctx);
      },
    });
  }

  pi.registerCommand(COMMAND, {
    description: "刷新 JEV 下一条消息建议并上屏",
    handler: async (_args, ctx) => {
      if (!config) {
        ctx.ui.notify(`${COMMAND}: 配置错误，功能停用`, "error");
        return;
      }
      await request(ctx, true);
    },
  });
}
