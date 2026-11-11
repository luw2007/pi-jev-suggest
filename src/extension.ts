/**
 * Pi extension: after a run settles, ask JEV which tag the user is about to type, then show one
 * randomly chosen reply from that tag's pool. The suggestion only fills the editor; it is never sent.
 *
 * No tag or UI text lives here: `data/tags.json`, `data/locales/*.json` or the user's own locale file
 * supply every label, reply and message.
 */
import { randomInt } from "node:crypto";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadConfig, type SuggestConfig } from "./config.ts";
import {
  format,
  loadLocale,
  loadLocaleFile,
  loadTagSpecs,
  pickLocale,
  type Loaded,
  type LocaleData,
  type TagSpec,
  type UIKey,
} from "./data.ts";
import { choose, describeFailure } from "./jev.ts";
import { resolveTags, type Tag } from "./tags.ts";

const WIDGET_KEY = "jev-suggest";
const COMMAND = "jev-suggest";
const QUESTION_ID = "next_request";
const QUESTION_TEXT = "Which single request is the user most likely to type next, given this coding session?";
/** Trailing characters of each side of the exchange sent to JEV. */
const STATE_CHARS = 1_200;

type Setup =
  | { ok: true; config: SuggestConfig; locale: LocaleData; tags: Tag[] }
  | { ok: false; error: string; locale: LocaleData | undefined };

/** English pack, so setup failures can still be phrased when the requested locale is unusable. */
function englishPack(specs: readonly TagSpec[]): LocaleData | undefined {
  const en = loadLocale("en", specs);
  return en.ok ? en.value : undefined;
}

function resolveLocaleData(config: SuggestConfig, specs: readonly TagSpec[]): Loaded<LocaleData> {
  if (config.localeFile) return loadLocaleFile(config.localeFile, specs);
  const name = pickLocale(config.locale);
  return name.ok ? loadLocale(name.value, specs) : name;
}

function setUp(): Setup {
  const specs = loadTagSpecs();
  if (!specs.ok) return { ok: false, error: specs.error, locale: undefined };

  const loaded = loadConfig(specs.value.map((spec) => spec.id));
  if (!loaded.ok) return { ok: false, error: loaded.error, locale: englishPack(specs.value) };

  const locale = resolveLocaleData(loaded.config, specs.value);
  if (!locale.ok) return { ok: false, error: locale.error, locale: englishPack(specs.value) };

  return {
    ok: true,
    config: loaded.config,
    locale: locale.value,
    tags: resolveTags(specs.value, locale.value, loaded.config.tags, loaded.config.options),
  };
}

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
  const setup = setUp();
  const ui = setup.locale?.ui;
  const config = setup.ok ? setup.config : undefined;
  const tags: readonly Tag[] = setup.ok ? setup.tags : [];
  const criteria: Record<string, string> = Object.fromEntries(tags.map((tag) => [tag.id, tag.criteria]));

  let lastUser = "";
  let lastAssistant = "";
  let runReplied = false;
  let suggestion: { text: string } | undefined;
  let generation = 0;
  let inFlight: AbortController | undefined;

  /** Renders a locale message; falls back to the key name if the data is unusable. */
  const say = (key: UIKey, vars: Readonly<Record<string, string>> = {}): string =>
    ui === undefined ? key : format(ui[key], vars);

  const clear = (ctx: ExtensionContext): void => {
    suggestion = undefined;
    if (ctx.hasUI) ctx.ui.setWidget(WIDGET_KEY, undefined);
  };

  const request = async (ctx: ExtensionContext, verbose: boolean): Promise<void> => {
    if (!setup.ok || !config) return;
    if (ctx.mode !== "tui" || !ctx.hasUI) return;
    // A suggestion must never overwrite what the user is already typing.
    if (ctx.ui.getEditorText().trim() !== "") return;

    const key = process.env[config.jev.keyEnv];
    if (key === undefined) {
      if (verbose) ctx.ui.notify(say("missingKey", { env: config.jev.keyEnv }), "warning");
      return;
    }

    generation += 1;
    const current = generation;
    inFlight?.abort();
    const controller = new AbortController();
    inFlight = controller;
    clear(ctx);

    const result = await choose(
      config.jev,
      key,
      { lastUserMessage: lastUser.slice(-STATE_CHARS), lastAssistantReply: lastAssistant.slice(-STATE_CHARS) },
      { id: QUESTION_ID, instructions: QUESTION_TEXT, criteria },
      controller.signal,
    );
    if (current !== generation || controller.signal.aborted) return;
    if (!result.ok) {
      if (verbose) ctx.ui.notify(say("requestFailed", { detail: describeFailure(result.failure) }), "error");
      return;
    }

    const tag = tags.find((candidate) => candidate.id === result.choice);
    if (!tag) return;
    const text = tag.replies[randomInt(tag.replies.length)]!;
    suggestion = { text };
    const line = say("widget", { label: tag.label, text, hint: say("hint", { shortcut: config.shortcut }) });
    ctx.ui.setWidget(WIDGET_KEY, [line], { placement: "belowEditor" });
  };

  pi.on("session_start", (_event, ctx) => {
    lastUser = "";
    lastAssistant = "";
    runReplied = false;
    clear(ctx);
    if (!setup.ok) {
      ctx.ui.notify(say("configInvalid", { error: setup.error }), "error");
      return;
    }
    if (process.env[setup.config.jev.keyEnv] === undefined) {
      ctx.ui.setStatus(WIDGET_KEY, say("missingKey", { env: setup.config.jev.keyEnv }));
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
      description: say("shortcutDescription"),
      handler: (ctx: ExtensionContext) => {
        if (!suggestion) return;
        if (ctx.ui.getEditorText().trim() !== "") {
          ctx.ui.notify(say("editorNotEmpty"), "warning");
          return;
        }
        ctx.ui.setEditorText(suggestion.text);
        clear(ctx);
      },
    });
  }

  pi.registerCommand(COMMAND, {
    description: say("commandDescription"),
    handler: async (_args, ctx) => {
      if (!setup.ok) {
        ctx.ui.notify(say("configInvalid", { error: setup.error }), "error");
        return;
      }
      await request(ctx, true);
    },
  });
}
