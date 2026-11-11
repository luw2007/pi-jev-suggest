/** Tag types and the merge of data + config into the effective classification set. */
import type { LocaleData, TagSpec } from "./data.ts";

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

/**
 * Built-in tags in data order, localized, with `options` replacing a pool; custom tags appended.
 * The locale covers every spec id (validated by the loader), so the lookup cannot miss.
 */
export function resolveTags(
  specs: readonly TagSpec[],
  locale: LocaleData,
  custom: readonly CustomTag[],
  options: Readonly<Record<string, readonly string[]>>,
): Tag[] {
  const builtin = specs.map((spec) => {
    const localized = locale.tags[spec.id]!;
    return {
      id: spec.id,
      label: localized.label,
      criteria: spec.criteria,
      replies: options[spec.id] ?? localized.replies,
    };
  });
  return [...builtin, ...custom.map((tag) => ({ ...tag, replies: options[tag.id] ?? tag.replies }))];
}
