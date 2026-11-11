/**
 * Built-in intents. `criteria` is model-facing and stays English so the JEV request is stable
 * across locales; labels and reply pools live in `locales/`.
 */
export interface BuiltinTag {
  id: string;
  criteria: string;
}

export const BUILTIN_TAGS: readonly BuiltinTag[] = [
  {
    id: "continue",
    criteria: "Proceed with the current work without new analysis or confirmation.",
  },
  {
    id: "plan",
    criteria: "Analyze, plan, or explain before changing anything.",
  },
  {
    id: "correct",
    criteria: "Challenge or correct the assistant's premise, evidence, or conclusion.",
  },
  {
    id: "simplify",
    criteria: "Reduce complexity, over-engineering, or scope.",
  },
  {
    id: "status",
    criteria: "Ask about progress, current state, blockers, or remaining work.",
  },
  {
    id: "verify",
    criteria: "Require verification, testing, or delivery evidence.",
  },
  {
    id: "style",
    criteria: "Change how the answer is written: language, length, or format.",
  },
  {
    id: "feedback",
    criteria: "Acknowledge, approve, thank, or give brief evaluative feedback.",
  },
];

export const BUILTIN_TAG_IDS = BUILTIN_TAGS.map((tag) => tag.id);

/** One tag as it will be sent to JEV and shown in the widget. */
export interface Tag {
  id: string;
  label: string;
  criteria: string;
  replies: readonly string[];
}

/** A tag the user adds in config; it carries its own label and reply pool. */
export interface CustomTag {
  id: string;
  label: string;
  criteria: string;
  replies: readonly string[];
}

/** Effective tag list: built-ins localized, then option overrides, then custom tags appended. */
export function resolveTags(
  locale: Locale,
  custom: readonly CustomTag[],
  options: Readonly<Record<string, readonly string[]>>,
): Tag[] {
  const builtin = BUILTIN_TAGS.map((tag) => {
    const localized = locale.tags[tag.id]!;
    return {
      id: tag.id,
      label: localized.label,
      criteria: tag.criteria,
      replies: options[tag.id] ?? localized.replies,
    };
  });
  return [...builtin, ...custom.map((tag) => ({ ...tag, replies: options[tag.id] ?? tag.replies }))];
}

/** Locale pack: UI text plus a label and reply pool for every built-in tag. */
export interface LocaleTag {
  label: string;
  replies: readonly string[];
}

export interface Locale {
  name: string;
  widget: (label: string, text: string, hint: string) => string;
  hint: (shortcut: string) => string;
  editorNotEmpty: string;
  missingKey: (env: string) => string;
  configInvalid: (error: string) => string;
  requestFailed: (detail: string) => string;
  commandDescription: string;
  shortcutDescription: string;
  tags: Record<string, LocaleTag>;
}
