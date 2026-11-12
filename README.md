# pi-jev-suggest

[简体中文](README.zh-CN.md)

A [Pi](https://pi.dev) suggestion extension, version **0.4.0**. When a run ends, **JEV** decides which kind of request you are about to type, and one reply from that tag's pool is offered under the editor. Press your shortcut to put it in the editor. Nothing is ever sent for you.

JEV only makes one closed-set decision (one of N tags). It never writes the reply text. Latency and token usage depend on the endpoint, state text and configured tags; neither is fixed. The reply text comes from small, intent-consistent pools for twelve built-in tags, plus anything you add.

## Built-in intents

| Tag | Next request |
| --- | --- |
| `continue` | Continue already authorized work within existing scope and approval boundaries |
| `plan` | Analyze, propose an approach and risks, then wait for confirmation before editing |
| `correct` | Recheck disputed reasoning or requirements before making changes |
| `simplify` | Simplify the implementation without losing required behavior or necessary checks |
| `status` | Report existing progress, verification, blockers and remaining work; don't start new work |
| `verify` | Run relevant existing checks and inspect real behavior, then report evidence and gaps |
| `style` | Make the answer concise and conclusion-first without changing its language or task |
| `feedback` | Acknowledge receipt or thank the assistant, without authorizing further action |
| `review` | Report defects, omissions and compatibility risks with locations and severity; don't edit |
| `fix` | Repair already identified problems within scope and verify the repair |
| `commit` | Commit only this task's changes locally; no push, PR, merge, release or deployment |
| `handoff` | Reply with a self-contained summary for another session; don't write files |

JEV predicts the **next** request, not the category of the previous input. A specific matching action takes precedence over generic continuation. `review` inspects code, `verify` exercises behavior, and `fix` repairs known problems; `status` reports current results, while `handoff` prepares context for another session.

Replies in one pool vary the wording, not the action or permission. Push, deployment, permanent memory updates, language changes and learning requests are not bundled into these built-ins. A suggested request is still only inserted into the editor, never executed or sent automatically.

## Install

```bash
pi install git:github.com/luw2007/pi-jev-suggest
# try it once
pi -e git:github.com/luw2007/pi-jev-suggest
```

Restart Pi. Suggestions require `tui` mode and an available UI. Automatic requests are skipped in all non-TUI modes, including `-p`, `--mode json` and RPC. Manually invoking `/jev-suggest` in those modes reports a TUI-only command error (on stderr in print/JSON mode), without making a request.

## Configure

Config file: `<agent-dir>/jev-suggest.json`, by default `~/.pi/agent/jev-suggest.json` (or the directory set by `PI_CODING_AGENT_DIR`). Run `/reload` after editing.

This example keeps the default shortcut, `ctrl+space`. See [Shortcut compatibility](#shortcut-compatibility) before changing it.

```json
{
  "locale": "en",
  "jev": {
    "url": "https://api.typesafe.ai/v1/systemone",
    "model": "jev-1.13.0",
    "keyEnv": "TYPESAFE_API_KEY",
    "identity": "exact",
    "timeoutMs": 8000
  }
}
```

Missing file means the defaults below, with automatic locale detection. A malformed file, an unknown field, or an invalid key name stops the extension with an explicit error at session start instead of degrading silently.

| Field | Default | Meaning |
| --- | --- | --- |
| `locale` | system locale, else `en` | UI and reply language; must be a file in `data/locales/` (`en`, `zh-CN`) |
| `localeFile` | – | Path to your own locale JSON; replaces `locale`, and the two cannot both be set. Relative paths resolve against the process working directory, not the config directory; `~/` expands to your home directory |
| `shortcut` | `ctrl+space` | Key that inserts the suggestion; syntax from Pi's `docs/keybindings.md` |
| `auto` | `true` | Whether suggestions are requested automatically after a run; `false` keeps `/jev-suggest` manual only |
| `minIntervalMs` | `30000` | Minimum time since the last request (manual attempts and failures included) before the next automatic request; integer milliseconds (1000–86400000) or a duration string such as `"45s"`, `"10m"`, `"1h30m"`, `"1d"` — up to one day |
| `jev.url` | TypeSafe public | JEV choice endpoint |
| `jev.model` | `jev-1.13.0` | `model` in the request body |
| `jev.keyEnv` | `TYPESAFE_API_KEY` | **Name of** the environment variable holding the bearer token; the token never goes in this file |
| `jev.identity` | `exact` | How the response `model` is checked: `exact`, `prefix`, `none` (self-hosted services often need `none`) |
| `jev.timeoutMs` | `8000` | Total deadline per request, 500–60000 |
| `tags` | `[]` | Your own tags, appended to the built-ins |
| `options` | `{}` | Replace a tag's reply pool by tag id |

Self-hosting JEV usually means setting `jev.url`, `jev.model` and `jev.keyEnv`, and `identity: "none"`.

### Shortcut compatibility

The default is `ctrl+space`, not `alt+j`. Configure `shortcut` in `<agent-dir>/jev-suggest.json`, then run `/reload`.

- `ctrl+space` may be intercepted by the operating system or an input method (for example, macOS input-source switching). If it switches input sources instead of inserting the suggestion, change that system binding or choose another extension shortcut.
- `alt+j` is not a universally safe alternative. On macOS, Alt is Option; depending on the terminal and keyboard layout, Option+J may type a character instead of sending an Alt-modified key. It only works if the terminal forwards it as Alt/Meta rather than text.
- Check `/hotkeys` for active Pi bindings and check other extensions, terminal bindings and system shortcuts too. `/hotkeys` cannot detect keys intercepted outside Pi. Verify the chosen key in your terminal with a visible suggestion.

The widget shows the configured key; displaying a hint does not mean the terminal can deliver it.

### Add your own tags

A tag is a classification option: `id` is what JEV answers, `label` is what the widget shows, `criteria` is the model-facing description, `replies` is the pool to pick from. Custom tags are appended to the twelve built-ins and sent in the same request.

```json
{
  "locale": "en",
  "tags": [
    {
      "id": "explain",
      "label": "explain the implementation",
      "criteria": "Explain how the completed implementation works and why it was designed this way, without editing code. Not planning future work or merely shortening an answer.",
      "replies": [
        "explain how this implementation works and why, without changing code",
        "walk me through the implementation and design decisions; don't edit code",
        "help me understand the current implementation and its rationale, without changes"
      ]
    }
  ]
}
```

Rules: `id` must match `^[a-z][a-z0-9_-]{0,31}$`, must not reuse any id in the built-in intents table, and must be unique. Write tags in your own language — `label` and `replies` are never translated for you. Keep every reply in a pool equivalent in action and permission; separate committing, pushing and deploying into distinct custom intents if you need them.

### Replace the replies of any tag

`options` replaces the pool for a tag id, built-in or custom. Keep every entry short: these are messages you would actually type.

```json
{
  "options": {
    "verify": [
      "run the relevant existing checks and report results and gaps",
      "verify actual behavior against the requirements and report the evidence"
    ]
  }
}
```

An `options` key that is not a known tag is a config error, so a typo cannot silently do nothing.

## Behaviour

Editor emptiness checks ignore whitespace-only text.

1. Automatic requests are considered only after a run triggered by nonempty interactive user input settles without abortion, its final assistant message stops successfully with nonempty text, and the editor is empty. After the cooldown, the last raw user input and assistant reply are sent to JEV. Text of up to 1200 Unicode code points each is kept unchanged; longer text keeps the first 600 and last 600 code points, separated by `\n…\n`.
2. JEV returns one tag.
3. Before showing a result, the extension rechecks that the editor is empty. It picks a random reply from the selected tag's pool, excluding every entry equal to the last offered text if there is an alternative. An identical-only pool may repeat; the remembered text resets at session start. The reply is shown:

```text
[jev] suggestion (verify): run the relevant existing checks and report actual results and unverified items    ctrl+space to insert
```

4. The shortcut writes it into the editor; the hint always shows the shortcut you configured. If the editor already has text, you get a notice instead of an overwrite.
5. `/jev-suggest` refreshes manually in TUI mode when the editor is empty and reports failures (missing API key, cooldown, HTTP status, timeout, network failure, invalid JSON or an off-contract response). It does nothing while the editor has text.

Automatic requests are governed by `auto` and `minIntervalMs`: `auto: false` turns them off entirely, leaving only the manual `/jev-suggest`. The cooldown is measured from the start of any request attempt (manual ones, failures, timeouts and cancellations included); automatic requests inside it are skipped, not queued or retried, while manual requests bypass it and run immediately. The interval can be set up to one day, so `{ "minIntervalMs": "1d" }` means at most one automatic suggestion per day. Session changes do not reset the cooldown, but reloading the extension or starting a new process does. Separate Pi processes do not share it, so this is not a global spending cap. Cancellation does not guarantee the server won't charge.

A new input event, run start, session start, tree navigation or shutdown clears the suggestion and cancels any pending request. A new request after the cooldown also cancels the previous one. Requests carry a deadline, and stale results are dropped. Typing into the editor while JEV is pending prevents the result from being shown if the editor is still nonempty when it arrives; insertion also rechecks editor emptiness.

### What is sent, and confidentiality limits

State carries exactly two fields: `lastUserMessage` (raw text from the latest `input` event, before skill or prompt-template expansion) and `lastAssistantReply` (the text parts of the latest assistant message).

The extension does not directly read tool calls or their arguments, tool results, files, thinking/reasoning blocks, expanded skills or prompt templates, the system prompt, or earlier turns for this state. However, raw input may contain sensitive text, and assistant text may repeat file contents, tool results, secrets or earlier context. That text can be sent to the configured JEV endpoint; this is not a guarantee that secrets stay on the machine.

## What the endpoint must accept

```json
{
  "model": "jev-1.13.0",
  "state": { "lastUserMessage": "…", "lastAssistantReply": "…" },
  "questions": {
    "next_request": {
      "type": "choice",
      "instructions": "Which single request is the user most likely to type next, given this coding session?",
      "criteria": { "continue": "…", "plan": "…", "verify": "…" }
    }
  }
}
```

Expected answer:

```json
{
  "model": "jev-1.13.0",
  "answers": { "next_request": { "type": "choice", "choice": "verify", "confidence": 0.82 } }
}
```

`choice` must be a key of `criteria`; `model` is checked per `jev.identity`; other fields are ignored.

## Data files and compatibility

Tags, labels, replies and UI text are data, not code:

- `data/tags.json` — the classification set: tag `id` plus the model-facing `criteria` (English by design, so the request is stable across languages).
- `data/locales/<name>.json` — `ui` templates and a `label` plus reply pool for every tag id.

Both carry `"schema": 1`. The loader checks the schema, requires every UI key and every tag id, and **ignores unknown keys**. Extra keys are tolerated, but missing required tags are not. A breaking shape change bumps `schema` and the loader refuses it with the file and the reason.

When upgrading from the eight-tag set, add `review`, `fix`, `commit` and `handoff` (each with `label` and `replies`) to any private `localeFile`, using the bundled locale as a template. Otherwise setup reports the first missing tag and disables suggestions; there is no silent language fallback. If an existing custom tag uses one of those four ids, rename it, or remove it from `tags` and use `options` to replace the new built-in's reply pool. Existing `options` entries still replace entire pools, so review them for consistent actions and permissions.

UI strings are templates: `{label}`, `{text}`, `{hint}`, `{shortcut}`, `{env}`, `{error}`, `{detail}`.

## Add a language

Copy `data/locales/en.json`, translate `ui` and each tag's `label`/`replies`, save it as `data/locales/<name>.json`, and it appears in `availableLocales()` without code changes. Pull requests welcome.

To keep your language private, create `<agent-dir>/jev-suggest/locales/` and save your translated copy there, outside the installed package so package updates do not overwrite it. This directory is not auto-discovered: you must explicitly set `localeFile`.

With the default agent directory, set this in `~/.pi/agent/jev-suggest.json` (remove `locale` if present), then run `/reload`:

```json
{ "localeFile": "~/.pi/agent/jev-suggest/locales/my.json" }
```

If you set `PI_CODING_AGENT_DIR`, use a path inside that directory instead. `localeFile` does not expand environment variables or resolve relative paths against the agent directory; use an absolute path, or a `~/` path under your home directory.

## Limits

- TUI only.
- JEV being unavailable skips the suggestion; the conversation is unaffected.
- Quality depends on the classification. There is no multi-candidate generation and no learning from what you accept.

## License

MIT
