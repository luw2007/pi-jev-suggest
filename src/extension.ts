/**
 * Pi extension: after a run settles, ask JEV which tag the user is about to type, then show one
 * randomly chosen reply from that tag's pool. The suggestion only fills the editor; it is never sent.
 */
import { randomInt } from "node:crypto";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadConfig, type SuggestConfig } from "./config.ts";
import { choose, describeFailure } from "./jev.ts";
import { resolveLocale } from "./locales/index.ts";
import { resolveTags, type Tag } from "./tags.ts";

const WIDGET_KEY = "jev-suggest";
const COMMAND = "jev-suggest";
const QUESTION_ID = "next_request";
const QUESTION_TEXT = "Which single request is the user most likely to type next, given this coding session?";
/** Trailing characters of each side of the exchange sent to JEV. */
const STATE_CHARS = 1_200;

let config: SuggestConfig | undefined;
let tags: readonly Tag[] = [];
let criteria: Record<string, string> = {};
let lastUser = "";
let lastAssistant = "";
let runReplied = false;
let suggestion: { tag: Tag; text: string } | undefined;
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

export default function jevSuggest(pi: ExtensionAPI): void {
  const loaded = loadConfig();
  config = loaded.ok ? loaded.config : undefined;
  const locale = resolveLocale(config?.locale);
  if (config) {
    tags = resolveTags(locale, config.tags, config.options);
    criteria = Object.fromEntries(tags.map((tag) => [tag.id, tag.criteria]));
  }

  const clear = (ctx: ExtensionContext): void => {
    suggestion = undefined;
    if (ctx.hasUI) ctx.ui.setWidget(WIDGET_KEY, undefined);
  };

  const request = async (ctx: ExtensionContext, verbose: boolean): Promise<void> => {
    const active = config;
    if (!active || ctx.mode !== "tui" || !ctx.hasUI) return;
    // A suggestion must never overwrite what the user is already typing.
    if (ctx.ui.getEditorText().trim() !== "") return;

    const key = process.env[active.jev.keyEnv];
    if (key === undefined) {
      if (verbose) ctx.ui.notify(locale.missingKey(active.jev.keyEnv), "warning");
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
      { id: QUESTION_ID, instructions: QUESTION_TEXT, criteria },
      controller.signal,
    );
    if (current !== generation || controller.signal.aborted) return;
    if (!result.ok) {
      if (verbose) ctx.ui.notify(locale.requestFailed(describeFailure(result.failure)), "error");
      return;
    }

    const tag = tags.find((candidate) => candidate.id === result.choice);
    if (!tag) return;
    const text = tag.replies[randomInt(tag.replies.length)]!;
    suggestion = { tag, text };
    ctx.ui.setWidget(WIDGET_KEY, [locale.widget(tag.label, text, locale.hint(active.shortcut))], {
      placement: "belowEditor",
    });
  };

  pi.on("session_start", (_event, ctx) => {
    lastUser = "";
    lastAssistant = "";
    runReplied = false;
    clear(ctx);
    if (!loaded.ok) {
      ctx.ui.notify(locale.configInvalid(loaded.error), "error");
      return;
    }
    if (process.env[loaded.config.jev.keyEnv] === undefined) {
      ctx.ui.setStatus(WIDGET_KEY, locale.missingKey(loaded.config.jev.keyEnv));
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
      description: locale.shortcutDescription,
      handler: (ctx: ExtensionContext) => {
        if (!suggestion) return;
        if (ctx.ui.getEditorText().trim() !== "") {
          ctx.ui.notify(locale.editorNotEmpty, "warning");
          return;
        }
        ctx.ui.setEditorText(suggestion.text);
        clear(ctx);
      },
    });
  }

  pi.registerCommand(COMMAND, {
    description: locale.commandDescription,
    handler: async (_args, ctx) => {
      if (!config) {
        ctx.ui.notify(locale.configInvalid(loaded.ok ? "" : loaded.error), "error");
        return;
      }
      await request(ctx, true);
    },
  });
}
